import "dotenv/config";
import { startDiscordBot, setDbForTest, __resetDiscordBotForTest } from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

type SavedFlag = {
  content?: string;
  level?: string;
  confidence?: number;
  reason?: string;
  detectionMethod?: string;
  model_used?: string;
  reviewOnly?: boolean;
};

const savedFlags: SavedFlag[] = [];
const httpCalls: Array<{ provider: string; model: string; status?: number; body?: string }> = [];

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
  batch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async (cb: any) => {
    const tx = {
      get: async (ref: any) => ref.get(),
      set: () => {},
      update: () => {},
    };
    return cb(tx);
  },
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  let model = "";
  try {
    model = JSON.parse(String(init?.body || "{}")).model || "";
  } catch {}
  const provider = url.includes("api.cloudflare.com")
    ? "cloudflare"
    : url.includes("api.groq.com")
      ? "groq"
      : "other";
  const response = await originalFetch(input, init);
  let body = "";
  try {
    body = await response.clone().text();
  } catch {}
  httpCalls.push({
    provider,
    model,
    status: response.status,
    body: body.slice(0, 500).replace(/\s+/g, " "),
  });
  return response;
};

function makeMessage(content: string, n: number) {
  return {
    id: `probe-${Date.now()}-${n}`,
    content,
    channelId: "probe-channel",
    createdAt: new Date(),
    deletable: false,
    author: {
      id: "probe-user",
      username: "ProbeUser",
      displayAvatarURL: () => "",
    },
    reference: null,
    mentions: { users: { size: 0 } },
    client: {
      channels: {
        cache: { get: () => null },
        fetch: async () => null,
      },
      guilds: { cache: { get: () => null } },
    },
    delete: async () => {},
  };
}

const cases = [
  "cunt",
  "you are a cunt",
  "fuck off",
  "kill yourself",
  "sup dumbass",
  "Congratulations, you just made things worse",
  "oh aren't you a little crybaby",
  "wanna suck my phallus?",
  "lauda",
  "hello everyone",
];

async function main() {
  __resetDiscordBotForTest();
  setDbForTest(fakeDb as any);
  await startDiscordBot();
  setDbForTest(fakeDb as any);

  const executeAIModeration = (globalThis as any).__executeAIModeration;
  if (typeof executeAIModeration !== "function") {
    throw new Error("Moderation function was not exposed in test mode.");
  }

  const rows = [];
  for (const [index, text] of cases.entries()) {
    savedFlags.length = 0;
    httpCalls.length = 0;

    const result = await executeAIModeration({
      serverId: "probe-server",
      serverData: {
        ...serverDoc,
        confidenceThreshold: 80,
        autoDelete: false,
        logChannelId: null,
        keywords: [],
      },
      isPremium: false,
      useContext: false,
      enableDualModel: false,
      historyText: "No context provided.",
      rulesText:
        "No harassment, insults, sexual content, slurs, threats, sarcasm, passive aggressive comments, or targeted disrespect.",
      message: makeMessage(text, index + 1),
      coalescedMessages: [makeMessage(text, index + 1)],
    });

    rows.push({
      text,
      calls: httpCalls.map((c) => `${c.provider}:${c.model || "(no model)"}:${c.status}`).join(" -> "),
      raw: httpCalls.map((c) => c.body || "").join(" || ").slice(0, 700),
      savedAsFlag: savedFlags.length > 0,
      modelUsedOnFlag: savedFlags[0]?.model_used || "",
      level: savedFlags[0]?.level || "",
      confidence: savedFlags[0]?.confidence || "",
      detectionMethod: savedFlags[0]?.detectionMethod || "",
      reviewOnly: savedFlags[0]?.reviewOnly || false,
      aiRealSuccess: result?.aiRealSuccess ?? "",
    });
  }

  console.table(rows);
}

main()
  .catch((err) => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
