import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as discordBot from "../../src/discordBot";

describe("AI Provider Flow Integration", () => {
  const originalEnv = process.env;
  let loggedData: any = null;

  const mockDb = {
    collection: (name: string) => {
      const coll = {
        doc: (id: string) => ({
          get: async () => ({
            exists: true,
            data: () => ({ isPremium: true, features: { ai_moderation: true, auto_delete: true } })
          }),
          set: async (data: any) => {
            if (name === 'server_history' || name === 'ai_logs') {
              loggedData = data;
            }
          },
          create: async (data: any) => {
            if (name === 'flaggedMessages') {
              loggedData = data;
            }
          },
          update: async () => {},
          collection: (subName: string) => {
            const subColl = {
              doc: () => ({
                set: async () => {},
                get: async () => ({ exists: false }),
                create: async (data: any) => {
                  if (subName === 'flaggedMessages') {
                    loggedData = data;
                  }
                }
              }),
              add: async (data: any) => {
                if (subName === 'flaggedMessages' || subName === 'ai_logs') {
                  loggedData = data;
                }
              }
            };
            return subColl;
          }
        }),
        add: async (data: any) => {
          if (name === 'ai_logs') loggedData = data;
        },
        where: () => coll,
        limit: () => coll,
        get: async () => ({ empty: true, docs: [] })
      };
      return coll;
    },
    runTransaction: async (cb: any) => {
       const mockT = {
         get: async () => ({
           exists: true,
           data: () => ({ tokensUsed: 0, aiLimit: 5000, lastReset: Date.now() })
         }),
         set: () => {},
         update: () => {}
       };
       return cb(mockT);
    }
  };

  beforeEach(async () => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.GROQ_API_KEY = "test-groq-key";
    process.env.TEST_MODE = "true";
    
    // We'll use fetch mock to intercept calls
    global.fetch = vi.fn();
    
    // Disable console noise
    // vi.spyOn(console, "error").mockImplementation(() => {});
    // vi.spyOn(console, "warn").mockImplementation(() => {});
    
    (discordBot as any).setDbForTest(mockDb);
    loggedData = null;
    
    await discordBot.startDiscordBot(mockDb as any);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("default groq fast-pass path still works", async () => {
    process.env.PRIMARY_AI_PROVIDER = "groq";
    
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      expect(url).toContain("api.groq.com");
      return {
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: false, confidence: 95 }] }) } }]
        })
      };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Hello", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Hello", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    await executeAIModeration(fakeReq);

    expect(loggedData).not.toBeNull();
    expect(loggedData.modelUsed).toBe("primary_fast");
  });

  it("cloudflare fast-pass success parses results correctly", async () => {
    process.env.PRIMARY_AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
    process.env.CLOUDFLARE_API_TOKEN = "mock-token";
    process.env.CLOUDFLARE_FAST_MODEL = "cf-custom";
    
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      expect(url).toContain("api.cloudflare.com");
      return {
        ok: true,
        headers: new Headers(),
        json: async () => ({
          result: { response: JSON.stringify({ results: [{ index: 1, flag: false, confidence: 95 }] }) }
        })
      };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Hello Cloudflare", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Hello Cloudflare", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    await executeAIModeration(fakeReq);

    expect(loggedData).not.toBeNull();
    expect(loggedData.modelUsed).toBe("cloudflare_primary_fast");
  });

  it("cloudflare 429 falls back to groq", async () => {
    process.env.PRIMARY_AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
    process.env.CLOUDFLARE_API_TOKEN = "mock-token";
    
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      callCount++;
      if (url.includes("api.cloudflare.com")) {
        return {
          ok: false,
          status: 429,
          headers: new Headers(),
          text: async () => "Rate Limited"
        };
      }
      if (url.includes("api.groq.com")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: false, confidence: 95 }] }) } }]
          })
        };
      }
      return { ok: false, headers: new Headers() };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Fallback", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Fallback", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    await executeAIModeration(fakeReq);

    expect(callCount).toBe(2);
    expect(loggedData).not.toBeNull();
    expect(loggedData.modelUsed).toBe("primary_fast");
  });

  it("cloudflare malformed response falls back safely to groq", async () => {
    process.env.PRIMARY_AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
    process.env.CLOUDFLARE_API_TOKEN = "mock-token";
    
    let callCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      callCount++;
      if (url.includes("api.cloudflare.com")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            result: { response: "I am an AI language model and cannot do that." }
          })
        };
      }
      if (url.includes("api.groq.com")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: false, confidence: 95 }] }) } }]
          })
        };
      }
      return { ok: false, headers: new Headers() };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Malformed", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Malformed", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    await executeAIModeration(fakeReq);

    expect(callCount).toBe(2);
    expect(loggedData).not.toBeNull();
    expect(loggedData.modelUsed).toBe("primary_fast");
  });

  it("full-pass still uses Groq and preserves coalesced batch indexes", async () => {
    process.env.PRIMARY_AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
    process.env.CLOUDFLARE_API_TOKEN = "mock-token";
    
    let fastPassIndex = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      // Fast-pass (Cloudflare) returns flag: true to trigger full-pass
      if (url.includes("api.cloudflare.com")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            result: { response: JSON.stringify({ results: [{ index: 1, flag: true, confidence: 90 }] }) }
          })
        };
      }
      // Full-pass uses Groq
      if (url.includes("api.groq.com")) {
        // verify model
        expect(body.model).toBe(process.env.PRIMARY_AI_MODEL || "llama-3.1-8b-instant");
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: true, confidence: 90, level: "Spam", reason: "Test reason" }] }) } }]
          })
        };
      }
      return { ok: false, headers: new Headers() };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Spam message", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Spam message", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    const res = await executeAIModeration(fakeReq);

    expect(res).not.toBeNull();
    expect(res.length).toBe(1);
    expect(res[0].reason).toBe("Test reason");
    
    // Model used in the log should be the final stage model (primary_full)
    expect(loggedData.modelUsed).toBe("primary_full");
  });

  it("premium_70b still uses Groq", async () => {
    process.env.PRIMARY_AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
    process.env.CLOUDFLARE_API_TOKEN = "mock-token";
    
    vi.spyOn(global, "fetch").mockImplementation(async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      // Fast-pass (Cloudflare) returns flag: true to trigger full-pass
      if (url.includes("api.cloudflare.com")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            result: { response: JSON.stringify({ results: [{ index: 1, flag: true, confidence: 90 }] }) }
          })
        };
      }
      // Full-pass uses Groq and returns low confidence to trigger premium_70b
      if (url.includes("api.groq.com") && body.model.includes("8b")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: true, confidence: 50, level: "Spam", reason: "Ambiguous" }] }) } }]
          })
        };
      }
      // Premium 70B uses Groq
      if (url.includes("api.groq.com") && body.model.includes("70b")) {
        return {
          ok: true,
          headers: new Headers(),
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ results: [{ index: 1, flag: true, confidence: 95, level: "Spam", reason: "Definite spam" }] }) } }]
          })
        };
      }
      return { ok: false, headers: new Headers() };
    });

    const fakeReq = {
      serverId: "server1",
      historyText: "",
      rulesText: "",
      message: { content: "Ambiguous spam", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } },
      coalescedMessages: [{ content: "Ambiguous spam", author: { username: "User1", displayAvatarURL: () => "url" }, reference: null, mentions: { users: { size: 0 } }, client: { channels: { cache: { get: () => null } }, guilds: { cache: { get: () => null } } } }]
    };

    const executeAIModeration = (global as any).__executeAIModeration || (discordBot as any).executeAIModerationMockable || (discordBot as any).queueMessageModeration;
    const res = await executeAIModeration(fakeReq);

    expect(res).not.toBeNull();
    expect(res[0].reason).toBe("Definite spam");
    expect(loggedData.modelUsed).toBe("premium_70b");
  });
});
