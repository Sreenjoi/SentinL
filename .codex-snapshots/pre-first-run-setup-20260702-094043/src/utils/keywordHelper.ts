import { logger } from "./logger.js";
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isExplicitRegex(keyword: string): boolean {
  return keyword.startsWith('/') && keyword.endsWith('/') && keyword.length > 2;
}

export function isSafeRegex(pattern: string): boolean {
  // Match group containing a quantifier, immediately followed by another quantifier
  // e.g. (a+)+, (.*)+, ([a-z]+)+, or nested like (?:.*){2,}
  const catastrophicPattern = /(\([^)]*(?:\*|\+|\{\d+(?:,\d*)?\})[^)]*\)(?:\*|\+|\{\d+(?:,\d*)?\})|(?:\.\*){2,})/;
  if (catastrophicPattern.test(pattern)) {
    return false;
  }
  return true;
}

export function validateKeyword(keyword: string): { valid: boolean; error?: string; normalized: string } {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return { valid: false, error: "Keyword cannot be empty", normalized: "" };
  }

  if (isExplicitRegex(trimmed)) {
    if (trimmed.length > 100) { 
      return { valid: false, error: "Regex pattern is too long (max 100 characters)", normalized: "" };
    }
    
    try {
      const pattern = trimmed.slice(1, -1);
      
      if (!isSafeRegex(pattern)) {
        return { valid: false, error: "Regex pattern contains catastrophic patterns.", normalized: "" };
      }

      const testRegex = new RegExp(pattern, "i");
      const testStr = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
      const start = Date.now();
      testRegex.test(testStr);
      if (Date.now() - start > 100) {
        return { valid: false, error: "Regex pattern is too complex.", normalized: "" };
      }
    } catch (e) {
      return { valid: false, error: `Invalid regex pattern: ${(e as Error).message}`, normalized: "" };
    }
    
    return { valid: true, normalized: trimmed };
  }

  return { valid: true, normalized: trimmed.toLowerCase() };
}

export function sanitizeFallbackKeyword(kw: string): string {
  if (!kw) return "";
  let clean = kw;
  // Break mass mentions
  clean = clean.replace(/@(everyone|here)/gi, "@\u200b$1");
  // Remove markdown injection characters
  clean = clean.replace(/[`*~_>|#]/g, "");
  // Truncate to 80 chars max
  clean = clean.substring(0, 80);
  return clean;
}

export function formatKeywordFallbackReason(matchedWord: string): string {
  const cleanMatch = sanitizeFallbackKeyword(matchedWord);
  return `Keyword match fallback triggered: ${cleanMatch}`;
}

export function keywordMatchesMessage(messageContent: string, keyword: string): string | null {
  if (!keyword || !messageContent) return null;
  
  if (isExplicitRegex(keyword)) {
    if (keyword.length > 100) {
      logger.warn(`[Regex Error] Skipped oversized regex pattern.`);
      return null;
    }

    const pattern = keyword.slice(1, -1);
    
    if (!isSafeRegex(pattern)) {
      logger.warn(`[Regex Error] Skipped catastrophic regex pattern.`);
      return null;
    }

    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(messageContent)) {
        return keyword;
      }
    } catch (e) {
      logger.warn(`[Regex Error] Skipped invalid regex: ${(e as Error).message}`);
    }
    return null;
  }

  if (messageContent.toLowerCase().includes(keyword.toLowerCase())) {
    return keyword;
  }
  return null;
}
