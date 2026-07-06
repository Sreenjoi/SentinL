
import { logger } from "../utils/logger.js";
import crypto from "crypto";
import { getAdminDB } from "../server/firebaseAdmin.js";
import { parseGroqResetMs } from "../utils/groqRateLimit.js";
import { callAIChatCompletion, getPrimaryFastProvider } from "../utils/aiProvider.js";

let isRunning = false;

export async function generateServerRecommendations() {
  if (isRunning) {
    logger.info("[Recommendations] Already running, skipping this tick.");
    return;
  }
  
  if (process.env.ENABLE_RECOMMENDATIONS_JOB === "false") {
    logger.info("[Recommendations] Job disabled via ENABLE_RECOMMENDATIONS_JOB, skipping.");
    return;
  }
  
  isRunning = true;

  try {
    const db = getAdminDB();
    
    // Attempt to acquire distributed lock
    const lockRef = db.collection("system_health").doc("recommendations_lock");
    try {
      await db.runTransaction(async (t: any) => {
        const lockDoc = await t.get(lockRef);
        const lockData = lockDoc.data();
        const now = Date.now();
        
        // If locked and lock is less than 1 hour old, abort
        if (lockDoc.exists && lockData?.locked && (now - lockData.lockedAt) < 3600000) {
          throw new Error("ALREADY_LOCKED");
        }
        
        t.set(lockRef, {
          locked: true,
          lockedAt: now
        });
      });
    } catch (e: any) {
      if (e.message === "ALREADY_LOCKED") {
        logger.info("[Recommendations] Job is currently locked by another instance. Skipping.");
        return; // Finally block will reset isRunning
      }
      throw e;
    }

    const primaryProvider = getPrimaryFastProvider();
    if (primaryProvider === "cloudflare" && (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)) {
      logger.info("[Recommendations] Missing Cloudflare AI credentials, skipping generation.");
      return;
    }
    if (primaryProvider === "groq" && !process.env.GROQ_API_KEY) {
      logger.info("[Recommendations] Missing GROQ_API_KEY, skipping generation.");
      return;
    }

    const batchSize = parseInt(process.env.RECOMMENDATIONS_BATCH_SIZE || "5", 10);
    // Fetch a larger pool of active servers to find ones that actually need processing,
    // avoiding getting stuck on the same 5 servers forever.
    const serversSnap = await db.collection("servers").where("active", "==", true).limit(1000).get();
    const allActiveServers = serversSnap.docs;
    
    const eligibleServerIds = [];
    const now = Date.now();
    for (const doc of allActiveServers) {
      const data = doc.data();
      const nextDateStr = data.nextRecommendationDate;
      const nextDate = nextDateStr ? new Date(nextDateStr).getTime() : 0;
      if (nextDate <= now) {
        eligibleServerIds.push(doc.id);
      }
    }
    
    // Only process up to batchSize
    const serverIds = eligibleServerIds.slice(0, batchSize);

    for (const serverId of serverIds) {
      try {
        const serverDoc = await db.collection("servers").doc(serverId).get();
        const serverData = serverDoc.data();
        if (!serverData) continue;

        const { isServerPremium } = await import("../utils/entitlements.js");
        const isPremium = await isServerPremium(serverId, db);
        if (!isPremium) continue;


        // 2. 7-Day Checking logic
        const now = Date.now();
        const nextDateStr = serverData.nextRecommendationDate;
        const nextDate = nextDateStr ? new Date(nextDateStr).getTime() : 0;

        if (nextDate > now) {
           continue; // Not time yet
        }

        // If it doesn't exist, we run it and set it to 7 days from now. 
        // This matches "7 days from the sign up date and every 7 days henceforth", assuming sign up date logic means starting 7 days from now.
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const feedbacksSnap = await db
          .collection("trainingFeedback")
          .where("serverId", "==", serverId)
          .where("timestamp", ">=", oneWeekAgo)
          .get();

        const flaggedSnap = await db
          .collection("flaggedMessages")
          .where("serverId", "==", serverId)
          .where("timestamp", ">=", oneWeekAgo)
          .orderBy("timestamp", "desc")
          .limit(50)
          .get();

        if (feedbacksSnap.empty && flaggedSnap.empty) {
          const sevenDaysLater = new Date();
          sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
          await db.collection("servers").doc(serverId).set({
             nextRecommendationDate: sevenDaysLater.toISOString()
          }, { merge: true });
          continue;
        }

        const feedbacks = feedbacksSnap.docs.map((d: any) => ({
          id: d.id,
          ...d.data(),
        })).filter((f: any) => f.recommendationProcessed !== true);

        const flagged = flaggedSnap.docs.map((d: any) => d.data());

        const feedbackExamples = feedbacks
          .map((f: any) => {
            return `AI Training Feedback -> Original Verdict: ${f.originalVerdict} | Corrected to: ${f.correctedSeverity} | Admin Reasoning: ${f.moderatorReason}`;
          })
          .slice(0, 20)
          .join("\n---\n");

        const flaggedExamples = flagged
          .map((f: any) => {
            return `Flagged Message -> Message: "${f.content}" | Detected Level: ${f.level} | AI Reason: ${f.reason} | Keywords (if any): ${f.matchedKeyword || "N/A"}`;
          })
          .slice(0, 20)
          .join("\n---\n");

        const metaPrompt = `You are a moderation analyst for a Discord server. Based on the activity below, generate rule suggestions to add to this server's custom ruleset.

Generate exactly 4 rule suggestions:
- 2 rules derived from the AI Training Feedback (cases where a moderator corrected the AI verdict)
- 2 rules derived from the Flagged Messages (patterns the AI caught this week)

The suggestions should be comprehensive and detailed, similar to standard community guidelines. 
Each rule must be structured in the format "Rule Title: Detailed comprehensive description...". 
For example: "The Banter Exemption: Understand that close friends often insult each other using harsh slang or profanity as a form of affection. Look for contextual markers like 'lol', 'bro', emojis, or playful replies. If the tone suggests a mutual inside joke rather than genuine hostility, do NOT flag it as toxic."
Do not just provide a one-line rule. Give nuanced instructions on how the AI should interpret the context, just like the example.

Each rule must also have a brief reasoning that references the specific feedback or flagged message that inspired it.

AI Training Feedback (moderator corrections this week):
${feedbackExamples || "None this week."}

Flagged Messages (caught by AI or keywords this week):
${flaggedExamples || "None this week."}

Return ONLY valid JSON. No markdown, no extra text. Do not use unescaped double quotes inside string values.
{
  "ruleSuggestions": [
    {
      "rule": "string",
      "reasoning": "string"
    }
  ]
}`;

        let result = null;
        const providersToTry: Array<"cloudflare" | "groq"> = [primaryProvider];
        if (primaryProvider === "cloudflare" && process.env.GROQ_API_KEY) {
          providersToTry.push("groq");
        }

        for (const provider of providersToTry) {
          try {
            const aiData = await callAIChatCompletion({
              messages: [{ role: "user", content: metaPrompt }],
              response_format: { type: "json_object" },
              max_tokens: 1000,
              temperature: 0.1
            }, provider);

            await db.collection("system_health").doc("recommendations_ai").set({
               isRateLimited: false,
               cooldownUntil: 0,
               provider,
               updatedAt: new Date()
            }, { merge: true }).catch(() => {});

            const parsed = JSON.parse(aiData?.choices?.[0]?.message?.content || "{}");
            if (parsed && parsed.ruleSuggestions) {
              let suggestions = parsed.ruleSuggestions;
              if (typeof suggestions === "string") {
                suggestions = [{ rule: suggestions, reasoning: "" }];
              }
              if (Array.isArray(suggestions) && suggestions.length > 0) {
                result = { ruleSuggestions: suggestions };
                break; // Success, stop trying models
              }
            }
            logger.warn(`[Recommendations] ${provider} returned empty or invalid ruleSuggestions array. Retrying if fallback is available...`);
          } catch (e: any) {
            logger.error({ err: e?.message || e }, `[Recommendations] AI provider ${provider} failed:`);
            if (e?.status === 429) {
              const resetMs = e.retryAfter ? parseGroqResetMs(e.retryAfter) : parseGroqResetMs(null);
              await db.collection("system_health").doc("recommendations_ai").set({
                 isRateLimited: true,
                 cooldownUntil: Date.now() + resetMs,
                 provider,
                 reason: "recommendations_rate_limit",
                 updatedAt: new Date()
              }, { merge: true }).catch(logger.error);
              if (provider === primaryProvider) continue;
              return;
            }
          }
        }

        if (result && result.ruleSuggestions && result.ruleSuggestions.length > 0) {
          const feedbackIds = feedbacks.map((f: any) => f.id);
          const batch = db.batch();

          for (const ruleObj of result.ruleSuggestions) {
            const ruleText = typeof ruleObj === "string" ? ruleObj : ruleObj.rule;
            const reasoning =
              typeof ruleObj === "string" ? "" : ruleObj.reasoning;
            const ruleId = crypto.randomUUID();
            const recRef = db.collection("recommendations").doc(ruleId);
            
            batch.set(recRef, {
              ruleText: ruleText,
              reasoning: reasoning || "",
              source: "weekly_consolidation",
              createdAt: new Date(),
              status: "pending",
              feedbackIds: feedbackIds,
              serverId: serverId,
            });
          }

          // mark as processed
          for (const fId of feedbackIds) {
            batch.update(db.collection("trainingFeedback").doc(fId), {
              recommendationProcessed: true,
            });
          }

          // update next date
          const sevenDaysLater = new Date();
          sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
          batch.update(db.collection("servers").doc(serverId), {
             nextRecommendationDate: sevenDaysLater.toISOString()
          });

          await batch.commit();
          logger.info(`[Recommendations] Generated new rules for server ${serverId}`);
        }
      } catch (err) {
        logger.error({ err: err }, `[Recommendations] Error processing server ${serverId}:`);
      }
      
      // Delay to avoid hammering Groq
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (err) {
    logger.error({ err: err }, "[Recommendations] Error generating recommendations:");
  } finally {
    try {
      const db = getAdminDB();
      await db.collection("system_health").doc("recommendations_lock").set({
        locked: false,
        lockedAt: 0
      });
    } catch (e) {
      logger.error({ err: e }, "[Recommendations] Failed to release lock");
    }
    isRunning = false;
  }
}
