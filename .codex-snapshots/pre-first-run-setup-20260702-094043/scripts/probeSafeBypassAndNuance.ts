import "dotenv/config";
import {
  startDiscordBot,
  setDbForTest,
  __resetDiscordBotForTest,
} from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

const safeMessages = [
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
  `We tested the bot setup after the restart.
The dashboard opened normally and the queue looked empty, so I think the basic flow is fine.`,
  `I changed the channel name for the event.
The schedule is still the same, and I will post the reminder before it starts.`,
];

const nuancedInsults = [
  "Congratulations, you just made things worse.",
  "Thank god you don't use your brain too often.",
  "Maybe the lightbulb in your head is broken.",
  "Oh wow how genius of you.",
  "Aren't you a little crybaby today.",
  "Classic you, somehow missing the obvious part again.",
  "You must be really proud of that disaster.",
  "Bold choice from you to make the easy thing harder.",
  "That explains a lot about your decision making.",
  "Great job, you managed to lower the bar again.",
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
    id: `safe-nuance-probe-${Date.now()}-${n}`,
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
    channel: {
      messages: {
        fetch: async () => new Map(),
      },
    },
    client: {
      channels: { cache: { get: () => null }, fetch: async () => null },
      guilds: { cache: { get: () => null } },
    },
    delete: async () => {},
  };
}

async function runCase(text: string, index: number, expected: "safe" | "unsafe") {
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
    providers: httpCalls.map((c) => `${c.provider}:${c.status}`).join(" -> "),
    flagged: savedFlags.length > 0,
    method: savedFlags[0]?.detectionMethod || "",
    level: savedFlags[0]?.level || "",
    model: savedFlags[0]?.modelUsed || savedFlags[0]?.model_used || "",
    preview: text.replace(/\s+/g, " ").slice(0, 90),
  };
}

async function main() {
  __resetDiscordBotForTest();
  setDbForTest(fakeDb as any);
  await startDiscordBot();
  setDbForTest(fakeDb as any);

  if (typeof (globalThis as any).__executeAIModeration !== "function") {
    throw new Error("Moderation function was not exposed in test mode.");
  }

  const rows = [];
  let idx = 1;
  for (const text of safeMessages) rows.push(await runCase(text, idx++, "safe"));
  for (const text of nuancedInsults) rows.push(await runCase(text, idx++, "unsafe"));

  console.table(rows);
  const safeRows = rows.filter((r) => r.expected === "safe");
  const unsafeRows = rows.filter((r) => r.expected === "unsafe");
  console.log(
    JSON.stringify(
      {
        safeTotal: safeRows.length,
        safeAiCalls: safeRows.reduce((sum, row) => sum + row.aiCalls, 0),
        safeMessagesThatMadeAiCalls: safeRows.filter((row) => row.aiCalls > 0)
          .length,
        safeFlagged: safeRows.filter((row) => row.flagged).length,
        unsafeTotal: unsafeRows.length,
        unsafeAiCalls: unsafeRows.reduce((sum, row) => sum + row.aiCalls, 0),
        unsafeCaught: unsafeRows.filter((row) => row.flagged).length,
        unsafeMissed: unsafeRows.filter((row) => !row.flagged).length,
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
