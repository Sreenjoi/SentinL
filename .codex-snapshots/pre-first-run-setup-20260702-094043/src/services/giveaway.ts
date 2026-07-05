import * as crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";

function secureRandomInt(max: number): number {
  return crypto.randomInt(0, max);
}

export async function processGiveaway(db: any, giveawayRef: any, BOT_TOKEN: string): Promise<string[]> {
  let channelId = "";
  let giveawayId = giveawayRef.id;
  let prize = "";
  let winnersCount = 1;

  // 1. Transition `active` -> `ending` idempotently
  let shouldProcess = false;
  let initialWinners: string[] | undefined = undefined;
  let messageDisabledAt: any = null;
  let announcementSentAt: any = null;

  await db.runTransaction(async (t: any) => {
    const docSnap = await t.get(giveawayRef);
    if (!docSnap.exists) throw new Error("Giveaway not found");
    const data = docSnap.data();
    
    if (data.status === "ended" || data.status === "cancelled") {
      throw new Error(`Giveaway already ${data.status}`);
    }

    if (data.status === "active") {
        t.update(giveawayRef, { status: "ending", endedAt: new Date().toISOString() });
    }

    channelId = data.channelId;
    prize = data.prize || "Giveaway";
    winnersCount = data.winnersCount || 1;
    initialWinners = data.winners;
    messageDisabledAt = data.messageDisabledAt;
    announcementSentAt = data.announcementSentAt;
    shouldProcess = true;
  });

  if (!shouldProcess) {
    throw new Error("Giveaway is not active or already ended");
  }

  // 2. Winner selection
  let winners: string[] = [];
  
  if (initialWinners && Array.isArray(initialWinners)) {
      winners = initialWinners;
  } else {
      // Read participants
      const participantsSnap = await giveawayRef.collection("participants").get();
      const participants = participantsSnap.docs.map((d: any) => d.id);

      if (participants.length > 0) {
        const shuffled = [...participants];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = secureRandomInt(i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        winners = shuffled.slice(0, winnersCount);
      }
      
      // Save winners early before Discord so we don't pick different winners if Discord flakes
      await giveawayRef.update({ winners });
  }

  // 3. Discord Updates
  if (BOT_TOKEN && channelId) {
    const desc = winners.length > 0
      ? `Giveaway ended!\n\n**Winners:** ${winners.map(w => `<@${w}>`).join(", ")}`
      : `Giveaway ended with no valid entries.`;

    if (!messageDisabledAt) {
      const embedReq = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${giveawayId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: "🎉 **GIVEAWAY ENDED** 🎉",
          components: [],
          embeds: [{
            title: prize,
            description: desc,
            color: 0xED4245,
            timestamp: new Date().toISOString()
          }]
        })
      });

      if (!embedReq.ok && embedReq.status !== 404) {
        // Try again next time, keep in "ending" (Treats 403 as standard failure)
        await giveawayRef.update({ deliveryStatus: "failed", lastDeliveryError: `embed update failed ${embedReq.status}` });
        throw new Error(`Discord embed update failed with status ${embedReq.status}`);
      }

      if (embedReq.status === 404) {
        // Original message deleted, post a new one
        const postReq = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bot ${BOT_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            content: `🎉 **GIVEAWAY ENDED** 🎉\n*(Original message was deleted)*\n\n**Prize:** ${prize}\n${desc}`
          })
        });
        if (!postReq.ok) {
            await giveawayRef.update({ deliveryStatus: "failed", lastDeliveryError: `fallback post failed ${postReq.status}` });
            throw new Error(`Discord fallback post failed with status ${postReq.status}`);
        }
      }
      await giveawayRef.update({ messageDisabledAt: FieldValue.serverTimestamp() });
    }

    if (!announcementSentAt && winners.length > 0) {
      const announceReq = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: `Congratulations ${winners.map(w => `<@${w}>`).join(", ")}! You won **${prize}**!`,
          message_reference: { message_id: giveawayId }
        })
      });
      if (!announceReq.ok) {
          await giveawayRef.update({ deliveryStatus: "failed", lastDeliveryError: `announcement failed ${announceReq.status}` });
          throw new Error(`Discord announcement failed with status ${announceReq.status}`);
      }
      await giveawayRef.update({ announcementSentAt: FieldValue.serverTimestamp() });
    }
  }

  // 4. Finalize Firestore state
  await giveawayRef.update({ status: "ended", deliveryStatus: "delivered", completedAt: FieldValue.serverTimestamp(), lastDeliveryError: null });

  return winners;
}
