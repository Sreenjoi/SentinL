import { describe, it, expect, vi, beforeAll } from 'vitest';
import { startDiscordBot } from '../../src/discordBot';

describe('Server-Aware trivial message cache', () => {
    beforeAll(async () => {
       await startDiscordBot();
    });

    it('message safe in Server A is not bypassed in Server B', async () => {
       let requestBodyA: any = null;
       let requestBodyB: any = null;

       const globalFetchSpy = vi.spyOn(global, "fetch")
         .mockImplementation(async (url: any, init: any) => {
            const body = JSON.parse(init.body);
            if (!requestBodyA) {
                requestBodyA = body;
                // AI says safe for Server A
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe","confidence":100,"flag":false}]}' } }],
                    })
                } as any;
            } else {
                requestBodyB = body;
                // AI says flagged for Server B (due to custom rules)
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        choices: [{ message: { content: '{"results":[{"index":1,"level":"Extreme","confidence":99,"flag":true,"reason":"Matched rule: No apples"}]}' } }],
                    })
                } as any;
            }
         });

       const executeFn = (global as any).__executeAIModeration;

       const messageA = { id: "msgA", content: "I like apples", author: {id: "1", username: "A", displayAvatarURL: () => "url" } };
       let deletedA = false;
       const reqA = {
          serverId: "serverA",
          message: messageA,
          coalescedMessages: [
            { ...messageA, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedA = true; } },
          ],
          rulesText: "", trainingContextText: "", historyText: "",
          isPremium: true, serverData: { primaryConfidenceThreshold: 75, autoDelete: true, keywords: [] }
       };

       process.env.GROQ_API_KEY = "test";
       await executeFn(reqA);

       expect(requestBodyA).toBeDefined();
       expect(deletedA).toBe(false);

       // Now if the same message comes to Server B, it shouldn't bypass via trivial cache.
       let deletedB = false;
       const messageB = { id: "msgB", content: "I like apples", author: {id: "1", username: "A", displayAvatarURL: () => "url" }, delete: async () => { deletedB = true; } };
       const reqB = {
          serverId: "serverB",
          message: messageB,
          coalescedMessages: [
            { ...messageB, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedB = true; } },
          ],
          rulesText: "No apples allowed", trainingContextText: "", historyText: "",
          isPremium: true, serverData: { primaryConfidenceThreshold: 75, autoDelete: true, keywords: [] }
       };

       await executeFn(reqB);
       
       expect(requestBodyB).toBeDefined(); // Will not be bypassed
       expect(deletedB).toBe(true);
       
       globalFetchSpy.mockRestore();
    });
});
