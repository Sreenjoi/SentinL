import "dotenv/config";
import {
  startDiscordBot,
  setDbForTest,
  __resetDiscordBotForTest,
} from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

const cases = [
  {
    expected: "safe",
    text: `I checked the settings after the restart.
The channel permissions are working now, and the setup looks stable.`,
  },
  {
    expected: "unsafe",
    text: `The event schedule is still the same for tonight.
Some people keep finding ways to make simple planning harder than it needs to be.`,
  },
  {
    expected: "safe",
    text: `The match was close today.
We lost the second round, but the final push was coordinated and fun.`,
  },
  {
    expected: "unsafe",
    text: `I uploaded the file again and the link is not needed.
Certain people apparently need three attempts to understand one simple note.`,
  },
  {
    expected: "safe",
    text: `Can someone confirm the event time?
I saw two different times mentioned, so I want to make sure I don't miss it.`,
  },
  {
    expected: "unsafe",
    text: `The layout change is ready for review.
Really impressive how basic spacing can become a full server incident.`,
  },
  {
    expected: "safe",
    text: `I am going offline for a bit.
If anyone needs me, leave the details here and I will check later.`,
  },
  {
    expected: "unsafe",
    text: `The queue is empty and the dashboard opened normally.
No surprise that the obvious fix had to be explained more than once.`,
  },
  {
    expected: "safe",
    text: `Thanks for helping earlier.
I will update the document tonight and send the final notes here.`,
  },
  {
    expected: "unsafe",
    text: `The setup checklist is complete now.
Amazing how the easiest step became the biggest achievement of the day.`,
  },
  {
    expected: "unsafe",
    text: `The reminder will go out before the event starts.
This level of confusion is honestly a talent.`,
  },
  {
    expected: "safe",
    text: `Good morning everyone.
Hope the server is quiet today and the update goes smoothly.`,
  },
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
  features: {
    ai_moderation: true,
    auto_delete: false,
    useContext: false,
    enableDualModel: false,
  },
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
  batch: () => ({
    set: () => {},
    update: () => {},
    delete: () => {},
    commit: async () => {},
  }),
  runTransaction: async (cb: any) =>
    cb({
      get: async (ref: any) => ref.get(),
      set: () => {},
      update: () => {},
    }),
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  const provider = url.includes("api.cloudflare.com")
    ? "cloudflare"
    : url.includes("api.groq.com")
      ? "groq"
      : "other";
  const response = await originalFetch(input, init);
  httpCalls.push({ provider, status: response.status });
  return response;
};

function makeMessage(content: string, n: number) {
  return {
    id: `hidden-nuance-probe-${Date.now()}-${n}`,
    content,
    channelId: "probe-channel",
    createdAt: new Date(),
    createdTimestamp: Date.now(),
    deletable: false,
    author: {
      id: "probe-user",
      username: "ProbeUser",
      displayAvatarURL: () => "",
    },
    reference: null,
    mentions: { users: { size: 0 } },
    channel: { messages: { fetch: async () => new Map() } },
    client: {
      channels: { cache: { get: () => null }, fetch: async () => null },
      guilds: { cache: { get: () => null } },
    },
    delete: async () => {},
  };
}

async function runCase(text: string, index: number, expected: string) {
  savedFlags.length = 0;
  httpCalls.length = 0;
  const msg = makeMessage(text, index);
  await (globalThis as any).__executeAIModeration({
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
    rulesText:
      "No harassment, insults, sexual content, threats, slurs, spam, sarcasm, passive aggression, condescension, or targeted disrespect.",
    trainingContextText: "",
    message: msg,
    coalescedMessages: [msg],
  });

  return {
    "#": index,
    expected,
    aiCalls: httpCalls.length,
    flagged: savedFlags.length > 0,
    method: savedFlags[0]?.detectionMethod || "",
    level: savedFlags[0]?.level || "",
    model: savedFlags[0]?.modelUsed || savedFlags[0]?.model_used || "",
    correct:
      (expected === "unsafe" && savedFlags.length > 0) ||
      (expected === "safe" && savedFlags.length === 0),
    preview: text.replace(/\s+/g, " ").slice(0, 100),
  };
}

async function main() {
  __resetDiscordBotForTest();
  setDbForTest(fakeDb as any);
  await startDiscordBot();
  setDbForTest(fakeDb as any);

  const rows = [];
  for (const [index, item] of cases.entries()) {
    rows.push(await runCase(item.text, index + 1, item.expected));
  }

  console.table(rows);
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        correct: rows.filter((row) => row.correct).length,
        safeTotal: rows.filter((row) => row.expected === "safe").length,
        safePassed: rows.filter((row) => row.expected === "safe" && !row.flagged)
          .length,
        unsafeTotal: rows.filter((row) => row.expected === "unsafe").length,
        unsafeCaught: rows.filter(
          (row) => row.expected === "unsafe" && row.flagged,
        ).length,
        unsafeMissed: rows.filter(
          (row) => row.expected === "unsafe" && !row.flagged,
        ).length,
        totalAiCalls: rows.reduce((sum, row) => sum + row.aiCalls, 0),
        messagesWithAiCalls: rows.filter((row) => row.aiCalls > 0).length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
