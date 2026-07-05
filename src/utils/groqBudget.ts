import { logger } from "./logger.js";
import * as admin from 'firebase-admin';

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  let tokens = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code <= 127) {
      tokens += 0.25;
    } else if (code >= 0x2000) {
      tokens += 1;
    } else {
      tokens += 0.5;
    }
  }
  return Math.ceil(tokens);
}

export function estimateGroqCallTokens(systemPrompt: string, userPrompt: string, maxOutputTokens: number): number {
  const inputEstimated = estimateTokensFromText(systemPrompt) + estimateTokensFromText(userPrompt);
  return inputEstimated + maxOutputTokens;
}

export function getStageMaxTokens(stage: string | undefined, itemCount = 1): number {
  switch (stage) {
    case "primary_fast":
      return 120 + itemCount * 40;
    case "compact_linguistic":
      return 120 + itemCount * 50;
    case "primary_full":
      return 220 + itemCount * 90;
    case "primary_full_safety_micro_context":
      return 250 + itemCount * 90;
    case "primary_full_context":
      return 280 + itemCount * 110;
    case "premium_70b":
      return 450 + itemCount * 100;
    case "recommendations":
      return 1000;
    case "summary":
      return 1000;
    default:
      return 500;
  }
}

export interface BudgetReservationResult {
  allowed: boolean;
  cooldownUntil?: number;
  reason?: string;
}

let localRequests = 0;
let localTokenCount = 0;
let localWindowStartMs = 0;

export function __resetGroqBudgetForTest() {
  localRequests = 0;
  localTokenCount = 0;
  localWindowStartMs = 0;
}

export async function reserveGroqBudget(
  db: admin.firestore.Firestore | null,
  estimatedTokens: number,
  isHighRisk: boolean = false
): Promise<BudgetReservationResult> {
  const isEnabled = process.env.GROQ_GLOBAL_LIMITER_ENABLED !== "false";
  if (!isEnabled) {
    return { allowed: true };
  }

  let rpmLimit = parseInt(process.env.GROQ_RPM_LIMIT || "25", 10);
  if (isNaN(rpmLimit) || rpmLimit <= 0) {
    if (process.env.GROQ_RPM_LIMIT) logger.warn("Invalid GROQ_RPM_LIMIT, defaulting to 25");
    rpmLimit = 25;
  }
  
  let tpmLimit = parseInt(process.env.GROQ_TPM_LIMIT || "4500", 10);
  if (isNaN(tpmLimit) || tpmLimit <= 0) {
    if (process.env.GROQ_TPM_LIMIT) logger.warn("Invalid GROQ_TPM_LIMIT, defaulting to 4500");
    tpmLimit = 4500;
  }
  
  let safetyRatio = parseFloat(process.env.GROQ_TOKEN_SAFETY_RATIO || "0.8");
  if (isNaN(safetyRatio) || safetyRatio <= 0 || safetyRatio > 1) {
    if (process.env.GROQ_TOKEN_SAFETY_RATIO) logger.warn("Invalid GROQ_TOKEN_SAFETY_RATIO, defaulting to 0.8");
    safetyRatio = 0.8;
  }
  
  const safeRpmLimit = Math.floor(rpmLimit * safetyRatio);
  const safeTpmLimit = Math.floor(tpmLimit * safetyRatio);

  const now = Date.now();
  if (now - localWindowStartMs > 60000) {
    localWindowStartMs = now;
    localRequests = 0;
    localTokenCount = 0;
  }

  if (!db || typeof db.runTransaction !== 'function') {
      const pseudoSafeRpmLimit = isHighRisk ? Math.floor(safeRpmLimit * 0.8) : Math.floor(safeRpmLimit / 2);
      const pseudoSafeTpmLimit = isHighRisk ? Math.floor(safeTpmLimit * 0.8) : Math.floor(safeTpmLimit / 2);
      
      if (localRequests + 1 > pseudoSafeRpmLimit || localTokenCount + estimatedTokens > pseudoSafeTpmLimit) {
          return { allowed: false, cooldownUntil: localWindowStartMs + 60000, reason: "local_limit_deferred" };
      }
      
      localRequests++;
      localTokenCount += estimatedTokens;
      return { allowed: true };
  }

  const docRef = db.collection("system_health").doc("groq_budget");

  try {
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const transactionNow = Date.now();
      
      let data = doc.exists ? doc.data() as any : null;

      // Initialize if doesn't exist or if window expired (> 60s)
      if (!data || !data.windowStartMs || transactionNow - data.windowStartMs > 60000) {
        data = {
          windowStartMs: transactionNow,
          requestCount: 0,
          estimatedTokenCount: 0,
          cooldownUntil: 0,
        };
      }

      if (data.cooldownUntil && transactionNow < data.cooldownUntil) {
        return { allowed: false, cooldownUntil: data.cooldownUntil, reason: "active_cooldown" };
      }

      const newRequestCount = (data.requestCount || 0) + 1;
      const newTokenCount = (data.estimatedTokenCount || 0) + estimatedTokens;

      if (newRequestCount > safeRpmLimit) {
        return { allowed: false, cooldownUntil: data.windowStartMs + 60000, reason: "rpm_safety_limit" };
      }

      if (newTokenCount > safeTpmLimit) {
        return { allowed: false, cooldownUntil: data.windowStartMs + 60000, reason: "tpm_safety_limit" };
      }

      // Allow the request
      transaction.set(docRef, {
        windowStartMs: data.windowStartMs,
        requestCount: newRequestCount,
        estimatedTokenCount: newTokenCount,
        cooldownUntil: data.cooldownUntil || 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return { allowed: true };
    });
  } catch (err: any) {
    logger.error({ err }, "Groq budget transaction failed");
    
    const pseudoSafeRpmLimit = isHighRisk ? Math.floor(safeRpmLimit * 0.8) : Math.floor(safeRpmLimit / 2);
    const pseudoSafeTpmLimit = isHighRisk ? Math.floor(safeTpmLimit * 0.8) : Math.floor(safeTpmLimit / 2);
    
    if (localRequests + 1 > pseudoSafeRpmLimit || localTokenCount + estimatedTokens > pseudoSafeTpmLimit) {
        return { allowed: false, cooldownUntil: localWindowStartMs + 60000, reason: "local_limit_deferred" };
    }
    
    localRequests++;
    localTokenCount += estimatedTokens;
    return { allowed: true };
  }
}

export async function releaseGroqBudget(
  db: admin.firestore.Firestore | null,
  estimatedTokens: number
) {
  const isEnabled = process.env.GROQ_GLOBAL_LIMITER_ENABLED !== "false";
  if (!isEnabled || !db || typeof db.runTransaction !== 'function') return;

  const docRef = db.collection("system_health").doc("groq_budget");
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      if (!doc.exists) return;
      const data = doc.data() as any;
      const now = Date.now();
      if (!data.windowStartMs || now - data.windowStartMs > 60000) return;

      const newRC = Math.max(0, (data.requestCount || 0) - 1);
      const newTC = Math.max(0, (data.estimatedTokenCount || 0) - estimatedTokens);
      t.set(docRef, { requestCount: newRC, estimatedTokenCount: newTC }, { merge: true });
    });
  } catch (e: any) {
    logger.error({ code: e?.code || "unknown_error" }, "Failed to release Groq budget");
  }
}

export async function reconcileGroqTokens(
  db: admin.firestore.Firestore | null,
  estimatedTokens: number,
  actualTokens: number
) {
  const isEnabled = process.env.GROQ_GLOBAL_LIMITER_ENABLED !== "false";
  if (!isEnabled || !db || typeof db.runTransaction !== 'function') return;
  
  if (actualTokens >= estimatedTokens) return; // Only refund the difference if actual < estimated
  
  const refundAmount = estimatedTokens - actualTokens;
  const docRef = db.collection("system_health").doc("groq_budget");
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      if (!doc.exists) return;
      const data = doc.data() as any;
      const now = Date.now();
      if (!data.windowStartMs || now - data.windowStartMs > 60000) return;

      const newTC = Math.max(0, (data.estimatedTokenCount || 0) - refundAmount);
      t.set(docRef, { estimatedTokenCount: newTC }, { merge: true });
    });
  } catch (e: any) {
    logger.error({ code: e?.code || "unknown_error" }, "Failed to reconcile Groq tokens");
  }
}
