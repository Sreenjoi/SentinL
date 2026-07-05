import { attributeModerationRule } from '../../src/utils/ruleAttribution.js';
import { describe, expect, test } from 'vitest';

describe('ruleAttribution', () => {
    test('AI chooses a weak/wrong category, attribution corrects it', () => {
        const result = attributeModerationRule({
            text: "I will kill you",
            aiResult: { flag: true, confidence: 95, level: "Extreme", category: "Harassment or Insult", reason: "Harassment" },
            triggeredLocalSignals: { hasThreat: true }
        });
        expect(result.primaryCategory).toBe("Threat or Violence");
        expect(result.correctedReason).toBe(true);
    });

    test('Custom rule with strong evidence wins', () => {
        const result = attributeModerationRule({
            text: "Buy my crypto",
            aiResult: { flag: true, confidence: 90, level: "Inappropriate", category: "Spam or Scam", reason: "Scam" },
            serverRules: "No crypto discussion",
            triggeredLocalSignals: { hasCustomRuleMatch: true }
        });
        expect(result.primaryCategory).toBe("Custom Rule Violation");
    });

    test('Obfuscation is only primary when disguise/evasion is central', () => {
        const result = attributeModerationRule({
            text: "f.u.c.k",
            aiResult: { flag: true, confidence: 90, level: "Inappropriate", category: "Harassment or Insult", reason: "Profanity", evidenceType: "obfuscated" },
            triggeredLocalSignals: { hasObfuscation: true }
        });
        expect(result.primaryCategory).toBe("Harassment or Insult");
        expect(result.secondaryCategories).toContain("Obfuscation or Evasion");
    });

    test('Transliteration is only primary when language/script is central', () => {
        const result = attributeModerationRule({
            text: "madarchod",
            aiResult: { flag: true, confidence: 90, level: "Extreme", category: "Hate or Slur", reason: "Transliterated slur", evidenceType: "transliterated" },
            triggeredLocalSignals: { hasTransliteration: true }
        });
        expect(result.primaryCategory).toBe("Hate or Slur");
        expect(result.secondaryCategories).toContain("Transliteration or Cross-Language Abuse");
    });

    test('Direct violation beats broad/generic categories', () => {
        const result = attributeModerationRule({
            text: "You are a faggot",
            aiResult: { flag: true, confidence: 95, level: "Extreme", category: "Unknown Unsafe", reason: "Offensive text" }
        });
        expect(result.primaryCategory).toBe("Hate or Slur");
    });

    test('Multiple matching rules produce one primary category and secondary categories', () => {
        const result = attributeModerationRule({
            text: "Kill yourself and join my discord.gg/spam",
            aiResult: { flag: true, confidence: 99, level: "Extreme", category: "Self-Harm Concern", reason: "Self harm and spam" },
            triggeredLocalSignals: { hasThreat: true, hasInvite: true }
        });
        expect(result.primaryCategory).toBe("Threat or Violence");
        expect(result.secondaryCategories.length).toBeGreaterThan(0);
        expect(result.secondaryCategories).toContain("Self-Harm Concern");
    });

    test('Malformed AI category falls back safely', () => {
        const result = attributeModerationRule({
            text: "Some random bad thing",
            aiResult: { flag: true, confidence: 80, level: "Inappropriate", category: "NonExistentCategory", reason: "General badness" }
        });
        expect(result.primaryCategory).toBe("Unknown Unsafe");
        expect(result.correctedReason).toBe(true);
    });

    test('Safe messages remain safe', () => {
        const result = attributeModerationRule({
            text: "Hello everyone",
            aiResult: { flag: false, confidence: 100, level: "Safe", category: "Safe", reason: "" }
        });
        expect(result.primaryCategory).toBe("Safe");
        expect(result.primaryRule).toBe("Safe");
        expect(result.secondaryCategories.length).toBe(0);
    });

    test('Keeps original reason when correcting category if it does not mention the wrong category', () => {
        const result = attributeModerationRule({
            text: "I will kill you",
            aiResult: { flag: true, confidence: 95, level: "Extreme", category: "Harassment or Insult", reason: "User is being overly aggressive" },
            triggeredLocalSignals: { hasThreat: true }
        });
        expect(result.primaryCategory).toBe("Threat or Violence");
        expect(result.correctedReason).toBe(true);
        expect(result.reason).toBe("User is being overly aggressive");
    });

    test('Replaces reason completely if it mentions the wrong category', () => {
        const result = attributeModerationRule({
            text: "I will kill you",
            aiResult: { flag: true, confidence: 95, level: "Extreme", category: "Harassment or Insult", reason: "This is a harassment or insult violation" },
            triggeredLocalSignals: { hasThreat: true }
        });
        expect(result.primaryCategory).toBe("Threat or Violence");
        expect(result.correctedReason).toBe(true);
        expect(result.reason).toBe("Message was flagged for Threat or Violence.");
    });

    test('Replaces reason cleanly when AI returns Unknown Unsafe', () => {
        const result = attributeModerationRule({
            text: "You are a faggot",
            aiResult: { flag: true, confidence: 95, level: "Extreme", category: "Unknown Unsafe", reason: "Flagged as Unknown Unsafe content" }
        });
        expect(result.primaryCategory).toBe("Hate or Slur");
        expect(result.correctedReason).toBe(true);
        expect(result.reason).toBe("Message was flagged for Hate or Slur.");
    });
});
