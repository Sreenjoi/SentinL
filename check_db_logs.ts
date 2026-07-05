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
  const email = "srinjoymahato9@gmail.com";
  const modSnap = await db.collection("moderators").doc(email).get();
  console.log("== Moderator Doc ==");
  console.log(modSnap.data());
  
  const serverId = "1494768295356797040";
  const serverSnap = await db.collection("servers").doc(serverId).get();
  console.log("== Server Doc ==");
  console.log(serverSnap.data());
}

check().catch(console.error);
