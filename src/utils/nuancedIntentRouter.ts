export interface NuancedIntentMetadata {
  hasMention?: boolean;
  isReply?: boolean;
  likelyTargetUserId?: string;
  previousAuthorDifferent?: boolean;
  customRulesText?: string;
  repeatedDirectedCount?: number;
}

import { shouldForceFullPassForLinguisticUncertainty } from "./linguisticUncertainty.js";

function normalizeModerationText(text: string): { normalized: string; tokens: string[] } {
  const normalized = text.toLowerCase().trim();
  const tokens = normalized.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  return { normalized, tokens };
}

function containsTokenOrPhrase(normalized: string, tokens: string[], value: string): boolean {
  const cleaned = value.toLowerCase().trim();
  if (!cleaned) return false;
  if (cleaned.includes(" ")) {
    return new RegExp(`\\b${escapeRegExp(cleaned).replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized);
  }
  return tokens.includes(cleaned);
}

function containsAnyTokenOrPhrase(normalized: string, tokens: string[], values: string[]): boolean {
  return values.some((value) => containsTokenOrPhrase(normalized, tokens, value));
}

function startsWithTokenOrPhrase(normalized: string, value: string): boolean {
  const cleaned = value.toLowerCase().trim();
  if (!cleaned) return false;
  return new RegExp(`^${escapeRegExp(cleaned).replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized);
}

function containsPhraseBoundary(normalized: string, value: string): boolean {
  const cleaned = value.toLowerCase().trim();
  if (!cleaned) return false;
  return new RegExp(`\\b${escapeRegExp(cleaned).replace(/\s+/g, "\\s+")}\\b`, "i").test(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isFastPassFinalClearEligible(
  text: string,
  metadata: NuancedIntentMetadata = {}
): { eligible: boolean, reasons: string[] } {
  const reasons: string[] = [];
  
  if (!text || text.trim().length === 0) {
    return { eligible: true, reasons };
  }

  const { normalized, tokens } = normalizeModerationText(text);
  
  const harmlessPhrases = [
    'nice shot', 'good game', 'thanks for explaining', 'you helped a lot', 'great job team', 'wow that was awesome'
  ];

  if (harmlessPhrases.some(phrase => normalized.includes(phrase))) {
      return { eligible: true, reasons };
  }

  const isShort = tokens.length <= 15;

  const directAddressWords = ['you', 'your', 'youre', 'yours', 'u', 'ur'];
  const hasDirectAddress = 
    tokens.some(t => directAddressWords.includes(t)) || 
    !!metadata.isReply || 
    !!metadata.hasMention;

  const hasTargeting = hasDirectAddress || !!metadata.repeatedDirectedCount;

  const evaluativeWords = [
    'genius', 'smart', 'great', 'nice', 'classic', 'proud', 'bold', 'hero', 
    'master', 'boss', 'brilliant', 'perfect', 'amazing', 'special', 'explain', 'explains'
  ];
  const hasEvaluation = tokens.some(t => evaluativeWords.includes(t));

  const judgmentShapes = [
    /classic\s+(you|u|ur|your)/i,
    /that\s+explains\s+a\s+lot/i,
    /(you|u)\s+must\s+be\s+proud/i,
    /bold\s+choice/i,
    /(you|u)\s+did\s+it\s+again/i,
    /absolute\s+genius/i,
    /really\s+smart/i,
    /how\s+genius\s+of\s+you/i
  ];
  let matchesShape = false;
  for (const shape of judgmentShapes) {
    if (shape.test(normalized)) {
      matchesShape = true;
      break;
    }
  }

  let hasToxicRules = false;
  if (metadata.customRulesText) {
     const rulesLower = metadata.customRulesText.toLowerCase();
     const toxicKeywords = ['toxic', 'harassment', 'bullying', 'sarcasm', 'baiting', 'drama', 'respect', 'targeted', 'passive aggression', 'passive aggressive', 'passive-aggressive'];
     if (toxicKeywords.some(kw => rulesLower.includes(kw))) {
         hasToxicRules = true;
     }
  }

  const linguisticUncertainty = shouldForceFullPassForLinguisticUncertainty(text);

  let eligible = true;

  if (hasTargeting) {
    reasons.push("Message directly targets a person");
    eligible = false;
  }

  if (isShort && hasTargeting) {
    if (!reasons.includes("Message directly targets a person")) {
        reasons.push("Message is short and directed at someone");
    }
    eligible = false;
  }

  if (hasEvaluation || matchesShape) {
    reasons.push("Message contains judgment/evaluation shape, comparison shape, blame shape, mockery shape, or compliment that may be insult");
    eligible = false;
  }

  if (linguisticUncertainty.forceFullPass) {
    reasons.push("Message contains unfamiliar short slang or mixed-language uncertainty");
    eligible = false;
  }

  if (hasToxicRules) {
    reasons.push("Message is related to server custom rules around respect, toxicity, harassment etc.");
    eligible = false;
  }

  return { eligible, reasons };
}

export function analyzeNuancedIntent(
  text: string,
  metadata: NuancedIntentMetadata = {}
): { score: number; reasons: string[]; needsContext: boolean; reviewOnlyPreferred: boolean; hasTargeting: boolean; hasToxicRules: boolean } {
  const reasons: string[] = [];
  let score = 0;
  
  let hasToxicRules = false;
  if (metadata.customRulesText) {
     const rulesLower = metadata.customRulesText.toLowerCase();
     const toxicKeywords = ['toxic', 'harassment', 'bullying', 'sarcasm', 'baiting', 'drama', 'respect', 'targeted', 'passive aggression', 'passive aggressive', 'passive-aggressive'];
     if (toxicKeywords.some(kw => rulesLower.includes(kw))) {
         hasToxicRules = true;
     }
  }

  if (!text || text.trim().length === 0) {
    return { score: 0, reasons, needsContext: false, reviewOnlyPreferred: false, hasTargeting: false, hasToxicRules };
  }

  const { normalized, tokens } = normalizeModerationText(text);
  
  // Highly targeted, short messages are more suspicious if they contain nuance
  const isShort = tokens.length <= 15;

  const directAddressWords = ['you', 'your', 'youre', 'u', 'ur'];
  const hasDirectAddress = 
    tokens.some(t => directAddressWords.includes(t)) || 
    !!metadata.isReply || 
    !!metadata.hasMention;

  const hasTargeting = hasDirectAddress || !!metadata.repeatedDirectedCount;

  const evaluativeWords = [
    'genius', 'smart', 'great', 'nice', 'classic', 'proud', 'bold', 'hero', 
    'master', 'boss', 'brilliant', 'perfect', 'amazing', 'special', 'explain', 'explains'
  ];
  const hasEvaluation = tokens.some(t => evaluativeWords.includes(t));

  const intensifiers = ['wow', 'absolute', 'absolutely', 'really', 'so', 'such', 'very', 'too', 'always', 'never', 'must', 'again', 'exactly', 'actually'];
  const hasIntensifier = tokens.some(t => intensifiers.includes(t));

  // Common harmless phrases that look like evaluation but are generally benign
  const harmlessPhrases = [
    'great job team', 'nice shot', 'good game', 'thanks for explaining', 'you helped a lot', 'wow that was awesome'
  ];

  if (harmlessPhrases.some(phrase => normalized.includes(phrase))) {
     return { score: 0, reasons, needsContext: false, reviewOnlyPreferred: false, hasTargeting, hasToxicRules };
  }

  // Specifically check for sarcastic/nuanced phrase shapes
  const sarcasticShapes = [
    /classic\s+(you|u|ur|your)/i,
    /that\s+explains\s+a\s+lot/i,
    /(you|u)\s+must\s+be\s+proud/i,
    /bold\s+choice/i,
    /(you|u)\s+did\s+it\s+again/i,
    /absolute\s+genius/i,
    /really\s+smart/i,
    /how\s+genius\s+of\s+(you|u)/i,
    /nobody\s+cares/i
  ];

  let matchesSarcasticShape = false;
  for (const shape of sarcasticShapes) {
    if (shape.test(normalized)) {
      matchesSarcasticShape = true;
      reasons.push('Matches sarcastic/nuanced phrase shape');
      score += 2;
      break;
    }
  }

  if (isShort && hasDirectAddress && hasEvaluation) {
    // Basic "great job bro" vs "you are an absolute genius"
    reasons.push('Short targeted message with evaluation');
    score += 1;
    
    if (hasIntensifier) {
      reasons.push('Contains intensifiers or exaggeration');
      score += 1;
    }
  }

  if (metadata.isReply && metadata.previousAuthorDifferent) {
    reasons.push('Reply to a different user');
    score += 1;
  }

  if (metadata.repeatedDirectedCount && metadata.repeatedDirectedCount > 0) {
    reasons.push('Repeated directed comments');
    score += Math.min(metadata.repeatedDirectedCount, 2);
  }

  if (hasToxicRules && score > 0) {
      score += 1;
      reasons.push('Server has strict rules on respect/toxicity');
  }

  return {
    score,
    reasons,
    needsContext: score >= 2,
    reviewOnlyPreferred: false,
    hasTargeting,
    hasToxicRules
  };
}

export function shouldUseSafetyMicroContext(
  text: string,
  metadata: NuancedIntentMetadata = {}
): { useMicroContext: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (!text || text.trim().length === 0) {
    return { useMicroContext: false, reasons };
  }

  const { normalized, tokens } = normalizeModerationText(text);
  
  // Obvious standalone violations should NOT use micro-context
  const obviousViolations = [
    /fuck/i, /shit/i, /bitch/i, /whore/i, /slut/i, /cunt/i, /\bniggas?\b/i, /\bniggers?\b/i, /\bfagg?s?\b/i, /\bfaggots?\b/i, /kill\s+you/i,
    /kys/i, /die/i, /discord\.gg\//i, /http/i, /steam.*free/i, /free.*nitro/i, /gift.*nitro/i,
    /murder\s+you/i, /bomb\s+the/i, /shoot\s+up/i, /stab\s+you/i, /strangle\s+you/i
  ];
  if (obviousViolations.some(regex => regex.test(normalized))) {
    return { useMicroContext: false, reasons };
  }

  const isShort = tokens.length <= 20;

  const directAddressWords = ['you', 'your', 'youre', 'yours', 'u', 'ur'];
  const hasDirectAddress = tokens.some(t => directAddressWords.includes(t)) || !!metadata.isReply || !!metadata.hasMention;

  const evaluativeWords = [
    'genius', 'smart', 'great', 'nice', 'classic', 'proud', 'bold', 'hero', 
    'master', 'boss', 'brilliant', 'perfect', 'amazing', 'special', 'explain', 'explains',
    'intelligence', 'skill', 'usefulness', 'behavior', 'choices', 'competence'
  ];
  const hasEvaluation = tokens.some(t => evaluativeWords.includes(t));

  const judgmentShapes = [
    /classic\s+(you|u|ur|your)/i,
    /that\s+explains\s+a\s+lot/i,
    /(you|u)\s+must\s+be\s+proud/i,
    /bold\s+choice/i,
    /(you|u)\s+did\s+it\s+again/i,
    /absolute\s+genius/i,
    /really\s+smart/i,
    /how\s+genius\s+of\s+(you|u)/i,
    /nobody\s+cares/i
  ];
  let matchesShape = false;
  for (const shape of judgmentShapes) {
    if (shape.test(normalized)) {
      matchesShape = true;
      break;
    }
  }

  let hasToxicRules = false;
  if (metadata.customRulesText) {
     const rulesLower = metadata.customRulesText.toLowerCase();
     const toxicKeywords = ['toxic', 'harassment', 'bullying', 'sarcasm', 'baiting', 'drama', 'respect', 'targeted', 'passive aggression', 'passive aggressive', 'passive-aggressive'];
     if (toxicKeywords.some(kw => rulesLower.includes(kw))) {
         hasToxicRules = true;
     }
  }

  let signalCount = 0;
  
  if (hasDirectAddress) {
    signalCount++;
    reasons.push("Message targets someone");
  }
  if (hasEvaluation || matchesShape) {
    signalCount++;
    reasons.push("Message contains evaluation/judgment or dismissive shape");
  }
  if (isShort && hasDirectAddress) {
    signalCount++;
    reasons.push("Message is short and targeted");
  }
  if (metadata.isReply || metadata.hasMention) {
     signalCount++;
     reasons.push("Message is a reply or mentions someone");
  }
  if (hasToxicRules) {
     signalCount++;
     reasons.push("Server rules mention sarcasm/respect/toxicity");
  }

  const harmlessPhrases = [
    'great job team', 'nice shot', 'good game', 'thanks for explaining', 'you helped a lot', 'wow that was awesome'
  ];

  if (harmlessPhrases.some(phrase => normalized.includes(phrase)) && !matchesShape) {
      return { useMicroContext: false, reasons };
  }

  if (signalCount >= 2 && (hasDirectAddress && (hasEvaluation || matchesShape))) {
     return { useMicroContext: true, reasons };
  }
  
  if (matchesShape) {
     return { useMicroContext: true, reasons };
  }

  return { useMicroContext: false, reasons };
}

export function getNuancedRouterHint(score: number, hasToxicRules?: boolean): string {
  if (score >= 2) {
    if (hasToxicRules) {
      return " [router_hint: targeted evaluation / possible sarcasm; server rules mention sarcasm/respect]";
    }
    return " [router_hint: targeted evaluation / possible sarcasm]";
  }
  return "";
}

export function shouldRouteToFullPassBasedOnNuance(score: number, isFlagged: boolean, fastPassConfidence: number): boolean {
  if (score >= 3) {
    if (fastPassConfidence < 98) return true;
  } else if (score >= 2) {
    if (fastPassConfidence < 95) return true;
  }
  
  return false;
}

export async function fetchMicroContext(msg: any): Promise<string> {
    try {
        let contextLines: string[] = [];
        let usersMap = new Map<string, string>();
        let userCounter = 1;
        
        const getAnonName = (id: string, username: string) => {
            if (!usersMap.has(id)) {
                usersMap.set(id, `User${userCounter++}`);
            }
            return usersMap.get(id)!;
        };

        const truncateLine = (s: string) => s.length > 80 ? s.substring(0, 77) + "..." : s;

        // 1. Replied-to message first
        if (msg.reference?.messageId) {
            try {
                const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
                if (repliedMsg && !repliedMsg.author.bot) {
                    contextLines.push(`[${getAnonName(repliedMsg.author.id, repliedMsg.author.username)}]: ${truncateLine(repliedMsg.content)}`);
                }
            } catch (e) {
               // Ignore
            }
        }

        // 2. Mentioned user's recent message second
        if (contextLines.length === 0 && msg.mentions?.users?.size > 0) {
            const firstMention = Array.from(msg.mentions.users.values())[0] as any;
            if (firstMention && !firstMention.bot) {
                try {
                    const recentMsgs = await msg.channel.messages.fetch({ limit: 10, before: msg.id });
                    const recentMentionMsg = Array.from(recentMsgs.values() as any[]).find((m: any) => m.author.id === firstMention.id);
                    if (recentMentionMsg) {
                        contextLines.push(`[${getAnonName(recentMentionMsg.author.id, recentMentionMsg.author.username)}]: ${truncateLine(recentMentionMsg.content)}`);
                    }
                } catch (e) {
                   // Ignore
                }
            }
        }

        // 3. Otherwise last 3 non-bot channel messages
        if (contextLines.length === 0) {
            try {
                const recentMsgs = await msg.channel.messages.fetch({ limit: 5, before: msg.id });
                const nonBotMsgs = Array.from(recentMsgs.values() as any[]).filter((m: any) => !m.author.bot).slice(0, 3).reverse();
                for (const m of nonBotMsgs) {
                    contextLines.push(`[${getAnonName(m.author.id, m.author.username)}]: ${truncateLine(m.content)}`);
                }
            } catch (e) {
               // Ignore
            }
        }

        if (contextLines.length === 0) return "";

        let contextResult = contextLines.slice(0, 5).join("\n");
        if (contextResult.length > 500) {
            contextResult = contextResult.substring(0, 497) + "...";
        }
        
        return `\n[Micro-context:\n${contextResult}\n]`;
    } catch (e) {
        return "";
    }
}

export function determineFlagAction(
  analysisLevel: string,
  confidenceScore: number,
  threshold: number,
  routedByNuance: boolean,
  nuanceScore: number,
  hasToxicRules: boolean
): { shouldFlag: boolean, reviewOnly: boolean, status: string, detectionMethod: string, routingCategory?: string } {
  let lvl = analysisLevel?.charAt(0).toUpperCase() + analysisLevel?.slice(1).toLowerCase();
  const isSafe = !lvl || ["Safe", "None", "Null"].includes(lvl);
  
  if (isSafe) {
     if (routedByNuance && confidenceScore >= 50 && nuanceScore >= 2 && hasToxicRules) {
        return { shouldFlag: true, reviewOnly: true, status: "needs_review", detectionMethod: "ai_review_only", routingCategory: "nuanced_intent" };
     }
     return { shouldFlag: false, reviewOnly: false, status: "none", detectionMethod: "none" };
  }
  
  if (confidenceScore >= threshold) {
     return { shouldFlag: true, reviewOnly: false, status: "pending", detectionMethod: "ai" };
  } else if (routedByNuance && confidenceScore >= 45) {
     return { shouldFlag: true, reviewOnly: true, status: "needs_review", detectionMethod: "ai_review_only", routingCategory: "nuanced_intent" };
  }
  
  return { shouldFlag: false, reviewOnly: false, status: "none", detectionMethod: "none" };
}


export function analyzeTargetedPragmaticHostility(text: string, metadata: NuancedIntentMetadata = {}): { score: number; reasons: string[]; forceFullPass: boolean; needsMicroContext: boolean; reviewOnlyPreferred: boolean; routerHint: string; hasTargeting: boolean; hasToxicRules: boolean; } {
  const reasons: string[] = [];
  let score = 0;
  
  if (!text || text.trim().length === 0) {
    return { score: 0, reasons, forceFullPass: false, needsMicroContext: false, reviewOnlyPreferred: false, routerHint: "", hasTargeting: false, hasToxicRules: false };
  }

  const { normalized, tokens } = normalizeModerationText(text);

  // A. Target Role
  const directAddressWords = ["you", "your", "youre", "yours", "u", "ur", "yourself"];
  const thirdPersonWords = ["he", "she", "they", "this guy", "this person", "bro", "dude", "kid"];
  
  let hasTargeting = false;
  let targetingScore = 0;

  if (tokens.some(t => directAddressWords.includes(t)) || metadata.isReply || metadata.hasMention) {
    targetingScore = 2;
    hasTargeting = true;
    reasons.push("Targeting: Clear target");
  } else if (containsAnyTokenOrPhrase(normalized, tokens, thirdPersonWords)) {
    targetingScore = 1;
    reasons.push("Targeting: Weak target");
  }

  score += targetingScore;

  if (metadata.repeatedDirectedCount && metadata.repeatedDirectedCount > 0) {
    const repeatScore = Math.min(metadata.repeatedDirectedCount, 2);
    score += repeatScore;
    reasons.push("Targeting: Repeated directed behavior");
  }

  // B. Attribute Domain Role
  const mentalCompetence = ["brain", "lightbulb", "head", "mind", "iq", "logic", "sense", "reading", "thinking", "smart", "genius", "idiot", "dumb", "stupid", "moron", "fool", "delusional", "braindead"];
  const emotionalControl = ["cry", "crybaby", "tears", "mad", "upset", "angry", "cope", "seethe", "fragile", "sensitive", "triggered", "feelings"];
  const maturity = ["kid", "child", "baby", "immature", "grow up"];
  const usefulness = ["useless", "trash", "garbage", "waste"];
  let hasAttackedAttribute = false;
  const socialBehavior = ["personality", "attitude", "behavior", "ego", "character", "vibes"];
  if (containsAnyTokenOrPhrase(normalized, tokens, socialBehavior)) {
    hasAttackedAttribute = true;
    reasons.push("Attribute: Social behavior/personality");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, mentalCompetence)) {
    hasAttackedAttribute = true;
    reasons.push("Attribute: Mental/Competence");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, emotionalControl)) {
    hasAttackedAttribute = true;
    reasons.push("Attribute: Emotional control");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, maturity)) {
    hasAttackedAttribute = true;
    reasons.push("Attribute: Maturity");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, usefulness)) {
    hasAttackedAttribute = true;
    reasons.push("Attribute: Usefulness");
  }
  
  if (hasAttackedAttribute) score += 2;

  // C. Negative Predicate Role
  const absenceFailure = ["broken", "missing", "lack", "fail", "failed", "absence", "none", "zero", "empty", "blind", "slow"];
  const inability = ["cant", "cannot", "struggle", "incapable", "unable", "hard time"];
  const dismissiveContempt = ["whatever", "irrelevant", "cringe", "yikes", "delulu", "yap", "yapping"];
  const negatedAbility = ["not even", "never", "didnt even", "barely"];

  let hasNegativePredicate = false;
  let hasNegatedAbility = false;

  if (containsAnyTokenOrPhrase(normalized, tokens, absenceFailure)) {
    hasNegativePredicate = true;
    reasons.push("Predicate: Absence/Failure/Brokenness");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, inability)) {
    hasNegativePredicate = true;
    reasons.push("Predicate: Inability");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, dismissiveContempt)) {
    hasNegativePredicate = true;
    reasons.push("Predicate: Dismissal/Contempt");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, negatedAbility)) {
    hasNegatedAbility = true;
    reasons.push("Predicate: Negated ability");
  }

  if (hasNegativePredicate) score += 2;
  if (hasNegatedAbility) score += 2;

  // D. Hostile Framing Role
  const rhetoricalPhrases = ["arent you", "are you", "do you", "how are you", "why are you", "can you even", "maybe", "perhaps"];
  const mockPoliteness = ["kindly", "bless your heart", "so brave", "aww", "awww", "cute", "sweetie", "honey", "buddy", "pal", "kiddo", "yeah okay", "yeah right", "good luck with that", "good luck with"];
  const exaggeratedPraise = ["absolute genius", "master", "brilliant", "proud"];

  let hasMockFraming = false;
  let hasDismissiveFraming = false;

  if (rhetoricalPhrases.some(w => startsWithTokenOrPhrase(normalized, w) || containsPhraseBoundary(normalized, w))) {
    hasMockFraming = true;
    reasons.push("Framing: Rhetorical/Mock");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, mockPoliteness)) {
    hasMockFraming = true;
    reasons.push("Framing: Mock politeness / Infantilizing");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, exaggeratedPraise)) {
    hasMockFraming = true;
    reasons.push("Framing: Exaggerated praise");
  }
  if (containsAnyTokenOrPhrase(normalized, tokens, dismissiveContempt)) { // re-use for framing score
    hasDismissiveFraming = true;
    reasons.push("Framing: Dismissive/Contempt");
  }

  if (hasMockFraming) score += 1;
  if (hasDismissiveFraming) score += 1;

  // Server Rules
  let hasToxicRules = false;
  if (metadata.customRulesText) {
    const rulesLower = metadata.customRulesText.toLowerCase();
    const toxicConcepts = ["respect", "toxic", "sarcasm", "passive aggression", "passive-aggressive", "passive aggressive", "harassment", "bullying", "baiting", "drama", "mockery", "insults", "condescension"];
    if (toxicConcepts.some(c => rulesLower.includes(c))) {
      score += 1;
      hasToxicRules = true;
      reasons.push("Server rules align with nuanced hostility detection");
    }
  }

  // De-escalating / Positive Intent
  const supportiveCues = ["hope you feel better", "im here for you", "you got this", "take care", "so sorry", "my condolences", "glad you", "proud of you for"];
  const neutralGameplayCues = ["good game", "gg", "nice shot", "well played", "wp", "thanks for explaining", "thank you", "you helped a lot", "great job team", "wow that was awesome", "i love this update", "amazing!!!", "thanks for"];
  
  const selfDirected = /i am|im \b(such an?|so)\b|my \b(brain|head|fault)\b/i.test(text);

  if (supportiveCues.some(c => normalized.includes(c))) {
    score -= 3;
    reasons.push("Clear supportive/de-escalating intent");
  } else if (neutralGameplayCues.some(c => normalized.includes(c))) {
    score -= 3;
    reasons.push("Clear neutral/gameplay/team/appreciation intent");
  } else if (selfDirected) {
    // Self-directed insult should not count as targeted hostility to OTHERS
    score -= 2;
    reasons.push("Self-directed interpretation possible");
  } else if (normalized.includes("i disagree") || normalized.includes("i don't think so") || normalized.includes("that's not right")) {
    score -= 2;
    reasons.push("Neutral disagreement");
  }

  const hasStructuralHostility = hasAttackedAttribute || hasNegativePredicate || hasNegatedAbility || hasMockFraming || hasDismissiveFraming;

  let forceFullPass = false;
  if (score >= 5 && hasStructuralHostility) forceFullPass = true;
  if (score >= 4 && hasTargeting && hasStructuralHostility) forceFullPass = true;
  if (score >= 3 && hasTargeting && hasToxicRules && hasStructuralHostility) forceFullPass = true;
  
  // Make sure reviewOnlyPreferred tracks if we'd prefer review over ignoring completely
  let reviewOnlyPreferred = false;
  if ((score >= 4 && hasTargeting && hasStructuralHostility) || (score >= 3 && hasAttackedAttribute) || (score >= 3 && hasTargeting && hasToxicRules && hasStructuralHostility)) {
    reviewOnlyPreferred = true;
    forceFullPass = true;
  }

  let needsMicroContext = false;
  if (score >= 2 && hasTargeting) {
    needsMicroContext = true;
  }

  let routerHint = "";
  if (score >= 2) {
    const types = [];
    if (hasAttackedAttribute) types.push("attribute attacked");
    if (hasNegativePredicate) types.push("negative predicate");
    if (hasNegatedAbility) types.push("negated ability");
    if (hasMockFraming) types.push("mock framing");
    if (hasDismissiveFraming) types.push("dismissive framing");
    routerHint = " [router_hint: pragmatic hostility check (score=" + score + "). types: " + types.join(",") + "]";
  }

  return {
    score,
    reasons,
    forceFullPass,
    needsMicroContext,
    reviewOnlyPreferred,
    routerHint,
    hasTargeting,
    hasToxicRules
  };
}
