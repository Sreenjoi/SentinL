const admin = require("firebase-admin");
async function run() {
  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "sentinl-bot" });
  const db = admin.firestore();
  console.log("Checking Server subscriptions");
  const snap = await db.collection("server_subscriptions").get();
  for (const doc of snap.docs) {
      console.log(doc.id, doc.data());
  }
}
run().catch(console.error).finally(() => process.exit(0));
