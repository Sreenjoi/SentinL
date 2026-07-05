import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getServerTierStatus, isServerPremium, invalidateServerTierCache, claimServer, activatePayment, processExpiry, startTrial } from "../../src/utils/entitlements.js";
import admin from "firebase-admin";

const MOCK_TIME = 1000000000000;

describe("Entitlements Resolver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(MOCK_TIME));
    invalidateServerTierCache("server1");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getDbRef = (docs: Record<string, any>) => {
    let transactions: any[] = [];
    return {
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => {
            const data = docs[`${col}/${id}`];
            return { exists: !!data, data: () => data, id };
          },
          update: async (data: any) => {
            docs[`${col}/${id}`] = { ...docs[`${col}/${id}`], ...data };
          },
          set: async (data: any, opts: any) => {
            if (opts?.merge) {
              docs[`${col}/${id}`] = { ...(docs[`${col}/${id}`] || {}), ...data };
            } else {
              docs[`${col}/${id}`] = data;
            }
          }
        }),
        where: (field: string, op: string, val: string) => ({
          get: async () => {
            if (field === "linkedServerIds" && op === "array-contains") {
               const docsData = Object.keys(docs)
                 .filter(k => k.startsWith(col + "/") && (docs[k].linkedServerIds || []).includes(val))
                 .map(k => ({ data: () => docs[k], id: k.split("/")[1] }));
               return { docs: docsData };
            }
            return { docs: [] };
          }
        })
      }),
      runTransaction: async (cb: any) => {
        const t = {
          get: async (ref: any) => typeof ref.get === "function" ? ref.get() : ref,
          set: (ref: any, data: any, opts: any) => {
             const path = ref.path || (ref.doc ? "unknown" : "unknown"); 
             // Normally this would be a path. But let's mock it inside set above.
             // We can just call ref.set if we have a mocked ref.
             if (ref.id) {
                const parts = typeof ref.collection === "function" ? ref : null; 
             }
             if (typeof ref.set === "function") {
               ref.set(data, opts);
             }
          }
        };
        // wait, we passed doc() as ref to t.set(subRef, ...). Let's patch `doc()` to have `set`.
        return await cb(t);
      }
    };
  };

  it("returns free for missing data", async () => {
    const db = getDbRef({});
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(false);
    expect(tier.tier).toBe("free");
  });

  it("resolves direct sub by Timestamp", async () => {
    const db = getDbRef({
      "subscriptions/server1": {
        status: "active",
        accessTier: "pro_1",
        expiresAt: { toMillis: () => MOCK_TIME + 10000, toDate: () => new Date(MOCK_TIME + 10000) }
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(true);
    expect(tier.tier).toBe("pro_1");
  });

  it("resolves direct sub by String", async () => {
    const db = getDbRef({
      "subscriptions/server1": {
        status: "active",
        accessTier: "pro_3",
        expiresAt: new Date(MOCK_TIME + 10000).toISOString()
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(true);
    expect(tier.tier).toBe("pro_3");
  });

  it("resolves failed sub as not premium", async () => {
    const db = getDbRef({
      "subscriptions/server1": {
        status: "failed",
        accessTier: "pro_3",
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(false);
  });

  it("resolves trial sub via trialEnd", async () => {
    const db = getDbRef({
      "subscriptions/server1": {
        status: "trial",
        accessTier: "pro_1",
        trialEnd: MOCK_TIME + 10000
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(true);
    expect(tier.status).toBe("trial");
  });

  it("resolves via linkedServerIds and not server_subscriptions", async () => {
    const db = getDbRef({
      "subscriptions/user1": {
        status: "active",
        accessTier: "pro_3",
        linkedServerIds: ["server1", "server2"],
        expiresAt: MOCK_TIME + 10000
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(true);
    expect(tier.tier).toBe("pro_3");
    expect(tier.source).toBe("owner");
  });

  it("falls back to server document beta grants ONLY with explicit expiry", async () => {
    const db = getDbRef({
      "servers/server1": {
        isBetaTester: true,
        betaExpiry: MOCK_TIME + 10000
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(true);
    expect(tier.status).toBe("trial");
    expect(tier.isBeta).toBe(true);
  });

  it("ignores server document beta grants without explicit expiry", async () => {
    const db = getDbRef({
      "servers/server1": {
        isBetaTester: true
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(false);
    expect(tier.tier).toBe("free");
  });

  it("cleans up expired standalone trials immediately", async () => {
    const db = getDbRef({
      "subscriptions/server1": {
        status: "trial",
        accessTier: "pro_1",
        trialEnd: MOCK_TIME - 10000 // EXPIRED
      }
    });
    const tier = await getServerTierStatus("server1", db);
    expect(tier.isPremium).toBe(false);
  });

  it("claims fail securely if another user claimed and enforces slot limit", async () => {
    const dbDocs = {
      "subscriptions/user1": {
        status: "active",
        accessTier: "pro_1",
        linkedServerIds: ["server_other"], // Already has 1 (max for pro_1)
        expiresAt: MOCK_TIME + 10000
      },
      "subscriptions/user2": {
        status: "active",
        accessTier: "pro_3",
        linkedServerIds: ["server1"],
        expiresAt: MOCK_TIME + 10000
      }
    };
    const db = getDbRef(dbDocs);
    // User1 tries to claim another server but max is 1
    await expect(claimServer("user1", "server_new", db)).rejects.toThrow(/max 1 servers/);

    // User1 tries to claim server1 which is claimed by User2
    // We adjust User1 to pro_3 for this test
    dbDocs["subscriptions/user1"].accessTier = "pro_3";
    await expect(claimServer("user1", "server1", db)).rejects.toThrow(/already claimed by another administrator/);
  });

  it("processExpiry transitions state securely", async () => {
    const dbDocs = {
      "subscriptions/user1": {
        status: "active",
        accessTier: "pro_1"
      }
    };
    const db = getDbRef(dbDocs);
    await processExpiry("user1", db);
    expect(dbDocs["subscriptions/user1"].status).toBe("expired");
  });
});
