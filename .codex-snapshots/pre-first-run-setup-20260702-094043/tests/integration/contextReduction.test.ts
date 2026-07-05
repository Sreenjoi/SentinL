import { describe, it, expect, vi, beforeAll } from 'vitest';
import { startDiscordBot } from '../../src/discordBot';

describe('Context Reduction & Scaling', () => {
    beforeAll(async () => {
       await startDiscordBot();
    });

    it('adjusts context limit dynamically based on risk signals', async () => {
       let passedContext: string = "";

       const globalFetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
           if (url === "https://api.groq.com/openai/v1/chat/completions") {
              const body = JSON.parse(init.body);
              passedContext = body.messages[0].content;
              return {
                  ok: true,
                  headers: new Headers(),
                  json: async () => ({
                      choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe","confidence":50,"flag":false}]}' } }],
                  })
              } as any;
           }
           return { ok: true, json: async () => ({}) } as any;
       });

       const executeFn = (global as any).__executeAIModeration;

       const runTest = async (textContent: string) => {
           let limitUsed = 0;
           const message = { 
               id: "msg2", 
               content: textContent, 
               author: {id: "1", username: "A", displayAvatarURL: () => "url" },
               channel: {
                   messages: {
                       fetch: vi.fn().mockImplementation(async ({limit}) => {
                           limitUsed = limit;
                           return new Map([
                               ["msg1", { id: "msg1", content: "background text", author: {id: "1", username: "A", bot: false}, createdTimestamp: Date.now() - 1000 }]
                           ]);
                       })
                   }
               },
               createdTimestamp: Date.now()
           };
           
           const req = {
              serverId: "server1",
              message: message,
              coalescedMessages: [
                { ...message, channelId: "c1", deletable: true, delete: async () => {} },
              ],
              rulesText: "", trainingContextText: "", historyText: "",
              isPremium: true, serverData: { primaryConfidenceThreshold: 75, autoDelete: true, keywords: [], useContext: true }
           };
           
           await executeFn(req);
           return { limitUsed, passedContext };
       };

       // 1. Quoted slur should trigger long context (limit 30)
       let res = await runTest('He literally called me a "retard"');
       expect(res.limitUsed).toBe(30);

       // 2. Banter with "lol" should trigger long context
       res = await runTest('I hate you lol');
       expect(res.limitUsed).toBe(30);

       // 3. Normal text should trigger short context (limit 10)
       res = await runTest('you are terrible');
       expect(res.limitUsed).toBe(10);

       // 4. Obvious scam link skips context
       res = await runTest('http://steam-free-nitro.com/ free nitro discord.gg/123');
       expect(res.limitUsed).toBe(0); // Because includeContext becomes false
       expect(res.passedContext).not.toContain("background text");

       // 5. Direct threat skips context
       res = await runTest('I will stab you multiple times');
       expect(res.limitUsed).toBe(0); // includeContext becomes false

       globalFetchSpy.mockRestore();
    });
});
