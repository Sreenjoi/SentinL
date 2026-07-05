const fs = require('fs');
let code = fs.readFileSync('src/discordBot.ts', 'utf8');

const regex = /async function checkAndSendAILimitNotification(.*?) {[\s\S]*?(?=
async function|Z)/m;

const replacement = `async function checkAndSendAILimitNotification(
  serverId: string,
  logChannelId: string | undefined,
  aiLimit: number,
  todayStr: string,
  client: any,
  freshData: any
) {
  let shouldSendNotice = false;
  
  try {
    if (!db) throw new Error("No db connection");
    await db.runTransaction(async (t) => {
      const serverRef = db!.collection("servers").doc(serverId);
      const doc = await t.get(serverRef);
      const noticeState = doc.data()?.limitNotice || {};
      
      if (noticeState.date === todayStr && (noticeState.state === 'sent' || noticeState.state === 'pending')) {
        return;
      }
      if (noticeState.date === todayStr && noticeState.state === 'failed') {
         if (Date.now() - (noticeState.lastTry || 0) < 15 * 60 * 1000) {
             return; // Retry after 15 mins
         }
      }
      
      t.set(serverRef, { limitNotice: { date: todayStr, state: 'pending', lastTry: Date.now() } }, { merge: true });
      shouldSendNotice = true;
    });
  } catch (err) {
     console.error("[Discord Bot] Error in limit notice transaction:", err);
  }

  if (shouldSendNotice) {
     let sendSuccess = false;
     if (logChannelId) {
       try {
         const channel = client.channels.cache.get(logChannelId) || await client.channels.fetch(logChannelId).catch(() => null);
         if (channel && channel.isTextBased()) {
           const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
           if (guild) {
             const me = guild.members.me;
             if (me && channel.type !== 1 && channel.type !== 3) {
               const perms = (channel as any).permissionsFor(me);
               if (perms && perms.has(PermissionFlagsBits.SendMessages)) {
                 const nextMidnight = new Date();
                 nextMidnight.setUTCHours(24, 0, 0, 0);
                 const ts = Math.floor(nextMidnight.getTime() / 1000);
                 
                 if (perms.has(PermissionFlagsBits.EmbedLinks)) {
                   const embed = new EmbedBuilder()
                     .setTitle("Daily AI Moderation Limit Reached")
                     .setDescription("SentinL has used today's AI moderation checks for this server. Until the daily reset, SentinL will continue protecting the server with keyword-based moderation.")
                     .addFields(
                       { name: "Daily limit", value: aiLimit + " / " + aiLimit + " AI checks" },
                       { name: "Fallback mode", value: "Keyword matching active" },
                       { name: "Resets", value: "<t:" + ts + ":F> (<t:" + ts + ":R>)" }
                     )
                     .setFooter({ text: "AI moderation will resume automatically after reset." })
                     .setColor(0xFFA500);
                   await channel.send({ embeds: [embed] });
                   sendSuccess = true;
                 } else {
                   await channel.send("**Daily AI Moderation Limit Reached**\nSentinL has used today's AI moderation checks for this server. Until the daily reset, SentinL will continue protecting the server with keyword-based moderation.\n- Daily limit: " + aiLimit + " / " + aiLimit + " AI checks\n- Fallback mode: Keyword matching active\n- Resets: <t:" + ts + ":F> (<t:" + ts + ":R>)\nAI moderation will resume automatically after reset.");
                   sendSuccess = true;
                 }
               } else {
                 addBotLog("AI limit reached for server " + serverId + ", but missing SendMessages perms for log channel.");
               }
             }
           }
         } else {
           addBotLog("AI limit reached for server " + serverId + ", but log channel is inaccessible or invalid.");
         }
       } catch (e) {
         addBotLog("AI limit reached for server " + serverId + ", error sending to log channel.");
       }
     } else {
       addBotLog("AI limit reached for server " + serverId + ", but no log channel is configured.");
     }
     
     if (db) {
         await db.collection("servers").doc(serverId).set({ 
             limitNotice: { 
                 date: todayStr, 
                 state: sendSuccess ? 'sent' : 'failed', 
                 lastTry: Date.now() 
             } 
         }, { merge: true }).catch(()=>{});
     }
  }
}`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/discordBot.ts', code, 'utf8');
