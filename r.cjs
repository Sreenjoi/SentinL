const admin = require('firebase-admin');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
dotenv.config();

let dbIdFallback = 'ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f';
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(configPath)) {
  try {
    const rawData = fs.readFileSync(configPath, 'utf8');
    const pConfig = JSON.parse(rawData);
    if (pConfig.firestoreDatabaseId) dbIdFallback = pConfig.firestoreDatabaseId;
  } catch (e) {}
}
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY;
const FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;

if (!admin.apps.length) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    admin.initializeApp();
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\n/g, '
'),
      }),
    });
  }
}

const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore(admin.app(), dbIdFallback);

async function run() {
  try {
    let email = 'srinjoymahato9@gmail.com';
    const user = await admin.auth().getUserByEmail(email);
    console.log('Found user UID:', user.uid);
    await db.collection('subscriptions').doc(user.uid).set({
      status: 'inactive',
      trialUsed: false,
      trialStart: null,
      trialEnd: null,
      paidPlan: 'none',
      accessTier: 'free'
    }, { merge: true });
    
    await db.collection('users').doc(user.uid).set({
      tier: 'free'
    }, { merge: true });

    let query = await db.collection('server_subscriptions').where('ownerId', '==', user.uid).get();
    for (let doc of query.docs) {
      console.log('Removing linked server', doc.id);
      await doc.ref.delete();
      await db.collection('servers').doc(doc.id).update({
        tier: 'free'
      }).catch(e => console.log('Missing server doc', doc.id));
    }

    console.log('Finished updating database');
  } catch(e) {
    console.error(e);
  }
}
run();