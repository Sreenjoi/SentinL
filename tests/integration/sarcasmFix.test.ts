import { describe, it, expect } from "vitest";
import { analyzeTargetedPragmaticHostility } from "../../src/utils/nuancedIntentRouter";
import { AISafeCache } from "../../src/discordBot";

describe("Sarcasm Fix Requirements Test", () => {

  it("B. Targeted sarcasm with custom sarcasm rule", () => {
    const meta = { isReply: false, hasMention: true, customRulesText: "No sarcasm or passive aggression" };
    const res = analyzeTargetedPragmaticHostility("wow that explains a lot ur so brilliant", meta);
    // Targeting "ur", Evaluation "explains a lot", Exaggerated praise "brilliant", Toxic rule matches -> Score >= 3 and hasTargeting and hasToxicRules
    expect(res.reviewOnlyPreferred || res.forceFullPass).toBe(true);
  });
  
  it("D. Harmless praise", () => {
    const meta = { isReply: true, hasMention: false };
    const res = analyzeTargetedPragmaticHostility("great job team you helped a lot", meta);
    expect(res.score).toBeLessThan(0);
    expect(res.forceFullPass).toBe(false);
  });
  
  it("F. Cache protection", () => {
    const cache = new AISafeCache();
    // Normal cacheable
    expect(cache.isEligibleForCache({content: "hey there"}, "", [])).toBe(true);
    // Sarcasm
    const res = analyzeTargetedPragmaticHostility("you must be so proud of that explanation", { hasMention: true });
    expect(cache.isEligibleForCache({content: "you must be so proud of that explanation", mentions: {users: {size: 1}}}, "", [])).toBe(false);
  });
});
