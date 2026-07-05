import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as discordBot from '../../src/discordBot';

describe('DB Fallback Auto-Delete Logic', () => {
    beforeAll(async () => {
       await discordBot.startDiscordBot();
    });

    afterAll(() => {
       vi.unstubAllGlobals();
       vi.clearAllMocks();
    });

    const mockDb = {
        collection: vi.fn(() => ({
            add: vi.fn().mockRejectedValue(new Error("Simulated Firestore timeout")),
            where: vi.fn(() => ({
                limit: vi.fn(() => ({
                    get: vi.fn().mockResolvedValue({ empty: true })
                }))
            })),
            doc: vi.fn(() => ({
                get: vi.fn(),
                set: vi.fn(),
                collection: vi.fn(() => ({
                    doc: vi.fn(() => ({
                        set: vi.fn().mockRejectedValue(new Error("Simulated Firestore timeout")),
                        get: vi.fn().mockRejectedValue(new Error("Simulated Firestore timeout"))
                    }))
                }))
            }))
        }))
    };

    const makeMsg = (id: string, content: string, deletable = true) => {
        const state = { deleted: false };
        const msg = {
            id, content, deletable,
            author: { id: id+"-au", username: id+"-un", displayAvatarURL: () => "url" },
            channelId: "c1",
            channel: { messages: { fetch: vi.fn().mockImplementation(async () => new Map()) } },
            delete: async () => { state.deleted = true; },
            createdTimestamp: Date.now(),
            createdAt: new Date(),
            _state: state
        };
        return msg;
    };

    const runSimulatedRequest = async (messages: any[], mockModelResult: string) => {
        const globalFetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
            if (typeof url === 'string' && url.includes('groq.com')) {
               let contentToReturn = mockModelResult;
               // If it's a full pass, we should return indices corresponding to the subset.
               // We can just find out which `content` is mapped to which index in the body.
               if (init.body.includes("Evaluate the following list")) {
                   // This is full pass. Let's just create a dynamic result string from the messages in the body.
                   const promptBody = JSON.parse(init.body).messages.find((m: any) => m.role === "user").content;
                   const res = JSON.parse(mockModelResult).results.map((r: any) => {
                        const origMsg = messages[r.index - 1];
                        if (!origMsg) return null;
                        
                        // Look for a line in the promptBody that contains this origMsg's unique username or content
                        // the format is "1. [username]: content..."
                        const lines = promptBody.split('\n');
                        const lineIndex = lines.findIndex((line: string) => line.includes(`[${origMsg.author.username}]`));
                        if (lineIndex !== -1) {
                            const match = lines[lineIndex].match(/^(\d+)\./);
                            if (match) {
                                return { ...r, index: parseInt(match[1]) };
                            }
                        }
                        return null;
                   }).filter(Boolean);
                   contentToReturn = JSON.stringify({ results: res });
               }

               return {
                   ok: true,
                   headers: new Headers(),
                   json: async () => ({
                       choices: [{ message: { content: contentToReturn } }],
                   })
               } as any;
            }
            return { ok: true, json: async () => ({}) } as any;
        });

        discordBot.setDbForTest(mockDb);
        const req = {
            serverId: "server1",
            message: messages[0],
            coalescedMessages: messages.length > 1 ? messages : undefined,
            rulesText: "", trainingContextText: "", historyText: "No context provided.",
            isPremium: true, serverData: { primaryConfidenceThreshold: 80, autoDelete: true, keywords: [], useContext: true }
        };

        const executeFn = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
        await executeFn(req);

        globalFetchSpy.mockRestore();
        discordBot.setDbForTest(null);
    };

    it('1. Mixed batch DB failure', async () => {
        const msgs = [
            makeMsg("safe1", "safe content"),
            makeMsg("ext1", "extreme content 1"),
            makeMsg("ext2", "extreme content 2")
        ];
        const resultString = JSON.stringify({
            results: [
                { index: 1, level: "Safe", confidence: 100, flag: false },
                { index: 2, level: "Extreme", confidence: 95, flag: true },
                { index: 3, level: "Extreme", confidence: 90, flag: true }
            ]
        });
        await runSimulatedRequest(msgs, resultString);

        expect(msgs[0]._state.deleted).toBe(false);
        expect(msgs[1]._state.deleted).toBe(true);
        expect(msgs[2]._state.deleted).toBe(true);
    });

    it('2. Single-message DB failure', async () => {
        const msgs = [ makeMsg("ext1", "extreme content") ];
        const resultString = JSON.stringify({
            results: [ { index: 1, level: "Extreme", confidence: 95, flag: true } ]
        });
        await runSimulatedRequest(msgs, resultString);
        expect(msgs[0]._state.deleted).toBe(true);
    });

    it('3. Low-confidence Extreme', async () => {
        const msgs = [ makeMsg("ext1", "extreme content") ];
        // Threshold is 80, confidence is 75
        const resultString = JSON.stringify({
            results: [ { index: 1, level: "Extreme", confidence: 75, flag: true } ]
        });
        await runSimulatedRequest(msgs, resultString);
        expect(msgs[0]._state.deleted).toBe(false);
    });

    it('4. Inappropriate/Moderate', async () => {
        const msgs = [
            makeMsg("mod1", "moderate"),
            makeMsg("inapp1", "inappropriate")
        ];
        const resultString = JSON.stringify({
            results: [
                { index: 1, level: "Moderate", confidence: 90, flag: true },
                { index: 2, level: "Inappropriate", confidence: 90, flag: true }
            ]
        });
        await runSimulatedRequest(msgs, resultString);
        expect(msgs[0]._state.deleted).toBe(false);
        expect(msgs[1]._state.deleted).toBe(false);
    });

    it('5. Non-deletable Extreme', async () => {
        const msgs = [ makeMsg("ext1", "extreme content", false) ];
        const resultString = JSON.stringify({
            results: [ { index: 1, level: "Extreme", confidence: 95, flag: true } ]
        });
        await runSimulatedRequest(msgs, resultString);
        expect(msgs[0]._state.deleted).toBe(false);
    });
});
