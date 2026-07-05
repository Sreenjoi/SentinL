import { describe, it, expect, vi, beforeEach } from 'vitest';
import { claimServer, unclaimServer } from '../../src/utils/entitlements.js';

describe('Server Claiming/Unclaiming', () => {
    let tMock: any;
    let dbMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        tMock = {
            getAll: vi.fn(),
            get: vi.fn(),
            set: vi.fn(),
            delete: vi.fn()
        };
        dbMock = {
            collection: vi.fn((name) => ({
                doc: vi.fn((id) => ({ collectionName: name, id })),
                where: vi.fn(() => ({
                    get: vi.fn().mockResolvedValue({ docs: [] })
                }))
            })),
            runTransaction: async (cb: any) => {
                await cb(tMock);
            }
        };
    });

    it('old owner loses access immediately because fields are deleted atomicaly', async () => {
        tMock.get.mockImplementation(async (ref: any) => {
            if (ref.collectionName === 'subscriptions') {
                return { exists: true, data: () => ({ linkedServerIds: ['server1', 'server2'] }) };
            }
            if (ref.collectionName === 'server_subscriptions') {
                return { exists: true, data: () => ({ ownerId: 'user1' }) };
            }
            return { exists: false };
        });

        await unclaimServer('user1', 'server1', dbMock);

        expect(tMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'user1' }),
            { linkedServerIds: ['server2'] },
            { merge: true }
        );
        expect(tMock.delete).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'server1' })
        );
    });

    it('one user cannot delete another user claims', async () => {
        // User1 is trying to unclaim server owned by User2
        tMock.get.mockImplementation(async (ref: any) => {
            if (ref.collectionName === 'subscriptions') {
                return { exists: true, data: () => ({ linkedServerIds: [] }) };
            }
            if (ref.collectionName === 'server_subscriptions') {
                return { exists: true, data: () => ({ ownerId: 'user2' }) };
            }
            return { exists: false };
        });

        await unclaimServer('user1', 'server1', dbMock);

        // They shouldn't be able to delete the link doc!
        expect(tMock.delete).not.toHaveBeenCalled();
        expect(tMock.set).not.toHaveBeenCalled();
    });

    it('new owner can claim after old owner unclaims', async () => {
        // First simulate unclaiming by user1
        tMock.get.mockImplementation(async (ref: any) => {
            if (ref.collectionName === 'subscriptions') {
                return { exists: true, data: () => ({ linkedServerIds: ['server1'] }) };
            }
            if (ref.collectionName === 'server_subscriptions') {
                return { exists: true, data: () => ({ ownerId: 'user1' }) };
            }
            return { exists: false };
        });

        await unclaimServer('user1', 'server1', dbMock);
        expect(tMock.delete).toHaveBeenCalled();

        // Now simulate user2 claiming
        tMock.get.mockImplementation(async (ref: any) => {
            if (ref && typeof ref.where === 'function' || ref.get) return { docs: [] };
            return { exists: true, data: () => ({ accessTier: 'pro_1', linkedServerIds: [] }) };
        });

        await claimServer('user2', 'server1', dbMock);

        expect(tMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'user2' }),
            expect.objectContaining({ linkedServerIds: ['server1'] }),
            { merge: true }
        );
        expect(tMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'server1' }),
            expect.objectContaining({ ownerId: 'user2' }),
            { merge: true }
        );
    });
});
