import admin from "firebase-admin";
import { getBotClient, db } from "../discordBot.js";
import { TierStatus, getServerTierStatus } from "../utils/entitlements.js";
import { EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger.js";
import { callAIChatCompletion, getPrimaryFastProvider } from "../utils/aiProvider.js";

const MAX_SUMMARY_CHARS = 20000;
const MAX_MESSAGES_TO_FETCH = 1000;

export async function generateServerSummary(serverId: string, channelId: string, dateStr: string, requestedBy: string) {
    if (!Date.parse(`${dateStr}T00:00:00Z`)) {
        throw new Error("Invalid date specified. Please use YYYY-MM-DD.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error("Invalid date format. Please use YYYY-MM-DD.");
    }

    const startOfDay = new Date(dateStr + "T00:00:00Z");
    const endOfDay = new Date(dateStr + "T23:59:59Z");
    if (startOfDay.getTime() > Date.now()) {
        throw new Error("Cannot summarize future dates.");
    }

    const client = getBotClient();
    if (!client || !client.isReady()) {
        throw new Error("Bot is offline or restarting.");
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== 0) {
        throw new Error("Invalid or inaccessible text channel.");
    }

    // Harden channel validation
    if ((channel as any).guildId !== serverId) {
        throw new Error("Channel does not belong to this server.");
    }

    // AI token reservation state. The budget helper name is historical; keep it as
    // a conservative local throttle for expensive summary calls regardless of provider.
    let groqReservationCreated = false;
    let groqReservationReconciled = false;
    let groqReservationReleased = false;
    let groqTokensConsumed = false;
    let summaryQuotaReserved = false;
    let estimatedTokensScope = 0;
    
    // Check Limits
    const tierStatus = await getServerTierStatus(serverId, db);
    const now = new Date();
    
    // Limits definition
    let limitType = "daily";
    let limitAmount = 0;
    
    if (!tierStatus.isPremium) {
        limitType = "weekly";
        limitAmount = 5;
    } else {
        if (tierStatus.tier === "pro_1") limitAmount = 50;
        else if (tierStatus.tier === "pro_3") limitAmount = 300;
        else limitAmount = 1000; 
    }

    let storageKey = `summary_daily_${now.toISOString().split("T")[0]}`;
    if (limitType === "weekly") {
        const day = now.getUTCDay() || 7; 
        const weekStart = new Date(now);
        weekStart.setUTCDate(now.getUTCDate() - day + 1);
        weekStart.setUTCHours(0,0,0,0);
        storageKey = `summary_weekly_${weekStart.toISOString().slice(0, 10)}`;
    }

    const usageRef = db.collection('servers').doc(serverId).collection('usage').doc(storageKey);
    
    // Reserve allowance
    await db.runTransaction(async (t: any) => {
        const doc = await t.get(usageRef);
        let count = 0;
        let pending = 0;
        if (doc.exists) {
            count = doc.data()?.count || 0;
            pending = doc.data()?.pending || 0;
        }
        if (count + pending >= limitAmount) {
            if (limitType === "weekly") {
                throw new Error(`Free tier summary limit reached (${limitAmount}/week). Please upgrade to Pro for higher limits.`);
            } else {
                throw new Error(`Daily summary limit reached (${limitAmount}/day) for your plan.`);
            }
        }
        t.set(usageRef, { pending: pending + 1 }, { merge: true });
    });
    summaryQuotaReserved = true;

    try {
      // Fetch messages with pagination safely
      const discordEpoch = 1420070400000n;
      const startSnowflake = ((BigInt(startOfDay.getTime()) - discordEpoch) << 22n).toString();
      const endSnowflake = ((BigInt(endOfDay.getTime()) - discordEpoch) << 22n).toString();

      let validMessages: any[] = [];
      let lastId = startSnowflake;
      let fetchedTotal = 0;
      let charCount = 0;
      let isPartial = false;

      while (fetchedTotal < MAX_MESSAGES_TO_FETCH) {
          // Fetch forwards
          const messages: any = await (channel as any).messages.fetch({ limit: 100, after: lastId }).catch(() => null);
          if (!messages || messages.size === 0) break;
          
          // Convert to array and sort chronologically
          const batch = Array.from(messages.values()).sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp);
          let batchHasFutureMessages = false;

          for (const msg of batch as any[]) {
              if (BigInt(msg.id) > BigInt(endSnowflake)) {
                  batchHasFutureMessages = true;
                  break;
              }
              if (!msg.author.bot) {
                  const line = `[${msg.author.username}]: ${msg.content}\n`;
                  if (charCount + line.length > MAX_SUMMARY_CHARS) {
                      isPartial = true;
                      batchHasFutureMessages = true;
                      break;
                  }
                  validMessages.push(msg);
                  charCount += line.length;
              }
              lastId = msg.id;
              fetchedTotal++;
          }

          if (batchHasFutureMessages || messages.size < 100) break;
      }

      if (validMessages.length === 0) {
          throw new Error("No user messages found in that channel for the given date.");
      }

      const textLog = validMessages.map((m: any) => `[${m.author.username}]: ${m.content.replace(/</g, '\\<')}`).join("\n");

      const systemPrompt = "You are an AI assistant in a Discord server. Summarize the following chat log to catch up the moderators. Briefly highlight the main topics discussed, general sentiment, and any important decisions or links shared. Keep it concise, engaging, and professional.";
      const { escapeForPromptBlock } = await import("../utils/moderationHelpers.js");
      const userPrompt = `Chat Log:\n${escapeForPromptBlock(textLog)}`;

      const { reserveGroqBudget, estimateGroqCallTokens, reconcileGroqTokens } = await import("../utils/groqBudget.js");
      estimatedTokensScope = estimateGroqCallTokens(systemPrompt, userPrompt, 1000);
      const budget = await reserveGroqBudget(db, estimatedTokensScope);
      
      if (!budget.allowed) {
          throw Object.assign(new Error("AI provider is currently under heavy load. Please try generating the summary again later."), { status: 503 });
      }
      
      groqReservationCreated = true;

      const provider = getPrimaryFastProvider();
      if (provider === "cloudflare" && (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN)) {
          throw Object.assign(new Error("AI service is not configured (missing Cloudflare Workers AI credentials)."), { status: 503 });
      }
      if (provider === "groq" && !process.env.GROQ_API_KEY) {
          throw Object.assign(new Error("AI service is not configured (missing GROQ_API_KEY)."), { status: 503 });
      }

      let data: any;
      try {
        data = await callAIChatCompletion({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.5,
            max_tokens: 1000
        }, provider);
      } catch (err: any) {
        if (err?.status === 429) {
          throw Object.assign(new Error("AI provider rate limit reached. Please try again later."), { status: 429 });
        }
        throw Object.assign(new Error("AI provider encountered an error while generating the summary."), { status: 502 });
      }
      let summaryText = data?.choices?.[0]?.message?.content;
      
      if (!summaryText) {
          throw Object.assign(new Error("AI returned empty summary."), { status: 500 });
      }

      // Reconcile tokens based on actual usage returned by the AI provider when available
      if (data.usage?.total_tokens) {
        try {
          await reconcileGroqTokens(db, estimatedTokensScope, data.usage.total_tokens);
        } catch (e: any) {
          logger.error({ code: e?.code || "unknown_error" }, "Failed to reconcile groq tokens");
        }
        groqReservationReconciled = true;
      } else {
        groqReservationReconciled = true; // Act as if reconciled since we consumed tokens and won't release them
      }
      groqTokensConsumed = true; // successfully got a valid response that counts against quota

      if (isPartial) {
          summaryText += "\n\n*(Note: This summary is partial because the message volume exceeded the daily fetching limits.)*";
      }

      // Save summary and finalize allowance atomically
      const summaryDocRef = db.collection("servers").doc(serverId).collection("summaries").doc();
      const summaryPayload = {
          id: summaryDocRef.id,
          channelId,
          channelName: (channel as any).name,
          date: dateStr,
          summaryText,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          requestedBy,
      };

      await db.runTransaction(async (t: any) => {
        const doc = await t.get(usageRef);
        let count = doc.data()?.count || 0;
        let pending = doc.data()?.pending || 0;
        t.set(usageRef, { count: count + 1, pending: Math.max(0, pending - 1) }, { merge: true });
        t.set(summaryDocRef, summaryPayload);
      });
      summaryQuotaReserved = false; // Successfully finalized summary quota

      const embed = new EmbedBuilder()
          .setTitle(`Channel Summary: #${(channel as any).name}`)
          .setDescription(summaryText.substring(0, 4000))
          .setFooter({ text: `Date: ${dateStr} - AI generated${isPartial ? ' - Partial' : ''}` })
          .setColor(0x00FF00);

      return { summaryText, embed, summaryPayload };
    } catch (e: any) {
      if (groqReservationCreated && !groqTokensConsumed && !groqReservationReleased && !groqReservationReconciled) {
        try {
          const { releaseGroqBudget } = await import("../utils/groqBudget.js");
          await releaseGroqBudget(db, estimatedTokensScope);
          groqReservationReleased = true;
        } catch (releaseErr: any) {
          logger.error({ code: releaseErr?.code || "unknown_error" }, "Failed to release groq budget on summary fail");
        }
      }
      
      // Refund allowance on failure
      if (summaryQuotaReserved) {
        try {
          await db.runTransaction(async (t: any) => {
            const doc = await t.get(usageRef);
            let pending = doc.data()?.pending || 0;
            t.set(usageRef, { pending: Math.max(0, pending - 1) }, { merge: true });
          });
          summaryQuotaReserved = false;
        } catch (refundErr: any) {
          logger.error({ code: refundErr?.code || "unknown_error" }, "Failed to refund summary usage");
        }
      }
      throw e;
    }
}

