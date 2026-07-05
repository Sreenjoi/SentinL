import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateServerSummary } from '../../src/services/summaryService.js';
import * as discordBot from '../../src/discordBot.js';
import * as entitlements from '../../src/utils/entitlements.js';
import * as groqBudget from '../../src/utils/groqBudget.js';

vi.mock('../../src/discordBot.js', () => ({
    getBotClient: vi.fn(),
    db: {
        collection: vi.fn(),
        runTransaction: vi.fn()
    }
}));

vi.mock('../../src/utils/entitlements.js', () => ({
    getServerTierStatus: vi.fn()
}));

vi.mock('../../src/utils/groqBudget.js', () => ({
    reserveGroqBudget: vi.fn(),
    estimateGroqCallTokens: vi.fn(),
    reconcileGroqTokens: vi.fn(),
    releaseGroqBudget: vi.fn()
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('generateServerSummary', () => {
    let mockChannel: any;
    let mockDb: any;
    
    beforeEach(() => {
        vi.resetAllMocks();
        
        mockChannel = {
            guildId: 'server-1',
            type: 0,
            name: 'general',
            messages: {
                fetch: vi.fn().mockResolvedValue(new Map([
                    ['1', { id: '1', author: { bot: false, username: 'user1' }, content: 'hello', createdTimestamp: Date.now() - 1000 }]
                ]))
            }
        };
        
        const mockClient = {
            isReady: () => true,
            channels: {
                fetch: vi.fn().mockResolvedValue(mockChannel)
            }
        };
        
        vi.mocked(discordBot.getBotClient).mockReturnValue(mockClient as any);
        
        const mockDoc = { exists: true, data: () => ({ count: 0, pending: 0 }) };
        const mockDocRef: any = {
            id: 'summary-123',
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({ id: 'inner-doc-123' })
            })
        };
        const mockCollection = { doc: vi.fn().mockReturnValue(mockDocRef) };
        const mockDbInstance = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockReturnValue({
                        doc: vi.fn().mockReturnValue(mockDocRef)
                    })
                })
            }),
            runTransaction: vi.fn().mockImplementation(async (cb) => {
                const t = {
                    get: vi.fn().mockResolvedValue(mockDoc),
                    set: vi.fn()
                };
                return cb(t);
            })
        };
        
        discordBot.db = mockDbInstance as any;
        
        vi.mocked(entitlements.getServerTierStatus).mockResolvedValue({
            isPremium: false,
            tier: 'free'
        } as any);
        
        vi.mocked(groqBudget.estimateGroqCallTokens).mockReturnValue(500);
        vi.mocked(groqBudget.reserveGroqBudget).mockResolvedValue({ allowed: true });
        
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                choices: [{ message: { content: "Test summary" } }],
                usage: { total_tokens: 450 }
            })
        });
        
        process.env.GROQ_API_KEY = 'test-key';
    });
    
    afterEach(() => {
        delete process.env.GROQ_API_KEY;
    });

    it('should generate summary successfully and reconcile', async () => {
        const res = await generateServerSummary('server-1', 'channel-1', '2025-01-01', 'user-1');
        expect(res.summaryText).toContain('Test summary');
        expect(groqBudget.reserveGroqBudget).toHaveBeenCalled();
        expect(groqBudget.reconcileGroqTokens).toHaveBeenCalledWith(discordBot.db, 500, 450);
        expect(groqBudget.releaseGroqBudget).not.toHaveBeenCalled();
    });

    it('should not release reservation when reserveGroqBudget returns allowed: false', async () => {
        vi.mocked(groqBudget.reserveGroqBudget).mockResolvedValue({ allowed: false });
        
        await expect(generateServerSummary('server-1', 'channel-1', '2025-01-01', 'user-1'))
            .rejects.toThrow('AI provider is currently under heavy load');
            
        expect(groqBudget.releaseGroqBudget).not.toHaveBeenCalled();
    });

    it('should release reservation on provider failure', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500 });
        
        await expect(generateServerSummary('server-1', 'channel-1', '2025-01-01', 'user-1'))
            .rejects.toThrow('AI provider encountered an error while generating the summary.');
            
        expect(groqBudget.releaseGroqBudget).toHaveBeenCalledWith(discordBot.db, 500);
    });

    it('should release reservation on malformed response', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({})
        });
        
        await expect(generateServerSummary('server-1', 'channel-1', '2025-01-01', 'user-1'))
            .rejects.toThrow('AI returned empty summary.');
            
        expect(groqBudget.releaseGroqBudget).toHaveBeenCalledWith(discordBot.db, 500);
    });

    it('should not refund tokens already consumed by Groq if a later Firestore operation fails', async () => {
        // First transaction for reserving quota works.
        // Second transaction for finalizing throws.
        let txCall = 0;
        discordBot.db.runTransaction = vi.fn().mockImplementation(async (cb) => {
            txCall++;
            if (txCall === 2) {
                throw new Error('Firestore error');
            }
            const t = { get: vi.fn().mockResolvedValue({ data: () => ({ pending: 1 }) }), set: vi.fn() };
            return cb(t);
        });

        await expect(generateServerSummary('server-1', 'channel-1', '2025-01-01', 'user-1'))
            .rejects.toThrow('Firestore error');
        
        // Tokens were consumed and reconciled successfully
        expect(groqBudget.reconcileGroqTokens).toHaveBeenCalled();
        // Since tokens were consumed, release is not called
        expect(groqBudget.releaseGroqBudget).not.toHaveBeenCalled();
    });
});
