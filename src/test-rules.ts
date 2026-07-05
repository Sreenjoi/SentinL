import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { getFirestore } from "firebase-admin/firestore";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore(admin.app(), config.firestoreDatabaseId);

async function run() {
  try {
    const snap = await db.collection("flaggedMessages").get();
    console.log(`Found ${snap.size} flagged messages.`);
    snap.forEach((d: any) =>
      console.log(d.id, d.data().content, d.data().serverId),
    );
  } catch (e) {
    console.error(e);
  }
}
run();
