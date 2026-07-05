import admin from "firebase-admin";

process.env.FIREBASE_PROJECT_ID = "ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f";
admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
const db = admin.firestore();

async function run() {
  const snapshot = await db.collection("servers").get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (JSON.stringify(data).toLowerCase().includes("spaghetti")) {
      console.log(`Matched server: ${doc.id}`);
    }
  }
}

run().catch(console.error);
