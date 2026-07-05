import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { isPaidTier } from "./planHelper.js";
import { LRUCache } from "./lruCache.js";

export type TierStatus = {
  isPremium: boolean;
  tier: string;
  status: string;
  isBeta: boolean;
  isTrial: boolean;
  source: "standalone" | "owner" | "legacy_beta" | "none";
  ownerId: string | null;
  expiry: Timestamp | null;
  linkedServerIds: string[];
  maxServers: number;
};

const PREMIUM_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const premiumTierCache = new LRUCache<string, TierStatus>(5000, PREMIUM_CACHE_TTL);

export function invalidateServerTierCache(serverId: string) {
  premiumTierCache.delete(serverId);
}

// Convert any date-like value to Firestore Timestamp
export function getTimestamp(val: any): Timestamp | null {
  if (val === null || val === undefined) return null;
  if (typeof val?.toMillis === 'function' && typeof val?.toDate === 'function') {
    return val as Timestamp; // Already a Firestore Timestamp
  }
  if (val instanceof Date || typeof val?.getTime === 'function') {
    const t = val.getTime();
    if (!isNaN(t)) return Timestamp.fromMillis(t);
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return Timestamp.fromMillis(d.getTime());
  }
  throw new Error(`Invalid date format: ${JSON.stringify(val)}`);
}

export function resolveSub(data: any | undefined, serverId: string, docId: string): TierStatus | null {
  if (!data) return null;
  const tier = data.accessTier || data.tier;
  const status = data.status;
  const isBeta = !!(data.isBeta || data.isBetaTester);
  const maxServers = data.maxServers || (tier === 'pro_3' || tier === 'premium' ? 3 : 1);
  const linkedServerIds = Array.isArray(data.linkedServerIds) ? data.linkedServerIds : [];
  
  const trialEnd = getTimestamp(data.trialEnd);
  const expiresAt = getTimestamp(data.expiresAt);
  
  const now = Timestamp.now();

  // Trial check
  if (status === "trial" && trialEnd) {
    if (trialEnd.toMillis() > now.toMillis()) {
      return {
        isPremium: true, tier: tier || 'pro_1', status, isBeta, isTrial: true,
        source: docId === serverId ? "standalone" : "owner",
        ownerId: docId === serverId ? null : docId,
        expiry: trialEnd, linkedServerIds, maxServers
      };
    }
  }
  
  // Regular active sub check
  // Migration helper: For old records lacking status but having a tier, require a valid non-expired expiresAt
  let isActive = status === "active" || (!status && (tier === "premium" || tier === "pro_1" || tier === "pro_3") && !!expiresAt);
  if (isActive && expiresAt) {
    if (expiresAt.toMillis() < now.toMillis()) isActive = false;
  }
  
  if (isActive && isPaidTier(tier, status)) {
    return {
      isPremium: true, tier: tier, status: status || 'active', isBeta, isTrial: false,
      source: docId === serverId ? "standalone" : "owner",
      ownerId: docId === serverId ? null : docId,
      expiry: expiresAt, linkedServerIds, maxServers
    };
  }
  
  return null;
}

export async function getServerTierStatus(serverId: string, dbRef: any): Promise<TierStatus> {
  const cached = premiumTierCache.get(serverId);
  if (cached) {
    return cached;
  }

  const defaultStatus: TierStatus = {
    isPremium: false, tier: 'free', status: 'missing', isBeta: false, isTrial: false,
    source: "none", ownerId: null, expiry: null, linkedServerIds: [], maxServers: 1
  };

  // 1. Check standalone server subscription directly
  const subSnap = await dbRef.collection("subscriptions").doc(serverId).get();
  if (subSnap.exists) {
    const validSub = resolveSub(subSnap.data(), serverId, serverId);
    if (validSub) {
      premiumTierCache.set(serverId, validSub);
      return validSub;
    }
  }

  // 2. Check subscriptions where linkedServerIds array contains serverId
  // Only valid if owner subscription actively links it. 
  // We no longer rely on `server_subscriptions` acting as a forward index for tier fallbacks.
  const linkedQuery = await dbRef.collection("subscriptions").where("linkedServerIds", "array-contains", serverId).get();
  for (const doc of linkedQuery.docs) {
    const validSub = resolveSub(doc.data(), serverId, doc.id);
    if (validSub) {
      premiumTierCache.set(serverId, validSub);
      return validSub;
    }
  }

  // 3. Fallback checking servers document for beta grants ONLY IF explicit expiry
  const serverDoc = await dbRef.collection("servers").doc(serverId).get();
  if (serverDoc.exists) {
    const d = serverDoc.data();
    if ((d?.isBetaTester || d?.isBeta) && d?.betaExpiry) {
      const exp = getTimestamp(d.betaExpiry);
      if (exp && exp.toMillis() > Date.now()) {
        const betaSub: TierStatus = {
          isPremium: true, tier: "pro_1", status: "trial", isBeta: true, isTrial: true,
          source: "legacy_beta", ownerId: null, expiry: exp, linkedServerIds: [serverId], maxServers: 1
        };
        premiumTierCache.set(serverId, betaSub);
        return betaSub;
      } else {
        // Auto clean-up expired beta grant
        dbRef.collection("servers").doc(serverId).update({ isBeta: FieldValue.delete(), isBetaTester: FieldValue.delete(), betaExpiry: FieldValue.delete() }).catch(() => {});
      }
    }
  }

  premiumTierCache.set(serverId, defaultStatus);
  return defaultStatus;
}

export async function isServerPremium(serverId: string, dbRef: any): Promise<boolean> {
  const d = await getServerTierStatus(serverId, dbRef);
  return d.isPremium;
}

export async function claimServer(userId: string, serverId: string, dbRef: any): Promise<void> {
  invalidateServerTierCache(serverId);
  
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    const subDoc = await t.get(subRef);
    const data = subDoc.exists ? subDoc.data() : {};
    
    let accessTier = data.accessTier || "free";
    let isTrial = data.status === "trial";
    let maxServers = 1;
    if (accessTier === "pro_3" || accessTier === "premium") maxServers = 3;
    else if (accessTier === "pro_1") maxServers = 1;
    else if (isTrial) maxServers = 1;
    
    const linkedServers: string[] = Array.isArray(data.linkedServerIds) ? data.linkedServerIds : [];
    
    if (linkedServers.includes(serverId)) return; // Idempotent
    
    // Concurrency check for quota
    if (linkedServers.length >= maxServers) {
      throw new Error(`Quota exceeded: max ${maxServers} servers`);
    }
    
    // Ensure no other admin has claimed this server via linkedServerIds
    const existingClaims = await t.get(dbRef.collection("subscriptions").where("linkedServerIds", "array-contains", serverId));
    for (const claimDoc of existingClaims.docs) {
      if (claimDoc.id !== userId) {
        throw new Error("This server is already claimed by another administrator.");
      }
    }

    linkedServers.push(serverId);
    t.set(subRef, { linkedServerIds: linkedServers, maxServers }, { merge: true });
    t.set(dbRef.collection("server_subscriptions").doc(serverId), { ownerId: userId, accessTier: accessTier }, { merge: true });
  });
}

export async function unclaimServer(userId: string, serverId: string, dbRef: any): Promise<void> {
  invalidateServerTierCache(serverId);
  
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    const subDoc = await t.get(subRef);
    
    let modifiedSub = false;
    if (subDoc.exists) {
      const data = subDoc.data();
      const linkedServers: string[] = Array.isArray(data.linkedServerIds) ? data.linkedServerIds : [];
      const index = linkedServers.indexOf(serverId);
      if (index !== -1) {
        linkedServers.splice(index, 1);
        t.set(subRef, { linkedServerIds: linkedServers }, { merge: true });
        modifiedSub = true;
      }
    }
    
    const serverSubRef = dbRef.collection("server_subscriptions").doc(serverId);
    const serverSubDoc = await t.get(serverSubRef);
    if (serverSubDoc.exists && serverSubDoc.data().ownerId === userId) {
      t.delete(serverSubRef);
    }
  });
}

export async function activatePayment(userId: string, planName: string, expiresAtMs: number, dbRef: any): Promise<void> {
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    let accessTier = "free";
    let maxServers = 1;
    if (planName.toLowerCase() === "premium" || planName.toLowerCase() === "pro_3") {
      accessTier = "pro_3";
      maxServers = 3;
    } else if (planName.toLowerCase() === "pro" || planName.toLowerCase() === "pro_1") {
      accessTier = "pro_1";
      maxServers = 1;
    }
    
    const expiresAt = Timestamp.fromMillis(expiresAtMs);
    t.set(subRef, {
      status: "active",
      accessTier,
      maxServers,
      expiresAt
    }, { merge: true });
  });
}

export async function processRefund(userId: string, dbRef: any): Promise<void> {
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    t.set(subRef, { status: "refunded", accessTier: "free" }, { merge: true });
  });
}

export async function processExpiry(userId: string, dbRef: any): Promise<void> {
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    const doc = await t.get(subRef);
    if (doc.exists) {
       t.set(subRef, { status: "expired" }, { merge: true });
    }
  });
}

export async function startTrial(userId: string, serverId: string, durationMs: number = 7 * 24 * 60 * 60 * 1000, dbRef: any): Promise<void> {
  invalidateServerTierCache(serverId);
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    const subDoc = await t.get(subRef);
    if (subDoc.exists) {
      const data = subDoc.data();
      if ((data.status !== "free" && data.status !== "missing") || data.trialUsed) {
         // Prevent restarting a trial or overriding active sub
         throw new Error("Trial already used or active subscription exists.");
      }
    }
    
    // Ensure no other admin has claimed this server via linkedServerIds
    const existingClaims = await t.get(dbRef.collection("subscriptions").where("linkedServerIds", "array-contains", serverId));
    for (const claimDoc of existingClaims.docs) {
      if (claimDoc.id !== userId) {
        throw new Error("This server is already claimed by another administrator.");
      }
    }
    
    const trialEnd = Timestamp.fromMillis(Date.now() + durationMs);
    const dataObj = subDoc.exists ? subDoc.data() : {};
    const linkedServerIds = Array.isArray(dataObj.linkedServerIds) ? dataObj.linkedServerIds : [];
    if (!linkedServerIds.includes(serverId)) {
      linkedServerIds.push(serverId);
    }
    
    t.set(subRef, {
      status: "trial",
      accessTier: "pro_1",
      maxServers: 1,
      trialEnd,
      trialUsed: true,
      linkedServerIds
    }, { merge: true });
    
    t.set(dbRef.collection("server_subscriptions").doc(serverId), { ownerId: userId, accessTier: "pro_1" }, { merge: true });
  });
}

