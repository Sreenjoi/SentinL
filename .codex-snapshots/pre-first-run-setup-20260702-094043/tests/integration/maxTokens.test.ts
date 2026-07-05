import { describe, it, expect, vi, beforeAll } from 'vitest';
import { executeAIModeration, startDiscordBot, setDbForTest } from '../../src/discordBot';

describe('Max Token Caps & JSON Error Safety', () => {
    beforeAll(async () => {
       await startDiscordBot();
    });

    it('call body includes max_tokens scaling with batch size', async () => {
       let requestBodyFast: any = null;
       let requestBodyFull: any = null;

       const globalFetchSpy = vi.spyOn(global, "fetch")
         .mockImplementation(async (url: any, init: any) => {
            const body = JSON.parse(init.body);
            if (!requestBodyFast) {
                requestBodyFast = body;
            } else {
                requestBodyFull = body;
            }
            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({
                    choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe","confidence":100,"flag":false},{"index":2,"level":"Inappropriate","confidence":40,"flag":true}]}' } }],
                })
            } as any;
         });

       const req = {
          serverId: "token-test-server",
          message: { content: "test", author: {id: "1", username: "A" } },
          coalescedMessages: [
            { content: "This is a very simple message with exactly eight words.", author: {id: "1", username: "A"}, channelId: "c1", createdAt: new Date() },
            { content: "I literally hate you so much for this behavior.", author: {id: "1", username: "A"}, channelId: "c1", createdAt: new Date() }
          ],
          rulesText: "", trainingContextText: "", historyText: "",
          isPremium: true, serverData: { primaryConfidenceThreshold: 75 }
       };

       process.env.GROQ_API_KEY = "test";
       await (global as any).__executeAIModeration(req); // wait, where is executeAIModeration?

       expect(requestBodyFast).toBeDefined();
       expect(requestBodyFast.max_tokens).toBe(120 + (1 * 40)); // 160
       
       expect(requestBodyFull).toBeDefined();
       expect(requestBodyFull.max_tokens).toBe(220 + (1 * 90)); // 310
       
       globalFetchSpy.mockRestore();
    });

    it('malformed/truncated JSON is handled safely (no message deletion)', async () => {
       const globalFetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
         ok: true,
         headers: new Headers(),
         json: async () => ({
           // Return truncated JSON!
           choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe"' } }], 
         })
       } as any);

       let deleted = false;
       const req = {
          serverId: "token-test-server",
          message: { 
              content: "test msg", 
              author: {id: "1", username: "A" }, 
              channelId: "c1", 
              createdAt: new Date(), 
              deletable: true,
              delete: async () => { deleted = true; }
          },
          rulesText: "", trainingContextText: "", historyText: "",
          isPremium: true, serverData: { primaryConfidenceThreshold: 75, autoDelete: true, keywords: [] }
       };

       process.env.GROQ_API_KEY = "test";
       const executeFn = (global as any).__executeAIModeration;
       await executeFn(req);

       expect(deleted).toBe(false); // Parse failure should drop to keywords, which won't delete since "test msg" has no swear words!
       
       globalFetchSpy.mockRestore();
    });
});
