import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reserveGroqBudget, releaseGroqBudget, reconcileGroqTokens, __resetGroqBudgetForTest } from '../../src/utils/groqBudget.js';

describe('Groq Budget Lifecycle', () => {
    let mockDb: any;
    let tMock: any;
    let mockData: any;

    beforeEach(() => {
        vi.clearAllMocks();
        __resetGroqBudgetForTest();
        mockData = { windowStartMs: Date.now(), requestCount: 1, estimatedTokenCount: 1000, cooldownUntil: 0 };
        tMock = {
            get: vi.fn().mockResolvedValue({ exists: true, data: () => mockData }),
            set: vi.fn(),
            update: vi.fn()
        };
        mockDb = {
            collection: () => ({ doc: () => ({}) }),
            runTransaction: async (cb: any) => await cb(tMock)
        };
    });

    it('reconciles tokens if actual token usage differs from estimation', async () => {
        await reconcileGroqTokens(mockDb, 1000, 500); // We estimated 1000, used 500. So we return 500 to budget
        expect(tMock.set).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                estimatedTokenCount: 500 // 1000 - (1000 - 500)
            }),
            expect.anything()
        );
    });

    it('releases entire reservation if network failed', async () => {
        await releaseGroqBudget(mockDb, 1000);
        expect(tMock.set).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                requestCount: 0, // 1 - 1
                estimatedTokenCount: 0 // 1000 - 1000
            }),
            expect.anything()
        );
    });
    
    it('uses local limiter if transaction throws and it is not high risk', async () => {
        mockDb.runTransaction = vi.fn().mockRejectedValue(new Error('Tx Failed'));
        const result = await reserveGroqBudget(mockDb, 1000, false); 
        expect(result.allowed).toBe(true); 
    });

    it('always permits high-risk traffic during transaction failures', async () => {
        mockDb.runTransaction = vi.fn().mockRejectedValue(new Error('Tx Failed'));

        // Emulate reaching the local limit
        // Assuming limit is ~ 15 for pseudoRpm. 
        for (let i = 0; i < 20; i++) {
            await reserveGroqBudget(mockDb, 1000, false);
        }

        // The 21st attempt under normal risk should fail local limiter
        const normalResult = await reserveGroqBudget(mockDb, 1000, false);
        expect(normalResult.allowed).toBe(false);
        expect(normalResult.reason).toBe('local_limit_deferred');

        // But high risk bypasses it:
        const highRiskResult = await reserveGroqBudget(mockDb, 1000, true);
        expect(highRiskResult.allowed).toBe(true);
    });
});
