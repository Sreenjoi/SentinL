import { Client, GatewayIntentBits } from 'discord.js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

// 1. Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Handles raw escaped newlines correctly
const privateKey = process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

let db;
try {
  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
  // Connecting specifically to your AI Studio dashboard's explicitly named database!
  db = getFirestore(app, "ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f");
  console.log("🔥 Firebase Admin connected successfully.");
} catch (e) {
  console.error("❌ Failed to initialize Firebase:", e.message);
  console.log("Note: Ensure your FIREBASE_CLIENT_EMAIL/PRIVATE_KEY are correct in AI Studio Secrets!");
}

// 2. Initialize Google Gemini 2.5 AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 3. Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // REQUIRED: Must be enabled in Discord Developer Portal!
  ]
});

client.once('clientReady', () => {
  console.log(`✅ SentinL Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bots to prevent infinite loops
  if (message.author.bot) return;

  const guildId = message.guild.id;

  try {
    // A. Fetch Custom Server Rules from your dashboard's Firebase database
    const serverSnap = await db.collection('servers').doc(guildId).get();
    const serverData = serverSnap.data();
    
    // Stop if the server is marked inactive in the Sentinel dashboard
    if (!serverSnap.exists || !serverData?.active) {
      console.log(`[SentinL] Ignored message in ${guildId} - Server is completely inactive in dashboard.`);
      return;
    }

    const rulesSnapshot = await db.collection(`servers/${guildId}/rules`).get();
    const rules = rulesSnapshot.docs.map(doc => doc.data().text).join('; ');

    const serverContext = rules 
      ? `Apply these specific server rules: ${rules}`
      : `No specific rules provided, apply general common-sense safety guidelines (no hate speech, spam, extreme toxicity).`;

    // B. Query Gemini
    const prompt = `
You are SentinL, a Discord moderation AI.
${serverContext}

User Message: "${message.content}"

Determine if the message violates the rules or is unsafe.
Respond strictly in JSON format matching this structure:
{
  "flagged": true or false,
  "level": "Extreme" | "Inappropriate" | "Moderate" | "Spam",
  "confidence": number between 0 and 100,
  "reason": "Short 1-sentence explanation of why"
}
`;
    // Call Gemini predicting pure JSON
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const result = JSON.parse(response.text);

    // C. If the AI flagged the message, push it to your Dashboard's Firebase
    if (result.flagged) {
      await db.collection('flaggedMessages').add({
        serverId: guildId,
        channelId: message.channel.id,
        authorId: message.author.id,
        authorUsername: message.author.username,
        content: message.content,
        level: result.level || 'Moderate',
        confidence: result.confidence || 90,
        reason: result.reason || 'Automatically flagged by AI',
        status: 'pending',
        actionTaken: '',
        timestamp: new Date().toISOString()
      });
      
      console.log(`🚨 Flagged message from ${message.author.username} sent to dashboard.`);
      
      // Optional: You could directly delete extreme messages right here without waiting for the dashboard
      // if (result.level === 'Extreme' && result.confidence > 90) {
      //    await message.delete();
      // }
    }

  } catch (err) {
    console.error('Error processing message:', err);
  }
});

// Wake up the bot
client.login(process.env.DISCORD_BOT_TOKEN);
