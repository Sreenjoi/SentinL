import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from './firebase-applet-config.json' assert { type: "json" };

const app = initializeApp({ credential: cert(serviceAccount.serviceAccount) }, 'test-app');
const db = getFirestore(app);

async function check() {
  const msgs = await db.collection('flaggedMessages').orderBy('timestamp', 'desc').limit(20).get();
  msgs.forEach(doc => {
      console.log(doc.data().serverId, doc.data().content, doc.data().timestamp?.toDate());
  });
}
check();
