import { vi, afterAll, beforeAll, beforeEach, afterEach } from 'vitest';
import cron from 'node-cron';
import { __resetGroqBudgetForTest } from '../../src/utils/groqBudget.js';

process.env.TEST_MODE = "true";
process.env.GROQ_API_KEY = "test_groq_api_key";
process.env.PRIMARY_AI_PROVIDER = process.env.PRIMARY_AI_PROVIDER || "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "test_cloudflare_account_id";
process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "test_cloudflare_api_token";
process.env.GEMINI_API_KEY = "test_gemini_api_key";
process.env.DISCORD_TOKEN = "test_discord_token";
process.env.FIREBASE_PROJECT_ID = "test_firebase_project_id";
process.env.GROQ_GLOBAL_LIMITER_ENABLED = "false"; // Disable limiter for general tests unless explicitly tested

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      once: vi.fn(),
      login: vi.fn().mockResolvedValue("mocked_login"),
      isReady: vi.fn().mockReturnValue(true),
      user: { setActivity: vi.fn(), id: "mock_user" },
      guilds: { cache: new Map(), fetch: vi.fn().mockResolvedValue(new Map()) },
      channels: { cache: new Map() }
    }))
  };
});

const mockDoc = {
  get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
  set: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({})
} as any;

const mockCollection = {
  doc: vi.fn().mockReturnValue(mockDoc),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  add: vi.fn().mockResolvedValue({ id: 'mock_id' })
} as any;

mockDoc.collection = vi.fn().mockReturnValue(mockCollection);

vi.mock('firebase-admin', () => {
  const firestoreMock = {
    settings: vi.fn(),
    collection: vi.fn().mockReturnValue(mockCollection),
    runTransaction: vi.fn().mockImplementation((cb) => cb({
       get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
       set: vi.fn(),
       update: vi.fn(),
       delete: vi.fn()
    }))
  };
  return {
    default: {
      apps: [],
      app: vi.fn().mockReturnValue({ firestore: vi.fn().mockReturnValue(firestoreMock) }),
      initializeApp: vi.fn(),
      credential: { cert: vi.fn() },
      firestore: Object.assign(vi.fn().mockReturnValue(firestoreMock), {
        FieldValue: { serverTimestamp: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn() },
        Timestamp: { fromDate: (d: any) => d, fromMillis: (m: any) => m, now: () => new Date() }
      })
    }
  };
});

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  return {
    getFirestore: vi.fn().mockReturnValue({
        settings: vi.fn(),
        collection: vi.fn().mockReturnValue(mockCollection),
        runTransaction: vi.fn().mockImplementation((cb) => cb({
           get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
           set: vi.fn(),
           update: vi.fn(),
           delete: vi.fn()
        }))
    }),
    FieldValue: { serverTimestamp: vi.fn(), increment: vi.fn(), arrayUnion: vi.fn() },
    Timestamp: { fromDate: (d: any) => d, fromMillis: (m: any) => m, now: () => new Date() }
  };
});

// globally disable setInterval for integration tests to prevent hanging open handles
// since many files boot startDiscordBot which spawns infinitely running intervals
vi.spyOn(global, 'setInterval').mockImplementation(() => { return {} as any; });
vi.spyOn(cron, 'schedule').mockImplementation(() => { return {} as any; });

beforeEach(() => {
  // Reset Groq Budget
  __resetGroqBudgetForTest();
  if ((global as any).__resetDiscordBotForTest) {
    (global as any).__resetDiscordBotForTest();
  }

  // Reset rate limiters and cooldowns
  if ((global as any).__resetRateLimiterForTest) {
    (global as any).__resetRateLimiterForTest();
  }
  if ((global as any).__setGroqProviderCooldownUntil) {
    (global as any).__setGroqProviderCooldownUntil(0);
  }
  
  // Reset caches
  if ((global as any).__resetModerationCachesForTest) {
    (global as any).__resetModerationCachesForTest();
  }

  // Restore fetch to mocked version explicitly
  if (!global.fetch || !(global.fetch as any).mockRestore) {
    (global as any).fetch = vi.fn();
  } else {
    (global.fetch as any).mockRestore();
  }

  vi.spyOn(global, 'fetch').mockImplementation(async (url: any, init?: any) => {
    const urlStr = url.toString();
    if (urlStr.includes('api.groq.com') || urlStr.includes('generativelanguage.googleapis.com') || urlStr.includes('api.cloudflare.com')) {
      return new Response(JSON.stringify({ 
        choices: [{ message: { content: "Mocked AI response" } }],
        result: { response: "Mocked AI response" },
        candidates: [{ content: { parts: [{ text: "Mocked AI response" }] } }]
      }), {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
});

afterEach(() => {
  if ((global as any).__resetDiscordBotForTest) {
    (global as any).__resetDiscordBotForTest();
  }
});

beforeAll(() => {
});

afterAll(() => {
    vi.restoreAllMocks();
});
