const admin = require("firebase-admin");

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    console.error("Failed to initialize Firebase Admin", e);
    process.exit(1);
  }
}

const db = admin.firestore();

async function migrate() {
  console.log("Starting report status migration...");
  let count = 0;
  
  const serversSnap = await db.collection("servers").get();
  for (const serverDoc of serversSnap.docs) {
    const reportsSnap = await db.collection("servers").doc(serverDoc.id).collection("reports").where("status", "==", "resolved").get();
    if (reportsSnap.empty) continue;
    
    const batch = db.batch();
    for (const reportDoc of reportsSnap.docs) {
      batch.update(reportDoc.ref, { status: "actioned" });
      count++;
    }
    
    await batch.commit();
    console.log(`Migrated ${reportsSnap.size} reports in server ${serverDoc.id}.`);
  }
  
  console.log(`Migration complete! Total reports migrated: ${count}`);
  process.exit(0);
}

migrate().catch(console.error);
