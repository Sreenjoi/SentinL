import { describe, it, expect, vi, beforeAll } from 'vitest';
import { startDiscordBot } from '../../src/discordBot';

describe('High-Risk Router before fast-pass', () => {
    beforeAll(async () => {
       await startDiscordBot();
    });

    it('bypasses fast-pass and sends directly to full-pass for kys, slurs, suspicious links, and keyword matches', async () => {
       let requestBodyFast: any = null;
       let requestBodyFull: any = null;

       const globalFetchSpy = vi.spyOn(global, "fetch")
         .mockImplementation(async (url: any, init: any) => {
            const body = JSON.parse(init.body);
            if (!requestBodyFast && body.max_tokens <= 200) {
                requestBodyFast = body;
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe","confidence":100,"flag":false}]}' } }],
                    })
                } as any;
            } else {
                requestBodyFull = body;
                return {
                    ok: true,
                    headers: new Headers(),
                    json: async () => ({
                        choices: [{ message: { content: '{"results":[{"index":1,"level":"Extreme","confidence":99,"flag":true,"reason": "kys"}, {"index":2,"level":"Extreme","confidence":99,"flag":true,"reason": "slur"}, {"index":3,"level":"Extreme","confidence":99,"flag":true,"reason": "link"}, {"index":4,"level":"Extreme","confidence":99,"flag":true,"reason": "bannedword"}]}' } }],
                    })
                } as any;
            }
         });

       let deletedIds: string[] = [];
       const req = {
          serverId: "test-server",
          message: { id: "m0", content: "safe test", author: {id: "1", username: "A", displayAvatarURL: () => "url" } },
          coalescedMessages: [
            { id: "m1", content: "harmless message", author: {id: "1", username: "A", displayAvatarURL: () => "url"}, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedIds.push("m1") } },
            { id: "m2", content: "kys", author: {id: "1", username: "A", displayAvatarURL: () => "url"}, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedIds.push("m2") } },
            { id: "m3", content: "what a retard", author: {id: "1", username: "A", displayAvatarURL: () => "url"}, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedIds.push("m3") } },
            { id: "m4", content: "http://suspicious.link/free-nitro this is totally safe", author: {id: "1", username: "A", displayAvatarURL: () => "url"}, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedIds.push("m4") } },
            { id: "m5", content: "this uses a bannedword", author: {id: "1", username: "A", displayAvatarURL: () => "url"}, channelId: "c1", createdAt: new Date(), deletable: true, delete: async () => { deletedIds.push("m5") } },
          ],
          rulesText: "", trainingContextText: "", historyText: "",
          isPremium: true, serverData: { primaryConfidenceThreshold: 75, autoDelete: true, keywords: ["bannedword"] }
       };

       process.env.GROQ_API_KEY = "test";
       const executeFn = (global as any).__executeAIModeration;
       await executeFn(req);

       expect(requestBodyFast).toBeDefined();
       expect(requestBodyFull).toBeDefined();

       const fastContent = requestBodyFast.messages[1].content;
       const fullContent = requestBodyFull.messages[1].content;

       // Fast pass should ONLY process the harmless message (index 1)
       expect(fastContent).toContain("1. [A]: harmless message");
       expect(fastContent).not.toContain("kys");
       expect(fastContent).not.toContain("retard");
       expect(fastContent).not.toContain("http");
       expect(fastContent).not.toContain("bannedword");

       // Full pass should process indices 1, 2, 3, 4 (remapped)
       expect(fullContent).toMatch(/1\. \[A\]: kys/);
       expect(fullContent).toMatch(/2\. \[A\]: what a retard/);
       expect(fullContent).toMatch(/3\. \[A\]: http:\/\/suspicious.link\/free-nitro this is totally safe/);
       expect(fullContent).toMatch(/4\. \[A\]: this uses a bannedword/);
       
       // And they should be deleted based on full pass results, not just the router
       expect(deletedIds).toContain("m2");
       expect(deletedIds).toContain("m3");
       expect(deletedIds).toContain("m4");
       expect(deletedIds).toContain("m5");
       expect(deletedIds).not.toContain("m1"); // ensure safe msg is NOT deleted
       
       globalFetchSpy.mockRestore();
    });
});
