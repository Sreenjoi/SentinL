import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getPrimaryFastProvider, getPrimaryFastModel, callAIChatCompletion } from "../../src/utils/aiProvider";

describe("aiProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("getPrimaryFastProvider", () => {
    it("defaults to cloudflare when not set", () => {
      delete process.env.PRIMARY_AI_PROVIDER;
      expect(getPrimaryFastProvider()).toBe("cloudflare");
    });

    it("defaults to cloudflare when set to anything else", () => {
      process.env.PRIMARY_AI_PROVIDER = "openai";
      expect(getPrimaryFastProvider()).toBe("cloudflare");
    });

    it("returns cloudflare when set", () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      expect(getPrimaryFastProvider()).toBe("cloudflare");
    });
  });

  describe("getPrimaryFastModel", () => {
    it("returns PRIMARY_AI_MODEL for groq", () => {
      process.env.PRIMARY_AI_PROVIDER = "groq";
      process.env.PRIMARY_AI_MODEL = "llama-custom";
      expect(getPrimaryFastModel()).toBe("llama-custom");
    });

    it("returns default model for groq if PRIMARY_AI_MODEL not set", () => {
      process.env.PRIMARY_AI_PROVIDER = "groq";
      delete process.env.PRIMARY_AI_MODEL;
      expect(getPrimaryFastModel()).toBe("llama-3.1-8b-instant");
    });

    it("returns CLOUDFLARE_FAST_MODEL for cloudflare", () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      process.env.CLOUDFLARE_FAST_MODEL = "cf-custom";
      expect(getPrimaryFastModel()).toBe("cf-custom");
    });

    it("returns default model for cloudflare if CLOUDFLARE_FAST_MODEL not set", () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      delete process.env.CLOUDFLARE_FAST_MODEL;
      expect(getPrimaryFastModel()).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    });
  });

  describe("callAIChatCompletion", () => {
    it("throws a clear config error when missing Cloudflare env vars", async () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      delete process.env.CLOUDFLARE_API_TOKEN;

      await expect(
        callAIChatCompletion({ messages: [] })
      ).rejects.toThrow("Cloudflare configuration is missing (CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN)");
    });

    it("normalizes Cloudflare response to choices[0].message.content if it uses result.response", async () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
      process.env.CLOUDFLARE_API_TOKEN = "mock-token";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { response: "Normalized CF response" }
        })
      });

      const response = await callAIChatCompletion({ messages: [] });
      expect(response.choices[0].message.content).toBe("Normalized CF response");
    });

    it("normalizes Cloudflare response to choices[0].message.content if it uses flat response string", async () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
      process.env.CLOUDFLARE_API_TOKEN = "mock-token";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: "Flat response string"
        })
      });

      const response = await callAIChatCompletion({ messages: [] });
      expect(response.choices[0].message.content).toBe("Flat response string");
    });

    it("passes through Cloudflare response if it already has choices", async () => {
      process.env.PRIMARY_AI_PROVIDER = "cloudflare";
      process.env.CLOUDFLARE_ACCOUNT_ID = "mock-id";
      process.env.CLOUDFLARE_API_TOKEN = "mock-token";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Already normalized" } }]
        })
      });

      const response = await callAIChatCompletion({ messages: [] });
      expect(response.choices[0].message.content).toBe("Already normalized");
    });
  });
});
