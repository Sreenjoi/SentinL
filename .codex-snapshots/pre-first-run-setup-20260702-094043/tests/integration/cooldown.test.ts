import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { startDiscordBot, setDbForTest } from '../../src/discordBot';

describe("Provider Cooldown Deterministic Logic", () => {
    beforeAll(async () => {
        process.env.DISCORD_BOT_TOKEN = "invalid_token";
        process.env.TEST_MODE = "true"; // enable __setGroqProviderCooldownUntil
        await startDiscordBot();
    });

    afterEach(() => {
        vi.clearAllMocks();
        const setCooldown = (global as any).__setGroqProviderCooldownUntil;
        if (setCooldown) setCooldown(0);
    });

    it("should short-circuit and fallback completely when cooldown is active", async () => {
        const executeAIModeration = (global as any).__executeAIModeration;

        const globalFetchSpy = vi.spyOn(global, "fetch");

        let dailyAiIncremented = false;
        let flaggedMessageAdded = false;

        const mockDb = {
            collection: (name: string) => ({
                doc: () => ({
                    get: async () => ({ data: () => ({ score: 0 }) }),
                    set: async () => {}, create: async () => {
                        if (name === "flaggedMessages") flaggedMessageAdded = true;
                    }, collection: () => ({ doc: () => ({ set: async () => {} }) })
                }),
                add: async () => {
                    if (name === "flaggedMessages") flaggedMessageAdded = true;
                },
                where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) })
            })
        } as any;
        setDbForTest(mockDb);

        let queueModelUsageCalled = false;
        const _queueModelUsage = (model: string) => {
            if (model === "daily_ai_count_incremented") dailyAiIncremented = true;
        }
        
        // set cooldown active
        const setCooldown = (global as any).__setGroqProviderCooldownUntil;
        setCooldown(Date.now() + 60000); // 1 min

        const msgs = [
            { id: "safe1", content: "hello world", author: { username: "U1", id: "1", displayAvatarURL: () => "url" }, channelId: "c" },
            { id: "risky2", content: "kill you", author: { username: "U2", id: "2", displayAvatarURL: () => "url" }, channelId: "c" },
        ] as any;

        await executeAIModeration({
            serverId: "123", message: msgs[0], coalescedMessages: msgs,
            rulesText: "", trainingContextText: "", historyText: "",
            isPremium: false, serverData: { primaryConfidenceThreshold: 80 }
        });

        // assertions
        expect(globalFetchSpy).not.toHaveBeenCalled();

        // 1 message should be flagged and placed in manual fallback
        expect(flaggedMessageAdded).toBe(true);
        expect(dailyAiIncremented).toBe(false);
    });
});
