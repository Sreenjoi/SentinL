import { getAdminDB } from './server.js'; // have to run compiled JS!

async function run() {
  const db = getAdminDB();
  const users = await db.collection('subscriptions').get();
  console.log("Subscriptions:");
  users.forEach(u => console.log(u.id, u.data()));
  
  const serverLinks = await db.collection('server_subscriptions').get();
  console.log("Server Links:");
  serverLinks.forEach(s => console.log(s.id, s.data()));
}

run();
