import { keywordMatchesMessage } from "./keywordHelper.js";
import { analyzeTargetedPragmaticHostility } from "./nuancedIntentRouter.js";

export function normalizeText(text: string): string {
  // Replace punctuation and special characters with spaces
  return ` ${text.toLowerCase().replace(/[.,!?;:()[\]{}"'`-]/g, ' ')} `;
}

export function includesPhrase(normalizedText: string, phrase: string): boolean {
  if (phrase === 'http' || phrase === 'www' || phrase.includes('.')) {
    // For domain matching or raw substrings, consider the dot might be a space in normalized
    return normalizedText.includes(phrase) || normalizedText.includes(phrase.replace(/\./g, ' '));
  }
  // Word boundary matching
  return normalizedText.includes(` ${phrase} `);
}

export function includesAny(normalizedText: string, phrases: string[]): boolean {
  return phrases.some(p => includesPhrase(normalizedText, p));
}

export function ruleMentionsConcept(rulesTextLower: string, concept: any): boolean {
  return concept.ruleTerms.some((t: string) => rulesTextLower.includes(t));
}

export function ruleAllowsConcept(rulesTextLower: string, concept: any): boolean {
  // If there are no allow terms or restriction terms, assume neutral
  const hasAllow = concept.allowTerms && concept.allowTerms.some((t: string) => rulesTextLower.includes(t));
  const hasRestrict = concept.restrictionTerms && concept.restrictionTerms.some((t: string) => rulesTextLower.includes(t));
  
  if (hasAllow && !hasRestrict) return true;
  return false;
}

export function messageMentionsConcept(normalizedMsg: string, concept: any, rawText?: string, rulesText?: string): boolean {
  if (concept.id === 'politics') {
    // If only 'president' matches, but it's "president of the club", ignore it.
    // A simple heuristic: if it matches 'president', ensure it doesn't just match 'president' without other context,
    // or simply just remove 'president' from triggering alone if 'club' is there.
    if (normalizedMsg.includes(' president ') && normalizedMsg.includes(' club ')) {
      return false;
    }
  }
  
  if (concept.id === 'nuanced_toxicity' && rawText) {
    const struct = analyzeTargetedPragmaticHostility(rawText, { customRulesText: rulesText || concept.ruleTerms.join(" ") });
    return struct.forceFullPass;
  }

  if (concept.id === 'promo') {
     const hasPromoTerm = includesAny(normalizedMsg, concept.messageTerms);
     if (hasPromoTerm) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        const urls = rawText?.match(urlRegex) || [];
        const nonInviteUrls = urls.filter(u => !u.includes('discord.gg') && !u.includes('discord.com/invite'));
        
        const otherTerms = concept.messageTerms.filter((t: string) => t !== 'http');
        if (includesAny(normalizedMsg, otherTerms)) return true;
        
        if (nonInviteUrls.length > 0) return true;
        
        // If 'http' matched but it was only discord invites without http:// (e.g. 'discord.gg/xyz' wasn't matched by regex but matched by 'http' if typed as 'http://discord.gg/xyz')
        // Actually, if 'http' is matched and nonInviteUrls is empty, we must have only invite urls.
        // Wait, if they just typed "http", it will trigger. But that's fine.
        return false;
     }
     return false;
  }

  return includesAny(normalizedMsg, concept.messageTerms);
}

export function hasNonLatinScript(text: string): boolean {
  // Match characters outside basic Latin, Numbers, punctuation and symbols
  // This is a simple regex that matches scripts like Cyrillic, Arabic, Han, Devanagari, etc.
  return /[^\u0000-\u024F\u1E00-\u1EFF\u2C60-\u2C7F\uA720-\uA7FF\uAB30-\uAB6F\s\d.,!?;:()[\]{}"'`@#$%^&*+=<>/\\|~_-]/.test(text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''));
}

export function keywordMatchesLiteral(text: string, keywords: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  for (const kw of keywords) {
    if (!kw) continue;
    if (keywordMatchesMessage(text, kw)) {
      return true;
    }
  }
  return false;
}

const ruleConcepts = [
  {
    id: "politics",
    ruleTerms: ["politics", "political", "election", "vote", "voting", "government", "president", "party", "religion", "religious", "debate", "controversy", "controversial"],
    messageTerms: ["politics", "political", "election", "vote", "voting", "government", "president", "democrat", "republican", "congress", "parliament", "religion", "religious", "debate"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome", "can discuss", "discussion allowed", "debate allowed"]
  },
  {
    id: "trading",
    ruleTerms: ["trade", "trading", "buy", "sell", "selling", "marketplace", "market", "account trading", "sales"],
    messageTerms: ["wts", "wtb", "selling", "buying", "trade", "trading", "price", "offer", "offers", "account for sale", "sell account", "buy account", "dm me price"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "promo",
    ruleTerms: ["promo", "promotion", "self promo", "self-promo", "advertise", "advertising", "ads", "links", "link sharing", "url", "urls"],
    messageTerms: ["check out", "subscribe", "follow me", "my channel", "my stream", "twitch.tv", "youtube.com", "youtu.be", "tiktok.com", "instagram.com", "x.com", "twitter.com", "http"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "discord_invites",
    ruleTerms: ["invite", "invites", "discord invite", "server invite"],
    messageTerms: ["discord.gg", "discord.com/invite", "join my server", "invite link", "server link"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "spoilers",
    ruleTerms: ["spoiler", "spoilers", "leak", "leaks"],
    messageTerms: ["spoiler", "spoilers", "leak", "leaked", "ending", "final boss", "dies", "death scene", "plot twist"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "dm_requests",
    ruleTerms: ["dm", "direct message", "private message", "no dms"],
    messageTerms: ["dm me", "pm me", "message me", "check dm", "inbox me", "private message me"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "giveaways",
    ruleTerms: ["giveaway", "giveaways", "free nitro", "free stuff", "rewards", "prize"],
    messageTerms: ["giveaway", "free nitro", "free robux", "free coins", "claim reward", "claim prize", "winner", "prize", "gift link"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "role_requests",
    ruleTerms: ["role", "roles", "role request", "role begging", "rank", "admin", "mod"],
    messageTerms: ["give me role", "can i get role", "add role", "mod role", "admin role", "rank me", "promote me"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "language",
    ruleTerms: ["english only", "only english", "english language", "no other languages", "language", "hindi", "urdu", "bengali", "profanity", "slang", "hinglish"],
    messageTerms: ["hindi", "spanish", "french", "bengali", "arabic", "russian", "chinese", "japanese", "korean", "urdu", "profanity", "slang", "hinglish"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only", "strictly"],
    allowTerms: ["multilingual allowed", "other languages allowed", "any language", "languages welcome"]
  },
  {
    id: "nsfw",
    ruleTerms: ["nsfw", "adult", "sexual", "explicit", "sfw"],
    messageTerms: ["nsfw", "onlyfans", "18+", "adult content", "explicit", "nude", "nudes", "porn"],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "channel only"],
    allowTerms: ["allowed", "okay", "ok", "permitted", "welcome"]
  },
  {
    id: "nuanced_toxicity",
    ruleTerms: ["sarcasm", "passive aggressive", "passive-aggressive", "mockery", "mocking", "baiting", "drama", "disrespect", "respect", "toxic", "toxicity", "bullying", "harassment", "targeted comments"],
    messageTerms: [],
    restrictionTerms: ["no", "ban", "banned", "disallow", "not allowed", "forbidden", "keep out", "avoid", "only in", "restricted", "strictly"],
    allowTerms: ["allowed", "welcome"]
  }
];

export function shouldForceFullPassForCustomRules(text: string, rulesText: string, keywords: string[]): boolean {
  if (keywordMatchesLiteral(text, keywords)) return true;
  if (!rulesText) return false;

  const rulesLower = rulesText.toLowerCase();
  const normalizedMsg = normalizeText(text);

  for (const concept of ruleConcepts) {
    if (ruleMentionsConcept(rulesLower, concept)) {
      if (ruleAllowsConcept(rulesLower, concept)) {
        // Concept is allowed, do not force full pass
        continue;
      }
      
      // Check if message triggers it
      if (messageMentionsConcept(normalizedMsg, concept, text, rulesText)) {
        return true;
      }

      // Special check for non-Latin script on language restriction
      if (concept.id === 'language' && hasNonLatinScript(text)) {
        return true;
      }
    }
  }

  return false;
}
