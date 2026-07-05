import "dotenv/config";
import { startDiscordBot, setDbForTest, __resetDiscordBotForTest } from "../src/discordBot.js";

process.env.TEST_MODE = "true";
process.env.NODE_ENV = "test";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";

type ProbeCase = {
  text: string;
  expected: "flag" | "safe";
  category: string;
  note: string;
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
  { text: "I'm not saying you're the problem, but things improve when you're quiet", expected: "flag", category: "plausible-deniability insult", note: "insult hidden behind denial" },
  { text: "It's okay, not everyone is built for thinking", expected: "flag", category: "condescension", note: "no explicit profanity" },
  { text: "You have a very unique relationship with basic instructions", expected: "flag", category: "competence mockery", note: "polite wording" },
  { text: "Some people make silence look underrated", expected: "flag", category: "indirect exclusion", note: "no direct second-person address" },
  { text: "I admire your confidence considering the result", expected: "flag", category: "sarcastic insult", note: "positive words, negative implication" },
  { text: "That was certainly a choice", expected: "flag", category: "passive aggression", note: "context-dependent" },
  { text: "You keep proving the stereotype wrong, just not the way you think", expected: "flag", category: "coded insult", note: "ambiguous stereotype reference" },
  { text: "Bless your heart, you tried", expected: "flag", category: "regional sarcasm", note: "can be affectionate or insulting" },
  { text: "I love when you explain things you don't understand", expected: "flag", category: "sarcasm", note: "incongruent praise" },
  { text: "Do you ever get tired of being confidently lost?", expected: "flag", category: "rhetorical insult", note: "question shape" },
  { text: "Maybe let the adults handle this one", expected: "flag", category: "infantilizing", note: "not obscene" },
  { text: "You're brave for posting that", expected: "flag", category: "backhanded comment", note: "could be genuine without context" },
  { text: "I can explain it slower if that helps", expected: "flag", category: "condescending offer", note: "looks helpful" },
  { text: "No worries, expectations were already low", expected: "flag", category: "indirect insult", note: "target implied" },
  { text: "At least you're consistent", expected: "flag", category: "passive aggression", note: "needs prior failure context" },
  { text: "You really are one of the thinkers of our time", expected: "flag", category: "sarcastic praise", note: "nonstandard phrasing" },
  { text: "It takes talent to miss the point this hard", expected: "flag", category: "competence insult", note: "creative insult" },
  { text: "That explains everything about you", expected: "flag", category: "identity attack", note: "very indirect" },
  { text: "You are such a useful member of this team", expected: "flag", category: "sarcastic praise", note: "literal text is positive" },
  { text: "It's funny how the room gets smarter when you leave", expected: "flag", category: "social exclusion insult", note: "targeted but indirect" },
  { text: "Can we get someone with hands to play support?", expected: "flag", category: "gaming insult", note: "slang/metaphor" },
  { text: "Bro downloaded his aim from wish", expected: "flag", category: "gaming mockery", note: "creative metaphor" },
  { text: "Your takes belong in the museum of bad ideas", expected: "flag", category: "idea/person attack", note: "borderline about opinion" },
  { text: "I hope your pillow is warm tonight", expected: "safe", category: "mild hostile joke", note: "annoyance but not moderation-worthy" },
  { text: "that build is illegal lol", expected: "safe", category: "game banter", note: "not actual law/abuse" },
  { text: "you cooked with that play", expected: "safe", category: "positive slang", note: "slang can confuse models" },
  { text: "that's a wild take but I get it", expected: "safe", category: "safe disagreement", note: "not personal attack" },
  { text: "let's keep this channel on topic", expected: "safe", category: "normal moderation nudge", note: "directive but harmless" },
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
    id: `hard-probe-${Date.now()}-${n}`,
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
      historyText:
        "Previous message: The target user made a mistake, apologized, and the conversation has mild disagreement.",
      rulesText:
        "No harassment, personal insults, sexual content, violent threats, slurs, sarcasm, passive aggressive comments, mockery, bullying, targeted disrespect, or exclusionary comments.",
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
      note: item.note,
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
    hardInappropriateCases: shouldFlag.length,
    safeControls: safe.length,
    caughtHardInappropriate: caught,
    missedHardInappropriate: shouldFlag.length - caught,
    falsePositiveSafeControls: falsePositives,
    hardInappropriateCatchRate: `${Math.round((caught / shouldFlag.length) * 100)}%`,
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
