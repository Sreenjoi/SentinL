import "dotenv/config";
import { startDiscordBot, setDbForTest, __resetDiscordBotForTest } from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

const paragraphs = [
  `I checked the settings and everything looks fine on my end.
The channel permissions are working now, so we can move ahead with the rest of the setup.`,
  `Thanks for helping earlier.
I will update the document tonight and send it here once I finish the notes.`,
  `The match was close today.
We lost the second round, but the final push was actually pretty coordinated.`,
  `I am going to be offline for a bit.
If anyone needs me, leave the details here and I will check when I get back.`,
  `The new layout feels cleaner.
Maybe we can keep the sidebar as it is and just adjust the spacing on the main page.`,
  `Can someone confirm the event time?
I saw two different times mentioned, so I want to make sure I don't miss it.`,
  `I uploaded the file again.
Please check whether it opens correctly before I share it with everyone else.`,
  `Good morning everyone.
Hope the server is quiet today and the update goes smoothly.`,
];

const savedFlags: any[] = [];
const httpCalls: Array<{ provider: string; status?: number }> = [];

const serverDoc = {
  isPremium: false,
  tier: "pro",
  plan: "pro",
  subscriptionStatus: "active",
  status: "active",
  dailyAICount: 0,
  aiLimit: 2000,
  lastResetDate: new Date().toISOString().slice(0, 10),
  language: "en",
  features: { ai_moderation: true, auto_delete: false, useContext: false, enableDualModel: false },
};

function makeDocRef(collectionName: string, id = "doc") {
  return {
    id,
    ref: null as any,
    get: async () => ({
      exists: collectionName === "servers",
      data: () => (collectionName === "servers" ? serverDoc : {}),
      ref: makeDocRef(collectionName, id),
    }),
    set: async () => {},
    update: async () => {},
    create: async (data: any) => {
      if (collectionName === "flaggedMessages") savedFlags.push(data);
    },
    collection: (subName: string) => makeCollection(subName),
  };
}

function makeCollection(name: string): any {
  const coll: any = {
    doc: (id?: string) => makeDocRef(name, id || "doc"),
    add: async (data: any) => {
      if (name === "flaggedMessages") savedFlags.push(data);
      return makeDocRef(name, "added");
    },
    where: () => coll,
    orderBy: () => coll,
    limit: () => coll,
    get: async () => ({ empty: true, docs: [], forEach: () => {} }),
  };
  return coll;
}

const fakeDb = {
  collection: (name: string) => makeCollection(name),
  batch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async (cb: any) => cb({ get: async (ref: any) => ref.get(), set: () => {}, update: () => {} }),
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  const provider = url.includes("api.cloudflare.com") ? "cloudflare" : url.includes("api.groq.com") ? "groq" : "other";
  const response = await originalFetch(input, init);
  httpCalls.push({ provider, status: response.status });
  return response;
};

function makeMessage(content: string, n: number) {
  return {
    id: `paragraph-probe-${Date.now()}-${n}`,
    content,
    channelId: "probe-channel",
    createdAt: new Date(),
    deletable: false,
    author: { id: "probe-user", username: "ProbeUser", displayAvatarURL: () => "" },
    reference: null,
    mentions: { users: { size: 0 } },
    client: {
      channels: { cache: { get: () => null }, fetch: async () => null },
      guilds: { cache: { get: () => null } },
    },
    delete: async () => {},
  };
}

async function main() {
  __resetDiscordBotForTest();
  setDbForTest(fakeDb as any);
  await startDiscordBot();
  setDbForTest(fakeDb as any);

  const executeAIModeration = (globalThis as any).__executeAIModeration;
  if (typeof executeAIModeration !== "function") throw new Error("Moderation function was not exposed in test mode.");

  const rows = [];
  for (const [index, text] of paragraphs.entries()) {
    savedFlags.length = 0;
    httpCalls.length = 0;
    const msg = makeMessage(text, index + 1);
    await executeAIModeration({
      serverId: "probe-server",
      serverData: {
        ...serverDoc,
        confidenceThreshold: 80,
        primaryConfidenceThreshold: 75,
        autoDelete: false,
        useContext: false,
        enableDualModel: false,
        logChannelId: null,
        keywords: [],
      },
      isPremium: false,
      useContext: false,
      enableDualModel: false,
      historyText: "No context provided.",
      rulesText: "No harassment, insults, sexual content, threats, slurs, spam, sarcasm, or targeted disrespect.",
      trainingContextText: "",
      message: msg,
      coalescedMessages: [msg],
    });

    rows.push({
      "#": index + 1,
      aiCalls: httpCalls.length,
      providers: httpCalls.map((c) => `${c.provider}:${c.status}`).join(" -> "),
      flagged: savedFlags.length > 0,
      method: savedFlags[0]?.detectionMethod || "",
      level: savedFlags[0]?.level || "",
      preview: text.replace(/\s+/g, " ").slice(0, 85),
    });
  }

  console.table(rows);
  console.log(JSON.stringify({
    totalParagraphs: rows.length,
    totalAiCalls: rows.reduce((sum, row) => sum + row.aiCalls, 0),
    paragraphsThatMadeAiCalls: rows.filter((row) => row.aiCalls > 0).length,
    flaggedParagraphs: rows.filter((row) => row.flagged).length,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
