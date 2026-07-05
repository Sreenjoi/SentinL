import admin from "firebase-admin";
import fs from "fs";
const c = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
if (!admin.apps.length) admin.initializeApp({ projectId: "gen-lang-client-0467323567" });
const db = admin.firestore();
db.settings({ databaseId: c.firestoreDatabaseId });

async function run() {
  try {
    await db.collection("users").doc("nonexistent_delete").delete();
    console.log("Delete succeeded for non-existent");
  } catch (e) {
    console.log("Delete failed:", e.message);
  }
}
run();
