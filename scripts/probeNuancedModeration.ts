import "dotenv/config";
import { startDiscordBot, setDbForTest, __resetDiscordBotForTest } from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

type ProbeCase = {
  text: string;
  expected: "flag" | "safe";
  category: string;
};

type SavedFlag = {
  content?: string;
  level?: string;
  confidence?: number;
  reason?: string;
  detectionMethod?: string;
  model_used?: string;
  reviewOnly?: boolean;
};

const cases: ProbeCase[] = [
  { text: "Congratulations, you just made things worse", expected: "flag", category: "sarcasm/passive aggression" },
  { text: "Wow, you really saved the day by ruining it", expected: "flag", category: "sarcasm/passive aggression" },
  { text: "Thank god you don't use your brain too often", expected: "flag", category: "targeted competence insult" },
  { text: "Maybe the lightbulb in your head is broken", expected: "flag", category: "metaphorical insult" },
  { text: "How genius of you, nobody asked", expected: "flag", category: "sarcastic insult" },
  { text: "Classic you, always making everyone fix your mess", expected: "flag", category: "targeted harassment" },
  { text: "You must be proud of being this useless", expected: "flag", category: "targeted insult" },
  { text: "Aren't you a little crybaby today", expected: "flag", category: "mockery" },
  { text: "Your whole personality is being exhausting", expected: "flag", category: "personal attack" },
  { text: "It's impressive how confidently wrong you are", expected: "flag", category: "sarcastic insult" },
  { text: "Please continue, your stupidity is educational", expected: "flag", category: "targeted insult" },
  { text: "You bring negative value to every conversation", expected: "flag", category: "targeted insult" },
  { text: "Bro has the survival instincts of a wet paper bag", expected: "flag", category: "mocking insult" },
  { text: "Your parents must be so proud of this disaster", expected: "flag", category: "family-targeted insult" },
  { text: "I hope your account gets nuked", expected: "flag", category: "hostile wish" },
  { text: "Go disappear from this server", expected: "flag", category: "harassment/exclusion" },
  { text: "Nobody here would miss you", expected: "flag", category: "harassment/self-harm adjacent" },
  { text: "wanna suck my phallus?", expected: "flag", category: "sexual harassment" },
  { text: "send pics or you're useless", expected: "flag", category: "sexual coercion/harassment" },
  { text: "I will beat you if you join voice", expected: "flag", category: "violent threat" },
  { text: "sup dumbass", expected: "flag", category: "direct insult" },
  { text: "cuntsucker", expected: "flag", category: "profanity/abuse" },
  { text: "lauda", expected: "flag", category: "transliterated slang" },
  { text: "u chutiya", expected: "flag", category: "transliterated slur" },
  { text: "kurwa you absolute genius", expected: "flag", category: "mixed-language insult" },
  { text: "nice shot, that was clean", expected: "safe", category: "safe gameplay" },
  { text: "great job team, you helped a lot", expected: "safe", category: "safe praise" },
  { text: "fair enough, I see your point", expected: "safe", category: "safe disagreement" },
  { text: "can someone help me with this setting", expected: "safe", category: "safe help request" },
  { text: "good night all, see you tomorrow", expected: "safe", category: "safe greeting" },
];

const savedFlags: SavedFlag[] = [];
const httpCalls: Array<{ provider: string; model: string; status?: number }> = [];

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
  httpCalls.push({ provider, model, status: response.status });
  return response;
};

function makeMessage(content: string, n: number) {
  return {
    id: `nuance-probe-${Date.now()}-${n}`,
    content,
    channelId: "probe-channel",
    createdAt: new Date(),
    deletable: false,
    author: {
      id: "probe-user",
      username: "ProbeUser",
      displayAvatarURL: () => "",
    },
    reference: { messageId: "previous-message" },
    mentions: { users: { size: 1 } },
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
  for (const [index, item] of cases.entries()) {
    savedFlags.length = 0;
    httpCalls.length = 0;

    const msg = makeMessage(item.text, index + 1);
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
      historyText: "Previous message: The conversation has mild disagreement and the target user just made a mistake.",
      rulesText:
        "No harassment, personal insults, sexual content, violent threats, slurs, sarcasm, passive aggressive comments, mockery, bullying, or targeted disrespect.",
      trainingContextText: "",
      message: msg,
      coalescedMessages: [msg],
    });

    const caught = savedFlags.length > 0;
    const flag = savedFlags[0];
    rows.push({
      "#": index + 1,
      expected: item.expected,
      result: caught ? "caught" : "missed",
      pass: item.expected === "flag" ? caught : !caught,
      category: item.category,
      text: item.text,
      level: flag?.level || "",
      confidence: flag?.confidence || "",
      method: flag?.detectionMethod || "",
      model: flag?.model_used || "",
      reviewOnly: flag?.reviewOnly === true,
      calls: httpCalls.map((c) => `${c.provider}:${c.status}`).join(" -> "),
    });
  }

  console.table(rows);
  const shouldFlag = rows.filter((r) => r.expected === "flag");
  const safe = rows.filter((r) => r.expected === "safe");
  const caught = shouldFlag.filter((r) => r.result === "caught").length;
  const falsePositives = safe.filter((r) => r.result === "caught").length;
  console.log(JSON.stringify({
    total: rows.length,
    inappropriateCases: shouldFlag.length,
    safeControls: safe.length,
    caughtInappropriate: caught,
    missedInappropriate: shouldFlag.length - caught,
    falsePositiveSafeControls: falsePositives,
    inappropriateCatchRate: `${Math.round((caught / shouldFlag.length) * 100)}%`,
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
