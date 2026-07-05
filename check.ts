import * as admin from 'firebase-admin';

// Provide absolute fallback config paths
const serviceAccount = require('./firebase-applet-config.json');

if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function run() {
  const users = await db.collection('subscriptions').get();
  console.log("Subscriptions:");
  users.forEach(u => console.log(u.id, u.data()));
  
  const serverLinks = await db.collection('server_subscriptions').get();
  console.log("Server Links:");
  serverLinks.forEach(s => console.log(s.id, s.data()));
  
  // also get the spaghetti server
  const servers = await db.collection('servers').where('name', '==', 'spaghetti').get();
  if (servers.empty) {
     const all = await db.collection('servers').limit(10).get();
     all.forEach(s => console.log("server", s.id, s.data().name, s.data().ownerEmail));
  } else {
     servers.forEach(s => console.log("spaghetti server", s.id, s.data()));
  }
}

run();
