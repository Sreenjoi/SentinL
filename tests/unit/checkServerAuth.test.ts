import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkServerAuth } from '../../server.js';
import * as admin from 'firebase-admin';

vi.mock('../../server.js', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        isSuperAdmin: vi.fn().mockResolvedValue(false)
    };
});

describe('checkServerAuth', () => {
    let dbMock: any;
    let docsData: Record<string, any>;

    beforeEach(() => {
        docsData = {};
        dbMock = {
            collection: vi.fn((colName) => ({
                doc: vi.fn((docId) => ({
                    get: vi.fn().mockImplementation(async () => {
                        const path = colName + '/' + docId;
                        if (docsData[path]) return { exists: true, data: () => docsData[path] };
                        return { exists: false };
                    })
                }))
            }))
        };
    });

    it('rejects if server_subscriptions record exists but owner is different', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'otherUser' };
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(false);
    });

    it('rejects if server_subscriptions matches but user subscription does not contain server (stale link)', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'user1' };
        docsData['subscriptions/user1'] = { accessTier: 'pro_1', linkedServerIds: ['s2'] };
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(false);
    });

    it('rejects if server_subscriptions matches but user has no subscriptions doc', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'user1' };
        // No 'subscriptions/user1'
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(false);
    });

    it('accepts if subscription is expired because user still owns the server on free tier', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'user1' };
        docsData['subscriptions/user1'] = { 
            accessTier: 'pro_1', 
            linkedServerIds: ['s1'],
            expiresAt: { toMillis: () => Date.now() - 10000 } // past
        };
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(true);
    });

    it('accepts if subscription is active and contains server', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'user1' };
        docsData['subscriptions/user1'] = { 
            accessTier: 'pro_1', 
            linkedServerIds: ['s1'],
            expiresAt: { toMillis: () => Date.now() + 10000 } // future
        };
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(true);
    });

    it('accepts free tier which has no expiration', async () => {
        docsData['server_subscriptions/s1'] = { ownerId: 'user1' };
        docsData['subscriptions/user1'] = { 
            accessTier: 'free', 
            linkedServerIds: ['s1']
        };
        
        const result = await checkServerAuth('user1', 'user@test.com', 's1', dbMock);
        expect(result).toBe(true);
    });
});
