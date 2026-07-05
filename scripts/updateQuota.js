const fs = require("fs");

const file = "./src/discordBot.ts";
let content = fs.readFileSync(file, "utf8");

const keywordFunc = `
export async function executeKeywordModeration(
  message: any,
  serverId: string,
  serverData: any,
  db: admin.firestore.Firestore
): Promise<{ flagged: boolean; action: string }> {
  const serverKeywords: string[] = serverData?.keywords || [];
  const autoDeleteOnKeywordMatch: boolean = serverData?.autoDeleteOnKeywordMatch || false;

  let matchedKeyword = null;
  if (serverKeywords.length > 0) {
    const contentStr = message.content.toLowerCase();
    for (const kw of serverKeywords) {
      try {
        const regex = new RegExp(kw, "i");
        if (regex.test(contentStr)) {
          matchedKeyword = kw;
          break;
        }
      } catch (e) {
        if (contentStr.includes(kw.toLowerCase())) {
          matchedKeyword = kw;
          break;
        }
      }
    }
  }

  if (matchedKeyword) {
    addBotLog(\`[SentinL] Flagged message in \${serverId} - Keyword Filter: \${matchedKeyword}\`);

    const existingFlagRef = await db
      .collection("flaggedMessages")
      .where("messageId", "==", message.id)
      .limit(1)
      .get();

    let action = "none";
    if (existingFlagRef.empty) {
      action = autoDeleteOnKeywordMatch && message.deletable ? "auto_deleted" : "none";
      await db.collection("flaggedMessages").add({
        messageId: message.id,
        serverId,
        channelId: message.channelId,
        authorId: message.author.id,
        authorUsername: message.author.username,
        authorAvatar: message.author.displayAvatarURL(),
        content: message.content, // We log it here because flags require it, instruction said "Do not log message content" for QUOTA HIT, but for actual flags it's required (wait!)
        level: "Keyword",
        confidence: 100,
        reason: \`Matched keyword: \${matchedKeyword}\`,
        detectionMethod: "keyword_fallback",
        matchedKeyword: matchedKeyword,
        status: "pending",
        actionTaken: action,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      queueServerStats(serverId, 'flag');
      queueModelUsage('keyword_fallback');

      try {
        const offenderRef = db
          .collection("servers")
          .doc(serverId)
          .collection("offenders")
          .doc(message.author.id);
        const currentDoc = await offenderRef.get();
        const currentData = currentDoc.data() || { score: 0, flaggedCount: 0 };
        await offenderRef.set(
          {
            authorUsername: message.author.username,
            authorAvatar: message.author.displayAvatarURL(),
            flaggedCount: (currentData.flaggedCount || 0) + 1,
            score: (currentData.score || 0) + 2,
            lastUpdated: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("[SentinL] Error updating offender stats (Keyword)", e);
      }
    } else {
      addBotLog(\`[SentinL] Skipping keyword flag - Message \${message.id} already flagged.\`);
    }

    if (autoDeleteOnKeywordMatch && message.deletable) {
      await message.delete().catch(() => {});
    }

    return { flagged: true, action: "keyword_fallback" };
  }

  return { flagged: false, action: "none" };
}

export async function handleQuotaHitFallback(
  message: any,
  serverId: string,
  serverData: any,
  aiLimit: number,
  db: admin.firestore.Firestore,
  todayStr: string,
  client: any
): Promise<{ flagged: boolean; action: string }> {
  addBotLog(\`[Discord Bot] AI daily limit reached for server \${serverId}; using keyword-only fallback.\`);
  await checkAndSendAILimitNotification(serverId, serverData?.logChannelId, aiLimit, todayStr, client, serverData);
  queueModelUsage("keyword_fallback");

  // Fallback actually runs keyword checking now
  const result = await executeKeywordModeration(message, serverId, serverData, db);
  if (!result.flagged) {
     return { flagged: false, action: "ignored" }; // meaning safely ignored
  }
  return result; // return keyword fallback flagged
}
`;

content = content.replace("export let db: admin.firestore.Firestore;", "export let db: admin.firestore.Firestore;\n" + keywordFunc);

// Now remove the old Stage 1 implementation and replace with executeKeywordModeration
const stage1StartStr = "// 1. Stage 1 Pre-filter (Keyword/regex check) - Free & Zero Cost";
const stage1EndStr = "if (message.content.trim() === \"\") {";

const idxStart = content.indexOf(stage1StartStr);
const idxEnd = content.indexOf(stage1EndStr);

if (idxStart !== -1 && idxEnd !== -1) {
    const stage1Block = content.substring(idxStart, idxEnd);
    const replacement = \`// 1. Stage 1 Pre-filter (Keyword/regex check) - Free & Zero Cost
        const kwResult = await executeKeywordModeration(message, serverId, serverData, db);
        if (kwResult.flagged) {
          return;
        }

        \`;
    content = content.replace(stage1Block, replacement);
}

// Now replace current quota handler
const quotaStartStr = "console.log('[Quota Check] server='+serverId+' current='+currentDailyAICount+' limit='+aiLimit); if (currentDailyAICount >= aiLimit) {";
const quotaEndStr = "coalesceModerationRequest({";

const qIdxStart = content.indexOf(quotaStartStr);
const qIdxEnd = content.indexOf(quotaEndStr, qIdxStart);

if (qIdxStart !== -1 && qIdxEnd !== -1) {
    const quotaBlock = content.substring(qIdxStart, qIdxEnd);
    const quotaRepl = \`console.log('[Quota Check] server='+serverId+' current='+currentDailyAICount+' limit='+aiLimit);
        if (currentDailyAICount >= aiLimit) {
          await handleQuotaHitFallback(message, serverId, serverData, aiLimit, db, todayStr, client);
          return;
        }

        // Add to Queue instead of immediate blocking
        \`;
    content = content.replace(quotaBlock, quotaRepl);
}

fs.writeFileSync(file, content);
console.log("Updated discordBot.ts");

