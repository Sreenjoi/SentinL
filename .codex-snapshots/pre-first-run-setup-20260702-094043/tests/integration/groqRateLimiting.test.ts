import { describe, it, expect } from "vitest";
import { estimateTokensFromText, estimateGroqCallTokens, getStageMaxTokens, reserveGroqBudget } from "../../src/utils/groqBudget";

// create a dummy db
const dummyDb: any = {
  collection: (col: string) => ({
    doc: (d: string) => ({
       path: `${col}/${d}`,
    })
  }),
  runTransaction: async (cb: any) => {
     let t = {
        get: async () => ({ exists: false, data: () => null }),
        set: () => {}
     };
     return cb(t);
  }
};

describe("Groq Budget Utilities", () => {
  it("should estimate token count correctly", () => {
    // 1 char ~ 0.25 tokens => 4 chars = 1 token
    expect(estimateTokensFromText("test")).toBe(1);
    expect(estimateTokensFromText("hello world!")).toBe(3); // 12/4 = 3
  });

  it("should estimate total groq call tokens", () => {
    // system 13 chars (4 t), user 21 chars (6 t), max 100 = 110
    expect(estimateGroqCallTokens("System prompt", "User prompt goes here", 100)).toBe(110);
  });

  it("should assign correct max tokens by stage", () => {
    expect(getStageMaxTokens("primary_fast", 1)).toBe(160);
    expect(getStageMaxTokens("compact_linguistic", 2)).toBe(220); // 120 + 2 * 50
    expect(getStageMaxTokens("recommendations")).toBe(1000);
  });

  it("should allow request if within budget", async () => {
    process.env.GROQ_GLOBAL_LIMITER_ENABLED = "true";
    process.env.GROQ_RPM_LIMIT = "25";
    process.env.GROQ_TPM_LIMIT = "4500";
    
    const result = await reserveGroqBudget(dummyDb, 100);
    expect(result.allowed).toBe(true);
  });

  it("should block request if TPM limit exceeded", async () => {
    process.env.GROQ_GLOBAL_LIMITER_ENABLED = "true";
    process.env.GROQ_RPM_LIMIT = "25";
    process.env.GROQ_TPM_LIMIT = "4500";

    const dbExcess: any = {
      collection: (col: string) => ({
        doc: (d: string) => ({ path: `${col}/${d}` })
      }),
      runTransaction: async (cb: any) => {
         let t = {
            get: async () => ({ 
                exists: true, 
                data: () => ({
                   windowStartMs: Date.now() - 10000,
                   requestCount: 5,
                   estimatedTokenCount: 4000 // the safety limit is 4500 * 0.8 = 3600, so 4000 is > 3600
                })
            }),
            set: () => {}
         };
         return cb(t);
      }
    };
    
    const result = await reserveGroqBudget(dbExcess, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("tpm_safety_limit");
  });
});
