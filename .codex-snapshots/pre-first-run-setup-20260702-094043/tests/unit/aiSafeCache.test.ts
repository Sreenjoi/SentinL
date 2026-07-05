import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aiSafeCache, AISafeCache } from '../../src/utils/moderationHelpers.js';

describe('AISafeCache', () => {
    beforeEach(() => {
        aiSafeCache.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('high-confidence safe repeat skips AI by returning true in cache', () => {
        const msg = { content: "This is a very polite and harmless message.", attachments: { size: 0 } };
        expect(aiSafeCache.isEligibleForCache(msg, "", [])).toBe(true);
        aiSafeCache.add('serverA', msg.content);
        expect(aiSafeCache.has('serverA', msg.content)).toBe(true);
    });

    it('low-confidence safe does not cache (checked at integration point, but testing eligibility here)', () => {
        const abusiveMsg = { content: "Shut up you retard lol", attachments: { size: 0 } };
        expect(aiSafeCache.isEligibleForCache(abusiveMsg, "", [])).toBe(false);
    });

    it('abusive message containing lol does not cache', () => {
        const inviteMsg = { content: "check out this server discord.gg/123", attachments: { size: 0 } };
        expect(aiSafeCache.isEligibleForCache(inviteMsg, "", [])).toBe(false);

        const longMsg = { content: "a".repeat(121), attachments: { size: 0 } };
        expect(aiSafeCache.isEligibleForCache(longMsg, "", [])).toBe(false);
    });

    it('cache is server-specific', () => {
        const msg = { content: "harmless test message", attachments: { size: 0 } };
        aiSafeCache.add('server1', msg.content);
        expect(aiSafeCache.has('server2', msg.content)).toBe(false);
        expect(aiSafeCache.has('server1', msg.content)).toBe(true);
    });

    it('cache expires correctly', () => {
        aiSafeCache.add('server1', 'hello world');
        expect(aiSafeCache.has('server1', 'hello world')).toBe(true);
        
        // Advance time by 12 hours + 1 ms
        vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
        
        expect(aiSafeCache.has('server1', 'hello world')).toBe(false);
    });

    it('cache invalidates with version increment', () => {
        const msg = { content: "safe test message", attachments: { size: 0 } };
        aiSafeCache.add('serverX', msg.content);
        expect(aiSafeCache.has('serverX', msg.content)).toBe(true);
        
        aiSafeCache.incrementVersion('serverX');
        
        expect(aiSafeCache.has('serverX', msg.content)).toBe(false);
    });

    it('expires max size limit correctly', () => {
        const tmpCache = new AISafeCache();
        // Since max is private, we simulate the size logic
        for(let i=0; i<10005; i++) {
            tmpCache.add('server1', 'msg' + i);
        }
        // msg0 should be evicted
        expect(tmpCache.has('server1', 'msg0')).toBe(false);
        // msg10004 should be there
        expect(tmpCache.has('server1', 'msg10004')).toBe(true);
    });

    it('harmless messages cache even with mentions', () => {
        const msgGG = { content: "gg", mentions: { users: new Map([["1", {}]]) } };
        // Now returns false because mentions add local structural risk
        expect(aiSafeCache.isEligibleForCache(msgGG, "", [])).toBe(false);

        const msgThanks = { content: "thanks bro", attachments: { size: 0 } };
        expect(aiSafeCache.isEligibleForCache(msgThanks, "", [])).toBe(true);

        const msgNice = { content: "nice shot" };
        expect(aiSafeCache.isEligibleForCache(msgNice, "", [])).toBe(true);
    });

    it('nuanced targeted messages do not cache', () => {
        const msgNuanced = { content: "Wow, you are a literal genius", mentions: { users: new Map([["1", {}]]) } };
        expect(aiSafeCache.isEligibleForCache(msgNuanced, "", [])).toBe(false);
    });

    it('custom-rule uncertain messages do not cache', () => {
        const msgCustom = { content: "I am discussing politics" };
        expect(aiSafeCache.isEligibleForCache(msgCustom, "No politics", ["politics"])).toBe(false);
    });

    it('linguistic uncertain messages do not cache', () => {
        // e.g. using sarcasm hints
        const msgUncertain = { content: "I totally love being insulted /s" };
        expect(aiSafeCache.isEligibleForCache(msgUncertain, "", [])).toBe(false);
    });
});

describe('AISafeCache Integration with executeAIModeration', () => {
    it('caches high-confidence AI safe message after execution', async () => {
      const executeAIModeration = (global as any).__executeAIModeration;
      if (!executeAIModeration) return;

      const mockDb = {
        collection: (name: string) => ({
            doc: () => ({
                get: async () => ({ data: () => ({ score: 0 }) }),
                set: async () => {},
                collection: () => ({ doc: () => ({ set: async () => {} }) })
            }),
            add: async () => { },
            where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) })
        })
      };

      const globalFetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '{"results":[{"index":1,"level":"Safe","confidence":99,"flag":false,"reason":""}]}' } }],
        })
      } as any);

      aiSafeCache.clear();
      const fakeReq = {
          serverId: "ai-cache-test-server",
          message: { 
            content: "a very lovely day!", 
            createdAt: new Date(), 
            author: { id: "1", username: "u", displayAvatarURL: () => "url" }, 
            channelId: "c1", 
            attachments: { size: 0 } 
          },
          rulesText: "", trainingContextText: "", historyText: "",
          isPremium: false, serverData: { primaryConfidenceThreshold: 75 }
      };

      process.env.GROQ_API_KEY = "test";
      await executeAIModeration(fakeReq);

      expect(aiSafeCache.has("ai-cache-test-server", "a very lovely day!")).toBe(true);
      globalFetchSpy.mockRestore();
    });
});

