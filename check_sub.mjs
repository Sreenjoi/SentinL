import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const { FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL } = process.env;
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore(admin.app(), config.firestoreDatabaseId);

async function check() {
  const uid = 'zP3zF2R4JtO5x98w2R0Kj5I3jQz1'; // I don't know the exact UID, but I can fetch it from auth, or query emails. Wait: the user ID is their UID, but I can use firebase auth to get it by email.
  const user = await admin.auth().getUserByEmail('srinjoymahato9@gmail.com');
  const uidToUse = user.uid;
  const subSnap = await db.collection("subscriptions").doc(uidToUse).get();
  console.log("== Subscription Doc ==");
  console.log(subSnap.exists ? subSnap.data() : "No document");
}

check().catch(console.error);
