import fs from 'fs';

let content = fs.readFileSync('src/services/razorpay.ts', 'utf8');

content = content.replace(
/export async function processRazorpayRefund[\s\S]*/,
`export async function processRazorpayRefund(db: admin.firestore.Firestore, paymentId: string) {
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
`
);

fs.writeFileSync('src/services/razorpay.ts', content);
console.log("Written!");
