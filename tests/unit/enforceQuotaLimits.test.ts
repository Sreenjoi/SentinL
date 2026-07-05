import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enforceQuotaLimits } from '../../server.js';
import { getTimestamp } from '../../src/utils/entitlements.js';
import * as admin from 'firebase-admin';

// Need to avoid syntax errors if other parts of server try to run
vi.mock('../../server.js', async (importOriginal) => {
    const actual: any = await importOriginal();
    return actual;
});

describe('Date Parsing Component', () => {
   it('supports multiple date formats', () => {
       const ms = Date.now();
       
       // Firestore Native Object Mock
       const fsTimestamp = { toMillis: () => ms, toDate: () => new Date(ms) };
       expect(getTimestamp(fsTimestamp)?.toMillis()).toEqual(ms);
       
       // Javascript Date
       const jsDate = new Date(ms);
       expect(getTimestamp(jsDate)?.toMillis()).toEqual(ms);
       
       // Milliseconds
       expect(getTimestamp(ms)?.toMillis()).toEqual(ms);
       
       // ISO String
       const isoString = jsDate.toISOString();
       expect(getTimestamp(isoString)?.toMillis()).toEqual(ms);
       
       // Null / Undefined
       expect(getTimestamp(null)).toBeNull();
       expect(getTimestamp(undefined)).toBeNull();
       
       // Invalid dates throw
       expect(() => getTimestamp('abc')).toThrow(/Invalid date format/);
   });
});

describe('enforceQuotaLimits', () => {
    let dbMock: any;
    let docsData: Record<string, any>;
    let updates: Record<string, any>;
    let queriedArrays: Record<string, any[]>;

    beforeEach(() => {
        docsData = {};
        updates = {};
        queriedArrays = {}; // Stores arrays of documents returned by where()
        
        dbMock = {
            collection: vi.fn((colName) => ({
                doc: vi.fn((docId) => ({
                    get: vi.fn().mockImplementation(async () => {
                        const path = colName + '/' + docId;
                        if (docsData[path]) {
                            return { exists: true, data: () => docsData[path] };
                        }
                        return { exists: false };
                    }),
                    update: vi.fn().mockImplementation(async (data) => {
                        const path = colName + '/' + docId;
                        updates[path] = { ...updates[path], ...data };
                    }),
                    set: vi.fn().mockImplementation(async (data, opts) => {
                        const path = colName + '/' + docId;
                        updates[path] = { ...updates[path], ...data, __opts: opts };
                    })
                })),
                where: vi.fn((field, op, val) => ({
                    get: vi.fn().mockImplementation(async () => {
                        const key = colName + ':' + field + '_' + op + '_' + val;
                        const dataArray = queriedArrays[key] || [];
                        return {
                            docs: dataArray.map((d, i) => ({
                                id: d.id || 'doc_' + i,
                                data: () => d.data
                            }))
                        };
                    })
                }))
            }))
        };
    });

    it('defers decision on unparseable data (maxSlots defaults to 3 and keeps beta active)', async () => {
        // User sub is invalid format
        docsData['subscriptions/user1_def'] = { accessTier: 'pro_1', expiresAt: 'not a valid date' };
        docsData['moderators/u1_def@test.com'] = { activeServerIds: ['s1_def'] };
        // Server s1 has an invalid date standalone sub
        docsData['subscriptions/s1_def'] = { accessTier: 'premium', expiresAt: 'not a date either' };

        await enforceQuotaLimits('user1_def', 'u1_def@test.com', dbMock);

        // No server deactivated! The updater shouldn't reflect deactivated status
        expect(updates['servers/s1_def']).toBeUndefined();
        // Since it's deferred, modRef keeps it
        expect(updates['moderators/u1_def@test.com']).toBeUndefined(); // or not updated because no demotion needed
    });

    it('active trials are treated properly and give quota', async () => {
        docsData['subscriptions/user1_tri'] = { status: 'trial', accessTier: 'pro_1', trialEnd: Date.now() + 10000 };
        docsData['moderators/u1_tri@test.com'] = { activeServerIds: ['s1_tri', 's2_tri'] };
        
        await enforceQuotaLimits('user1_tri', 'u1_tri@test.com', dbMock);
        
        // user1 has 1 slot (trial maxSlots defaults to 1). They have 2 non-beta servers. One should be deactivated
        expect(updates['servers/s2_tri']).toBeDefined(); // Demoted!
        expect(updates['servers/s2_tri'].active).toBe(false);
        expect(updates['moderators/u1_tri@test.com'].activeServerIds).toEqual(['s1_tri']);
    });

    it('expired subscriptions evaluate to free tier', async () => {
        docsData['subscriptions/user1_exp'] = { status: 'active', accessTier: 'pro_3', expiresAt: Date.now() - 10000 }; // EXPIRED
        docsData['moderators/u1_exp@test.com'] = { activeServerIds: ['s1_exp', 's2_exp'] };
        
        await enforceQuotaLimits('user1_exp', 'u1_exp@test.com', dbMock);
        
        // As expired, maxSlots drops to 1, s2 demoted
        expect(updates['servers/s2_exp']).toBeDefined();
        expect(updates['servers/s2_exp'].active).toBe(false);
    });

    it('three-server plans (pro_3) permit 3 active servers', async () => {
        docsData['subscriptions/user1_pro'] = { status: 'active', accessTier: 'pro_3', expiresAt: Date.now() + 100000 };
        docsData['moderators/u1_pro@test.com'] = { activeServerIds: ['s1_pro', 's2_pro', 's3_pro', 's4_pro'] }; // 4 servers
        
        await enforceQuotaLimits('user1_pro', 'u1_pro@test.com', dbMock);
        
        // Only s4 is demoted
        expect(updates['servers/s4_pro']).toBeDefined();
        expect(updates['servers/s3_pro']).toBeUndefined();
        expect(updates['moderators/u1_pro@test.com'].activeServerIds).toEqual(['s1_pro', 's2_pro', 's3_pro']);
    });
    
    it('beta grants on server do not deduct from user generic quota', async () => {
        docsData['subscriptions/user5'] = { status: 'active', accessTier: 'pro_1', expiresAt: Date.now() + 100000 };
        docsData['moderators/u5@test.com'] = { activeServerIds: ['s1_beta', 's2_beta'] }; 
        docsData['servers/s2_beta'] = { isBeta: true, betaExpiry: Date.now() + 100000 };
        
        await enforceQuotaLimits('user5', 'u5@test.com', dbMock);
        
        expect(updates['servers/s2_beta']).toBeUndefined();
    });
});
