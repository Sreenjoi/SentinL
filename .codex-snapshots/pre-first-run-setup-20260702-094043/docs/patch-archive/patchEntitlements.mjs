import fs from 'fs';

let content = fs.readFileSync('src/utils/entitlements.ts', 'utf8');

content = content.replace(
/export async function unclaimServer(?:[\s\S]*?)function activatePayment/g,
`export async function unclaimServer(userId: string, serverId: string, dbRef: any): Promise<void> {  
  await dbRef.runTransaction(async (t: any) => {
    const subRef = dbRef.collection("subscriptions").doc(userId);
    const linkRef = dbRef.collection("server_subscriptions").doc(serverId);
    
    // Read user subscription and server_subscriptions document in one transaction
    const [subDoc, linkDoc] = await t.getAll(subRef, linkRef);

    let shouldUpdateUser = false;
    let shouldDeleteLink = false;
    let linkedServers: string[] = [];
    
    if (subDoc.exists) {
        const data = subDoc.data();
        linkedServers = Array.isArray(data.linkedServerIds) ? data.linkedServerIds : [];
        const index = linkedServers.indexOf(serverId);
        if (index !== -1) {
            linkedServers.splice(index, 1);
            shouldUpdateUser = true;
        }
    }
    
    // delete the forward index only when ownerId equals the current user
    if (linkDoc.exists && linkDoc.data()?.ownerId === userId) {
        shouldDeleteLink = true;
    }
    
    // Clear related ownership fields only where they belong to that user.
    if (shouldUpdateUser) {
        t.set(subRef, { linkedServerIds: linkedServers }, { merge: true });
    }
    if (shouldDeleteLink) {
        t.delete(linkRef);
    }
  });

  invalidateServerTierCache(serverId);
}

export async function activatePayment`
);

fs.writeFileSync('src/utils/entitlements.ts', content);
