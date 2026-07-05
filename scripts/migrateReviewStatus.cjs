const admin = require("firebase-admin");
const path = require("path");

async function migrate() {
  if (admin.apps.length === 0) {
    if (!process.env.FIREBASE_PROJECT_ID && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error("ERROR: FIREBASE_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS must be set.");
      process.exit(1);
    }
    // If not running with GOOGLE_APPLICATION_CREDENTIALS, user must set FIREBASE_PROJECT_ID
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }

  const db = admin.firestore();
  console.log("Starting migration: status: 'needs_review' -> status: 'pending' & reviewStatus: 'needs_review'");
  
  try {
    const flaggedRef = db.collection("flaggedMessages");
    // Find documents where `status` is currently "needs_review"
    const snapshot = await flaggedRef.where("status", "==", "needs_review").get();
    
    console.log(`Found ${snapshot.size} messages to migrate.`);
    
    if (snapshot.empty) {
      console.log("No messages to migrate.");
      return;
    }

    const batch = db.batch();
    let count = 0;
    
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: "pending",
        reviewStatus: "needs_review"
      });
      count++;
    });
    
    await batch.commit();
    console.log(`Successfully migrated ${count} messages.`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

// Do not auto-run on module import, require explicit execution
if (require.main === module) {
  migrate().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrate };
