import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLevelingSettings, invalidateLevelingCache } from '../../src/discordBot';

describe('Leveling Settings Cache', () => {
    beforeEach(() => {
        invalidateLevelingCache('server-123');
        invalidateLevelingCache('server-404');
        invalidateLevelingCache('server-error');
    });

    it('should fetch from db once and then cache', async () => {
        const mockSnap = {
            exists: true,
            data: () => ({ enabled: true, levelDivisor: 20 })
        };
        const mockGet = vi.fn().mockResolvedValue(mockSnap);
        const mockDoc = vi.fn().mockReturnValue({ get: mockGet });
        const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });
        
        const mockDb = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: mockCollection
                })
            })
        };

        const firstCall = await getLevelingSettings('server-123', mockDb as any);
        expect(firstCall).toEqual({ enabled: true, levelDivisor: 20 });
        expect(mockGet).toHaveBeenCalledTimes(1);

        const secondCall = await getLevelingSettings('server-123', mockDb as any);
        expect(secondCall).toEqual({ enabled: true, levelDivisor: 20 });
        
        // Should STILL be 1 because it's cached!
        expect(mockGet).toHaveBeenCalledTimes(1);
        
        invalidateLevelingCache('server-123');
        const thirdCall = await getLevelingSettings('server-123', mockDb as any);
        expect(thirdCall).toEqual({ enabled: true, levelDivisor: 20 });
        expect(mockGet).toHaveBeenCalledTimes(2);
    });

    it('should cache non-existent settings', async () => {
        const mockGet = vi.fn().mockResolvedValue({ exists: false });
        const mockDb = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: mockGet }) })
                })
            })
        };

        const res1 = await getLevelingSettings('server-404', mockDb as any);
        expect(res1).toBeNull();
        expect(mockGet).toHaveBeenCalledTimes(1);

        const res2 = await getLevelingSettings('server-404', mockDb as any);
        expect(res2).toBeNull();
        expect(mockGet).toHaveBeenCalledTimes(1); // Cached null!
    });
    
    it('should return null on fresh DB failure', async () => {
        const mockGet = vi.fn().mockRejectedValue(new Error("Firestore down"));
        const mockDb = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue({ get: mockGet }) })
                })
            })
        };
        const res = await getLevelingSettings('server-error', mockDb as any);
        expect(res).toBeNull();
    });
});
