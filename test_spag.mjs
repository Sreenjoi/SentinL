import "dotenv/config";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
const appletConfig = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: appletConfig.projectId,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});
const config = {
  firestoreDatabaseId: appletConfig.firestoreDatabaseId
};
const fdb = getFirestore(admin.app(), config.firestoreDatabaseId);

async function run() {
  const snapshot = await fdb.collection("servers").get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (JSON.stringify(data).toLowerCase().includes("spaghetti")) {
      console.log(`Matched server: ${doc.id}`);
      console.log("healthWidget:", JSON.stringify(data.healthWidget, null, 2));
    }
  }
}
console.log("Current time:", new Date().toISOString());
console.log("Last updated 1:", new Date(1780899771 * 1000).toISOString());
console.log("Last updated 2:", new Date(1781328142 * 1000).toISOString());
