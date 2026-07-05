import { config } from 'dotenv';
config();
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs2 from 'fs';

let dbIdFallback = '(default)';
try {
  const parsed = JSON.parse(fs2.readFileSync('./firebase-applet-config.json', 'utf8'));
  if (parsed.firestoreDatabaseId) dbIdFallback = parsed.firestoreDatabaseId;
} catch (e) {}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_PROJECT_ID && FIREBASE_PRIVATE_KEY && FIREBASE_CLIENT_EMAIL) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else {
  admin.initializeApp();
}

const db = getFirestore(admin.app(), dbIdFallback);

async function run() {
  const snap = await db.collection('servers').get();
  let found = false;
  snap.forEach(doc => {
    const data = doc.data();
    if (data.name?.includes('spaghetti') || data.serverName?.includes('spaghetti') || true) {
      console.log('Server ID:', doc.id);
      console.log('Name:', data.name || data.serverName);
      console.log('Active:', data.active);
      console.log('BotPresent:', data.botPresent);
      found = true;
    }
  });
  if (!found) console.log("No servers matched criteria.");
}

run().catch(console.error);
