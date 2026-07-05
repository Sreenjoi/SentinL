
import { config } from 'dotenv';
config();
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs2 from 'fs';

let dbIdFallback = 'ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f';
try {
  const parsed = JSON.parse(fs2.readFileSync('./firebase-applet-config.json', 'utf8'));
  if (parsed.firestoreDatabaseId) dbIdFallback = parsed.firestoreDatabaseId;
} catch (e) {}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
let FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_PROJECT_ID && FIREBASE_PRIVATE_KEY && FIREBASE_CLIENT_EMAIL) {
  if (FIREBASE_PRIVATE_KEY.includes('\\n')) {
     FIREBASE_PRIVATE_KEY = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY,
    }),
  });
} else {
  admin.initializeApp();
}

const db = getFirestore(admin.app(), dbIdFallback);
async function run() {
  console.log('Fetching servers...');
  const snap = await db.collection('servers').get();
  if (snap.empty) {
    console.log('No servers found.');
    return;
  }
  snap.forEach(doc => {
    console.log('Server ID:', doc.id);
    console.log('Config:', JSON.stringify(doc.data(), null, 2));
    console.log('---');
  });
}
run().catch(console.error);
