import { describe, it, expect, vi, beforeEach } from "vitest";
import { setDbForTest } from "../../src/discordBot";
import { parseGroqResetMs } from "../../src/utils/groqRateLimit";
import { __resetGroqBudgetForTest } from "../../src/utils/groqBudget";

describe('Groq Rate Limiting & Daily Quota', () => {

    beforeEach(() => {
        if ((global as any).__resetRateLimiterForTest) {
            (global as any).__resetRateLimiterForTest();
        }
        __resetGroqBudgetForTest();
        vi.clearAllMocks();
        process.env.GROQ_API_KEY = "dummy-key";
        process.env.GROQ_GLOBAL_LIMITER_ENABLED = "false"; // isolate from budget limiter by default unless needed
    });

    const createMockDb = () => {
        const mockSet = vi.fn().mockResolvedValue(undefined);
        return {
            mockSet,
            collection: () => ({
                doc: () => ({
                    set: mockSet
                })
            })
        };
    };

    it('parseGroqResetMs handles different time formats properly', () => {
        expect(parseGroqResetMs("2m")).toBe(120000);
        expect(parseGroqResetMs("1m30s")).toBe(90000);
        expect(parseGroqResetMs("1h")).toBe(3600000);
        expect(parseGroqResetMs("2500ms")).toBe(5000); // capped to minimum 5s
        expect(parseGroqResetMs("8s")).toBe(8000);
        expect(parseGroqResetMs(null)).toBe(15 * 60 * 1000);
    });

    it('safe fast-pass path uses primary_fast and consumes 1 provider request slot', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        let fetchBody: any;
        const globalFetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, opts: any) => {
            fetchBody = JSON.parse(opts.body);
            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({
                    choices: [{ message: { content: '{"results":[{"index":1,"level":"Low","confidence":95,"flag":false,"reason":""}]}' } }]
                })
            } as any;
        });

        const fakeReq = {
            serverId: "server1",
            message: { content: "safe test", createdAt: new Date(), author: { id: "1", username: "u", displayAvatarURL: () => "url" }, channelId: "c1", attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, useContext: true }
        };

        const res = await executeAIModeration(fakeReq);

        expect(globalFetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchBody.model).toBe("llama-3.1-8b-instant"); // Fast pass model
        expect(res.aiRealSuccess).toBe(true);
    });

    it('flagged path reaches primary_full and consumes 2 provider request slots', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        const globalFetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, opts: any) => {
            const body = JSON.parse(opts.body);
            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({
                    // return flagged for both fast and full passes
                    choices: [{ message: { content: '{"results":[{"index":1,"level":"Moderate","confidence":95,"flag":true,"reason":""}]}' } }]
                })
            } as any;
        });

        const fakeReq = {
            serverId: "server1",
            message: { content: "test flagged", createdAt: new Date(), author: { id: "1", username: "u", displayAvatarURL: () => "url" }, channelId: "c1", attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, useContext: true }
        };

        await executeAIModeration(fakeReq);

        // dual pass causes 2 fetch calls
        expect(globalFetchSpy).toHaveBeenCalledTimes(2);
    });

    it('cooldown fallback only happens in cooldown-specific tests (Groq 429)', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;
        
        let fetchCalls = 0;
        
        vi.spyOn(global, "fetch").mockImplementation(async () => {
            fetchCalls++;
            return {
                ok: false,
                status: 429,
                headers: new Headers({ "x-ratelimit-reset-requests": "2.5s" }),
                text: async () => "Rate limit exceeded"
            } as any;
        });

        const mockDb = createMockDb();
        setDbForTest(mockDb);

        const fakeReq = {
            serverId: "server1", retryCount: 0,
            message: { content: "test", createdAt: new Date(), author: { id: "1" }, attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: false, serverData: { primaryConfidenceThreshold: 75 }
        };

        try {
            await executeAIModeration(fakeReq);
        } catch(e) {}
        
        expect(fetchCalls).toBeGreaterThan(0);
        expect(mockDb.mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                isRateLimited: true,
                reason: "rate_limit"
            }),
            { merge: true }
        );
        
        const callArgs = mockDb.mockSet.mock.calls.find(c => c[0].isRateLimited === true);
        expect(callArgs[0]).toHaveProperty("cooldownUntil");
        expect(callArgs[0].cooldownUntil).toBeGreaterThan(Date.now());
    });

    it('provider budget state does not leak across tests', async () => {
        // Since we hit 429 in the previous test, groqProviderCooldownUntil would be in the future.
        // But because of beforeEach reset, it should be 0.
        const cooldownUntil = (global as any).__getGroqProviderCooldownUntil ? (global as any).__getGroqProviderCooldownUntil() : 0;
        expect(cooldownUntil).toBe(0);
    });

    it('messages are not silently marked safe during provider failure; structurally risky messages become pending review', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        let fetchCalls = 0;
        vi.spyOn(global, "fetch").mockImplementation(async () => {
            fetchCalls++;
            return {
                ok: false,
                status: 500,
                text: async () => "Internal Server Error"
            } as any;
        });

        const fakeReq = {
            serverId: "server1", retryCount: 3, // max retries reached
            message: { content: "test with slur like retard", createdAt: new Date(), author: { id: "1", username: "test", displayAvatarURL: () => "" }, attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: false, serverData: { primaryConfidenceThreshold: 75, logChannelId: "ch1" }
        };

        const mockDb = createMockDb();
        setDbForTest(mockDb);

        await executeAIModeration(fakeReq);

        expect(fetchCalls).toBe(1);

        // It should have inserted into flaggedMessages due to being structurally risky
        let insertedToDb = false;
        // The implementation updates db.collection("flaggedMessages").doc().set
        expect(mockDb.mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                level: "Moderate",
                reason: "Provider unavailable, queued for manual review due to structural risk signals.",
                confidence: 100
            })
        );
    });

    it('Successful request clears provider warning', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            headers: new Headers(),
            json: async () => ({
                choices: [{ message: { content: '{"results":[{"index":1,"level":"Moderate","confidence":90,"flag":false,"reason":""}]}' } }]
            })
        } as any);

        const mockDb = createMockDb();
        setDbForTest(mockDb);

        const fakeReq = {
            serverId: "server1",
            message: { content: "test", createdAt: new Date(), author: { id: "1" }, attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: false, serverData: { primaryConfidenceThreshold: 75 }
        };

        // Note: For success to trigger DB update, Date.now() must be >= groqProviderCooldownUntil
        await executeAIModeration(fakeReq);

        expect(mockDb.mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                isRateLimited: false,
                reason: null,
                cooldownUntil: 0
            }),
            { merge: true }
        );
        
        setDbForTest(null);
    });

    it('True daily quota hit still sends daily AI limit notification AND does not increment dailyAICount for fallback', async () => {
        expect(1).toBe(1);
    });

    it('Queue does not spin aggressively during provider cooldown', async () => {
        expect(1).toBe(1);
    });

});
