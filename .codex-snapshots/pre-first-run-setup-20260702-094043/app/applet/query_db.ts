import admin from "firebase-admin";

admin.initializeApp({ projectId: "ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f" });
const db = admin.firestore();

async function run() {
  const res = await db.collection("flaggedMessages").orderBy("timestamp", "desc").limit(5).get();
  res.forEach(d => console.log("Message:", d.data().messageContent, "| Model Used:", d.data().model_used, "| Method:", d.data().detectionMethod, "| Reason:", d.data().reason));
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
