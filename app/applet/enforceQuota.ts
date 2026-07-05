import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const c = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const keyMatch = readFileSync('/app/applet/.env', 'utf8').match(/FIREBASE_PRIVATE_KEY="(.+?)"/);
const privateKey = keyMatch ? keyMatch[1].replace(/\\n/g, '\n') : "";

initializeApp({
  credential: cert({
    projectId: c.projectId,
    clientEmail: c.serviceAccount.client_email,
    privateKey: privateKey,
  }),
});

const db = getFirestore();

export async function enforceUserQuota(userId: string, email: string) {
  // get user sub
  const subSnap = await db.collection("subscriptions").doc(userId).get();
  const subData = subSnap.data() || {};
  const tier = subData.accessTier || "free";
  
  let maxSlots = 1;
  const isTrial = subData.status === "trial";
  if (tier === "pro_3" || tier === "premium") maxSlots = 3;
  else if (tier === "pro_1") maxSlots = 1;
  else if (isTrial) maxSlots = 1;
  
  const modRef = db.collection("moderators").doc(email);
  const modSnap = await modRef.get();
  if (!modSnap.exists) return;
  
  const modData = modSnap.data() || {};
  const activeIds = modData.activeServerIds || [];
  
  if (activeIds.length > maxSlots) {
    console.log(`User ${email} has ${activeIds.length} active servers, but limit is ${maxSlots}. Deactivating...`);
    // randomly pick maxSlots amount of servers
    const shuffled = [...activeIds].sort(() => 0.5 - Math.random());
    const keptServers = shuffled.slice(0, maxSlots);
    const removedServers = shuffled.slice(maxSlots);
    
    // Deactivate removed servers
    for (const serverId of removedServers) {
      console.log(`Deactivating server ${serverId}...`);
      await db.collection("servers").doc(serverId).update({ active: false });
    }
    
    // Update moderator record
    await modRef.update({ 
      activeServerIds: keptServers,
      activeServerId: keptServers.length > 0 ? keptServers[0] : null
    });
    console.log(`Quota enforced. Kept servers: ${keptServers.join(', ')}`);
  }
}
