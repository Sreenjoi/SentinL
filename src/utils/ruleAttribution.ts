export type ModerationCategory = 
  | "Safe"
  | "Harassment or Insult"
  | "Threat or Violence"
  | "Sexual Content"
  | "Hate or Slur"
  | "Spam or Scam"
  | "Invite or Link Violation"
  | "Self-Harm Concern"
  | "Custom Rule Violation"
  | "Obfuscation or Evasion"
  | "Transliteration or Cross-Language Abuse"
  | "Nuanced Toxicity"
  | "Unknown Unsafe";

export interface AttributionOptions {
  text: string;
  aiResult: {
    flag: boolean;
    confidence: number;
    level: string;
    category?: string;
    evidenceType?: string;
    reason: string;
  };
  serverRules?: string;
  triggeredLocalSignals?: {
    hasObfuscation?: boolean;
    hasTransliteration?: boolean;
    hasCustomRuleMatch?: boolean;
    routeForCustomRuleReview?: boolean;
    confirmedCustomRuleViolation?: boolean;
    hasNuanceRisk?: boolean;
    hasInvite?: boolean;
    hasSpam?: boolean;
    hasThreat?: boolean;
    [key: string]: boolean | undefined;
  };
  moderationMetadata?: any;
}

export interface AttributionResult {
  primaryRule: string;
  primaryCategory: string;
  secondaryCategories: string[];
  reason: string;
  confidence: number;
  correctedReason: boolean;
}

export function attributeModerationRule(options: AttributionOptions): AttributionResult {
  const { text, aiResult, serverRules, triggeredLocalSignals } = options;
  const signals = triggeredLocalSignals || {};
  
  if (!aiResult.flag || aiResult.level === "Safe" || aiResult.level === "None") {
    return {
      primaryRule: "Safe",
      primaryCategory: "Safe",
      secondaryCategories: [],
      reason: aiResult.reason,
      confidence: aiResult.confidence,
      correctedReason: false
    };
  }

  const categoryScores: Record<ModerationCategory, number> = {
    "Safe": 0,
    "Harassment or Insult": 0,
    "Threat or Violence": 0,
    "Sexual Content": 0,
    "Hate or Slur": 0,
    "Spam or Scam": 0,
    "Invite or Link Violation": 0,
    "Self-Harm Concern": 0,
    "Custom Rule Violation": 0,
    "Obfuscation or Evasion": 0,
    "Transliteration or Cross-Language Abuse": 0,
    "Nuanced Toxicity": 0,
    "Unknown Unsafe": 0
  };

  const textLower = text.toLowerCase();
  
  // Base score from AI Result
  let aiCat = aiResult.category as ModerationCategory;
  if (aiCat && categoryScores[aiCat] !== undefined && aiCat !== "Safe") {
    categoryScores[aiCat] += 50; 
  } else if (aiCat) {
     // try to map AI category to taxonomy
     if (aiCat.toLowerCase().includes("harass") || aiCat.toLowerCase().includes("insult")) categoryScores["Harassment or Insult"] += 40;
     if (aiCat.toLowerCase().includes("threat") || aiCat.toLowerCase().includes("violen")) categoryScores["Threat or Violence"] += 40;
     if (aiCat.toLowerCase().includes("sexual") || aiCat.toLowerCase().includes("nsfw")) categoryScores["Sexual Content"] += 40;
     if (aiCat.toLowerCase().includes("hate") || aiCat.toLowerCase().includes("slur")) categoryScores["Hate or Slur"] += 40;
     if (aiCat.toLowerCase().includes("spam") || aiCat.toLowerCase().includes("scam")) categoryScores["Spam or Scam"] += 40;
  }

  // Base score from AI reason (text matching)
  const reasonLower = aiResult.reason.toLowerCase();
  if (reasonLower.includes("harass") || reasonLower.includes("insult")) categoryScores["Harassment or Insult"] += 20;
  if (reasonLower.includes("threat") || reasonLower.includes("violen")) categoryScores["Threat or Violence"] += 20;
  if (reasonLower.includes("sexual") || reasonLower.includes("nsfw")) categoryScores["Sexual Content"] += 20;
  if (reasonLower.includes("hate") || reasonLower.includes("slur")) categoryScores["Hate or Slur"] += 20;
  if (reasonLower.includes("spam") || reasonLower.includes("scam")) categoryScores["Spam or Scam"] += 20;
  if (
    reasonLower.includes("profane") ||
    reasonLower.includes("profanity") ||
    reasonLower.includes("abusive") ||
    reasonLower.includes("derogatory")
  ) {
    categoryScores["Harassment or Insult"] += 20;
  }

  // Local Signals - Very strong
  if (signals.hasThreat) categoryScores["Threat or Violence"] += 100;
  if (signals.hasSpam) categoryScores["Spam or Scam"] += 80;
  if (signals.hasInvite) categoryScores["Invite or Link Violation"] += 80;
  if (signals.confirmedCustomRuleViolation) categoryScores["Custom Rule Violation"] += 150;
  else if (signals.hasCustomRuleMatch) categoryScores["Custom Rule Violation"] += 150; // legacy if needed
  
  if (signals.hasNuanceRisk) categoryScores["Nuanced Toxicity"] += 40;

  // Direct evidence matching
  const hateRegex = /\b(niggas?|niggers?|fagg?s?|faggots?|retards?|trann(y|ies))\b/i;
  if (hateRegex.test(textLower)) {
    categoryScores["Hate or Slur"] += 100;
  }
  
  const threatRegex = /\b(kill|murder|stab|shoot|strangle) (you|u|ur|your|yourself)\b/i;
  if (threatRegex.test(textLower)) {
    categoryScores["Threat or Violence"] += 200;
  }
  
  const selfHarmRegex = /\b(kill myself|kms|suicide|kill yourself)\b/i;
  if (selfHarmRegex.test(textLower)) {
    categoryScores["Self-Harm Concern"] += 200;
  }

  if (textLower.includes("discord.gg/") || textLower.includes("discord.com/invite/")) {
     categoryScores["Invite or Link Violation"] += 90;
  }

  if (signals.hasObfuscation) {
    categoryScores["Obfuscation or Evasion"] += 30; // secondary to actual payload, unless nothing else matches well
  }
  if (signals.hasTransliteration) {
    categoryScores["Transliteration or Cross-Language Abuse"] += 30;
  }

  // If AI explicitly marked evidence type as obfuscated/transliterated and it's flagged
  if (aiResult.evidenceType === "obfuscated") {
     categoryScores["Obfuscation or Evasion"] += 20;
  }
  if (aiResult.evidenceType === "transliterated") {
     categoryScores["Transliteration or Cross-Language Abuse"] += 20;
  }
  if (aiResult.evidenceType === "custom_rule") {
     categoryScores["Custom Rule Violation"] += 80;
  }

  // Rank categories
  const sortedCategories = Object.entries(categoryScores)
    .filter(([cat, score]) => score > 0 && cat !== "Safe")
    .sort((a, b) => b[1] - a[1]);

  let primaryCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : "Unknown Unsafe";
  
  if (primaryCategory === "Unknown Unsafe" && aiCat) {
      const isKnown = Object.keys(categoryScores).includes(aiCat);
      if (isKnown) {
          primaryCategory = aiCat;
      }
  }

  const secondaryCategories = sortedCategories
    .slice(1, 4) // keep up to 3 secondaries
    .map(entry => entry[0])
    .filter(cat => cat !== primaryCategory);

  let correctedReason = false;
  let finalReason = aiResult.reason;

  const aiCatKnown = Object.keys(categoryScores).includes(aiCat || "");

  // Correct reason if AI selected a weak category
  if (aiCat && aiCat !== primaryCategory && (categoryScores[primaryCategory as ModerationCategory] >= 80 || !aiCatKnown)) {
    correctedReason = true;
    const mentionsWrongCategory = aiCat && finalReason.toLowerCase().includes(aiCat.toLowerCase());
    if (mentionsWrongCategory) {
       finalReason = `Message was flagged for ${primaryCategory}.`;
    }
  } else if (!aiCat || aiCat === "Unknown Unsafe") {
    correctedReason = true;
    const mentionsUnknown = finalReason.toLowerCase().includes("unknown unsafe");
    const mentionsEmpty = finalReason.trim() === "";
    if (mentionsUnknown || mentionsEmpty) {
       finalReason = `Message was flagged for ${primaryCategory}.`;
    }
  }

  return {
    primaryRule: primaryCategory, // In the dashboard we might want to map this to an explicit rule name, but for now we'll match category
    primaryCategory: primaryCategory,
    secondaryCategories,
    reason: finalReason,
    confidence: aiResult.confidence,
    correctedReason
  };
}
