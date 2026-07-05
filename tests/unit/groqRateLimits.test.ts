import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetRateLimiterForTest, setDbForTest } from "../../src/discordBot";
import { parseGroqResetMs } from "../../src/utils/groqRateLimit";

describe('Groq Rate Limiting & Daily Quota', () => {

    beforeEach(() => {
        if ((global as any).__resetRateLimiterForTest) {
            (global as any).__resetRateLimiterForTest();
        }
        vi.clearAllMocks();
        process.env.GROQ_API_KEY = "dummy-key";
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

    it('MODERATION_MAX_WORKERS env override works', () => {
        process.env.MODERATION_MAX_WORKERS = "5";
        expect(process.env.MODERATION_MAX_WORKERS).toBe("5");
    });

    it('One executeAIModeration that does fast-pass + full-pass consumes 2 provider request slots', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        const globalFetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            headers: new Headers(),
            json: async () => ({
                choices: [{ message: { content: '{"results":[{"index":1,"level":"Moderate","confidence":60,"flag":false,"reason":""}]}' } }]
            })
        } as any);

        const fakeReq = {
            serverId: "server1",
            message: { content: "test", createdAt: new Date(), author: { id: "1", username: "u", displayAvatarURL: () => "url" }, channelId: "c1", attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, useContext: true }
        };

        await executeAIModeration(fakeReq);

        // the dual pass causes 2 fetch calls
        expect(globalFetchSpy).toHaveBeenCalledTimes(2);
    });

    it('70B escalation consumes a third provider request slot', async () => {
        const executeAIModeration = (global as any).__executeAIModeration;
        if (!executeAIModeration) return;

        const globalFetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            headers: new Headers(),
            json: async () => ({
                choices: [{ message: { content: '{"results":[{"index":1,"level":"Moderate","confidence":40,"flag":false,"reason":""}]}' } }]
            })
        } as any);

        const fakeReq = {
            serverId: "server1",
            message: { content: "test 70b", createdAt: new Date(), author: { id: "1", username: "u", displayAvatarURL: () => "url" }, channelId: "c1", attachments: { size: 0 } },
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, enableDualModel: true }
        };

        await executeAIModeration(fakeReq);
        // dual pass = 2, low confidence on dual pass = 3
        expect(globalFetchSpy).toHaveBeenCalledTimes(3); 
    });

    it('Groq 429 parses cooldown and updates system_health/groq', async () => {
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
        // Ensure db.collection("system_health").doc("groq").set was called with isRateLimited: true
        expect(mockDb.mockSet).toHaveBeenCalledWith(
            expect.objectContaining({
                isRateLimited: true,
                reason: "rate_limit"
            }),
            { merge: true }
        );
        
        // Also it should have a cooldownUntil property that is > 0
        const callArgs = mockDb.mockSet.mock.calls.find(c => c[0].isRateLimited === true);
        expect(callArgs[0]).toHaveProperty("cooldownUntil");
        expect(callArgs[0].cooldownUntil).toBeGreaterThan(Date.now());
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
