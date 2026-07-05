import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as admin from 'firebase-admin';
import { invalidateServerTierCache } from "../utils/entitlements.js";

export const PLAN_CONFIG: Record<string, { amountCents: number, maxServers: number }> = {
  pro_1: { amountCents: 799, maxServers: 1 },
  pro_3: { amountCents: 1999, maxServers: 3 }
};

export async function validateCreateOrderRequest(
  req: { user: { uid: string, email?: string }, body: { serverId?: string, userId?: string, plan?: string } },
  deps: {
    checkServerAuth: (uid: string, email: string | undefined, sid: string, db: admin.firestore.Firestore) => Promise<boolean>,
    getAdminDB: () => admin.firestore.Firestore,
    razorpayConfigured: boolean
  }
) {
  if (!deps.razorpayConfigured) {
    return { status: 503, error: "Payment system not configured." };
  }
  let { serverId, userId, plan } = req.body;
  
  if (plan === "premium") plan = "pro_3";
  if (!plan || !PLAN_CONFIG[plan]) return { status: 400, error: "Invalid plan selected." };

  if (req.user.uid !== userId) {
    return { status: 403, error: "Forbidden: user ID mismatch" };
  }

  if (!serverId) {
    return { status: 400, error: "serverId is required for this plan." };
  }

  const db = deps.getAdminDB();
  
  const isAuth = await deps.checkServerAuth(req.user.uid, req.user.email, serverId, db);
  if (!isAuth) {
    return { status: 403, error: "Forbidden: Not authorized for this server" };
  }

  const userSubDoc = await db.collection("subscriptions").doc(String(userId)).get();
  if (userSubDoc.exists) {
    const data = userSubDoc.data();
    if (data?.status === "active" && data?.paidPlan === plan) {
      const expiresAt = data?.expiresAt?.toDate ? data.expiresAt.toDate() : (data?.expiresAt ? new Date(data.expiresAt) : null);
      if (expiresAt && expiresAt > new Date()) {
        return { status: 400, error: "You already have an active subscription for this plan." };
      }
    }
  }

  const serverSubDoc = await db.collection("subscriptions").doc(String(serverId)).get();
  if (serverSubDoc.exists) {
    const data = serverSubDoc.data();
    if (data?.status === "active" && data?.paidPlan === plan) {
      const expiresAt = data?.expiresAt?.toDate ? data.expiresAt.toDate() : (data?.expiresAt ? new Date(data.expiresAt) : null);
      if (expiresAt && expiresAt > new Date()) {
        return { status: 400, error: "This server already has an active subscription for this plan." };
      }
    }
  }

  return { isValid: true, amountCents: PLAN_CONFIG[plan].amountCents, realPlan: plan };
}

export async function processIdempotentRazorpayPayment(
  db: admin.firestore.Firestore,
  paymentData: {
    paymentId: string;
    orderId: string;
    expectedOrderId?: string;
    userId: string;
    serverId: string;
    plan: string;
    amount: number;
    currency: string;
    status: string;
    source: string;
  }
) {
  const { paymentId, orderId, expectedOrderId, userId, serverId, plan, amount, currency, status, source } = paymentData;

  if (expectedOrderId && orderId !== expectedOrderId) {
    throw new Error("Order ID mismatch.");
  }

  if (status !== "captured") {
    throw new Error("Payment not captured.");
  }

  let realPlan = plan;
  if (realPlan === "premium") realPlan = "pro_3";
  if (!realPlan || !PLAN_CONFIG[realPlan]) {
    throw new Error("Invalid plan metadata.");
  }

  const expectedAmount = PLAN_CONFIG[realPlan].amountCents;
  if (amount !== expectedAmount) {
    throw new Error("Amount mismatch.");
  }

  if (currency !== "USD") {
    throw new Error("Currency mismatch.");
  }

  let isDuplicate = false;
  let serversToInvalidate: string[] = [];

  await db.runTransaction(async (t) => {
    const paymentRef = db.collection("processed_payments").doc(paymentId);
    const orderRef = db.collection("processed_orders").doc(orderId);
    
    let userSubRef = null;
    let serverSubRef = null;
    let serverSubLinkRef = null;

    if (userId && userId !== "null" && userId !== "undefined") {
       userSubRef = db.collection("subscriptions").doc(userId);
    } 
    if (serverId && serverId !== "null" && serverId !== "undefined") {
       serverSubRef = db.collection("subscriptions").doc(String(serverId));
       serverSubLinkRef = db.collection("server_subscriptions").doc(String(serverId));
    }

    const refsToGet: any[] = [paymentRef, orderRef];
    if (userSubRef) refsToGet.push(userSubRef);
    if (serverSubRef && !userSubRef) refsToGet.push(serverSubRef);
    if (serverSubLinkRef) refsToGet.push(serverSubLinkRef);

    const snapshots = await t.getAll(...refsToGet);
    const pDoc = snapshots[0];
    const oDoc = snapshots[1];
    
    if (pDoc.exists || oDoc.exists) {
      isDuplicate = true;
      return;
    }
    
    let subDoc = null;
    let linkDoc = null;
    
    if (userSubRef) {
        subDoc = snapshots[2];
        if (serverSubLinkRef) linkDoc = snapshots[3];
    } else if (serverSubRef) {
        subDoc = snapshots[2];
        if (serverSubLinkRef) linkDoc = snapshots[3];
    }

    let linkedServers: string[] = [];
    let currentExpiresAtMs = 0;
    if (subDoc && subDoc.exists) {
        const data = subDoc.data();
        linkedServers = Array.isArray(data?.linkedServerIds) ? data!.linkedServerIds : [];
        if (data?.expiresAt && data?.status === "active") {
           currentExpiresAtMs = data.expiresAt.toDate ? data.expiresAt.toDate().getTime() : new Date(data.expiresAt).getTime();
        }
    }

    const maxServers = PLAN_CONFIG[realPlan].maxServers;
    if (serverId && !linkedServers.includes(serverId)) {
        if (linkedServers.length >= maxServers) {
            throw new Error("Conflict: Linked servers exceed maximum for the new plan. Upgrade plan or select fewer servers.");
        }
        linkedServers.push(serverId);
    }
    
    let serversToRemove: string[] = [];
    if (linkedServers.length > maxServers) {
        throw new Error("Conflict: Linked servers exceed maximum for the new plan. Upgrade plan or select fewer servers.");
    }
    
    serversToInvalidate = [...linkedServers];

    const nowMs = Date.now();
    const effectiveStartMs = Math.max(nowMs, currentExpiresAtMs);
    const expiresAtMs = effectiveStartMs + (30 * 24 * 60 * 60 * 1000);
    const expiresAt = Timestamp.fromMillis(expiresAtMs);

    const processedAt = FieldValue.serverTimestamp();
    t.set(paymentRef, { paymentId, orderId, userId, serverId, plan: realPlan, amount, currency, source, processedAt });
    t.set(orderRef, { paymentId, orderId, source, processedAt });

    if (userSubRef) {
       t.set(userSubRef, {
         status: "active",
         paidPlan: realPlan,
         accessTier: realPlan,
         maxServers,
         expiresAt,
         linkedServerIds: linkedServers,
         trialUsed: true,
         lastPaymentIntent: paymentId,
         lastOrder: orderId,
       }, { merge: true });
       if (serverId) {
         t.set(serverSubLinkRef, { ownerId: userId, accessTier: realPlan }, { merge: true });
       }
    } else if (subDoc && !userSubRef) {
       t.set(serverSubRef, {
         status: "active",
         paidPlan: realPlan,
         accessTier: realPlan,
         maxServers,
         expiresAt,
         linkedServerIds: linkedServers,
         trialUsed: true,
         lastPaymentIntent: paymentId,
         lastOrder: orderId,
       }, { merge: true });
    } else if (serverId && serverSubRef) {
       t.set(serverSubRef, {
         status: "active",
         paidPlan: realPlan,
         accessTier: realPlan,
         maxServers,
         expiresAt,
         linkedServerIds: [serverId],
         trialUsed: true,
         lastPaymentIntent: paymentId,
         lastOrder: orderId,
       }, { merge: true });
    }
  });

  if (!isDuplicate) {
    serversToInvalidate.forEach(id => invalidateServerTierCache(id));
  }

  return isDuplicate;
}

export async function processRazorpayRefund(db: admin.firestore.Firestore, paymentId: string) {
  let serversToInvalidate: string[] = [];
  
  await db.runTransaction(async (t) => {
     // DO ALL GETS HERE BEFORE ANY SETS OR UPDATES
     const paymentRef = db.collection("processed_payments").doc(paymentId);
     const pDoc = await t.get(paymentRef);
     if (!pDoc.exists) {
        throw new Error("Processed payment not found for refund");
     }
     const data = pDoc.data();
     const serverId = data?.serverId;
     const userId = data?.userId;
     
     let userSubRef = null;
     let serverSubRef = null;
     if (userId && userId !== "null" && userId !== "undefined") {
         userSubRef = db.collection("subscriptions").doc(userId);
     }
     if (serverId) {
         serverSubRef = db.collection("subscriptions").doc(String(serverId));
     }
     
     let refs: any[] = [];
     if (userSubRef) refs.push(userSubRef);
     if (serverSubRef) refs.push(serverSubRef);
     
     let uDoc = null;
     let sDoc = null;
     if (refs.length > 0) {
        const snaps = await t.getAll(...refs);
        if (userSubRef) {
           uDoc = snaps[0];
           if (serverSubRef) sDoc = snaps[1];
        } else {
           sDoc = snaps[0];
        }
     }

     let linkDocsToGet: any[] = [];
     let linkRefsToGet: admin.firestore.DocumentReference[] = [];
     let shouldDowngradeUser = false;
     let linkedServers: string[] = [];

     if (uDoc && uDoc.exists) {
        const subData = uDoc.data();
        if (subData?.lastPaymentIntent === paymentId) {
           shouldDowngradeUser = true;
           linkedServers = Array.isArray(subData?.linkedServerIds) ? subData!.linkedServerIds : [];
           serversToInvalidate = [...linkedServers];
           for (const lsid of linkedServers) {
               linkRefsToGet.push(db.collection("server_subscriptions").doc(lsid));
           }
        }
     }

     let linkDocs = [];
     if (linkRefsToGet.length > 0) {
        linkDocs = await t.getAll(...linkRefsToGet);
     }

     // NOW DO ALL WRITES
     t.update(paymentRef, { refunded: true, refundedAt: FieldValue.serverTimestamp() });
     
     if (shouldDowngradeUser && userSubRef) {
        t.update(userSubRef, { status: "refunded", accessTier: "free" });
        linkDocs.forEach((linkDoc, index) => {
           if (linkDoc.exists && linkDoc.data()?.ownerId === userId) {
              t.delete(linkRefsToGet[index]);
           }
        });
     } else if (sDoc && sDoc.exists && serverSubRef) {
        const subData = sDoc.data();
        if (subData?.lastPaymentIntent === paymentId) {
           t.update(serverSubRef, { status: "refunded", accessTier: "free" });
           if (serverId) serversToInvalidate.push(serverId);
        }
     }
  });
  
  for (const id of Array.from(new Set(serversToInvalidate))) {
     invalidateServerTierCache(id);
  }
}
