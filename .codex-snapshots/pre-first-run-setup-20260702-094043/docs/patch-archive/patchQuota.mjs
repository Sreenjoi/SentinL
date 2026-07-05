import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const regex = /const enforceQuotaLimits = async \(userId: string, email: string, db: admin\.firestore\.Firestore\) => \{[\s\S]*?\n\};\n\nimport \{ isServerPremium/m;

const replacement = `const enforceQuotaLimits = async (userId: string, email: string, db: admin.firestore.Firestore) => {
  try {
    const subSnap = await db.collection("subscriptions").doc(userId).get();
    
    let maxSlots = 1;
    let userSubActive = false;
    if (subSnap.exists) {
      try {
        const resolvedUserSub = resolveSub(subSnap.data(), userId, userId);
        if (resolvedUserSub && resolvedUserSub.isPremium) {
          maxSlots = resolvedUserSub.maxServers;
          userSubActive = true;
        }
      } catch (err) {
        logger.warn({ userId, err: err instanceof Error ? err.message : err }, "[Quota Enforcer] Failed to parse user entitlement date, deferring user limits");
        // Defer decision on max Slots: assume safely 3 until parsed correctly.
        maxSlots = 3; 
        userSubActive = true;
      }
    }

    if (!email) return;

    const modRef = db.collection("moderators").doc(email);
    const modSnap = await modRef.get();
    if (!modSnap.exists) return;

    const modData = modSnap.data() || {};
    const activeIds = modData.activeServerIds || [];

    const nonBetaActiveIds: string[] = [];
    const betaActiveIds: string[] = [];

    // Parallelize with safe concurrency limit (batching by 5)
    const checkServer = async (sId: string) => {
      try {
        const tierStatus = await getServerTierStatus(sId, db);
        if (tierStatus.isPremium && tierStatus.source !== "owner") {
            // It has standalone premium or beta
            betaActiveIds.push(sId);
        } else {
            // No standalone premium; counts against user quota
            nonBetaActiveIds.push(sId);
        }
      } catch (err) {
         logger.warn({ serverId: sId, err: err instanceof Error ? err.message : err }, "[Quota Enforcer] Failed to parse server entitlement date, deferring deactivation");
         // Defer deactivation: treat as beta/standalone so it doesn't take up quota or get deactivated
         betaActiveIds.push(sId);
      }
    };

    for (let i = 0; i < activeIds.length; i += 5) {
      const chunk = activeIds.slice(i, i + 5);
      await Promise.all(chunk.map(checkServer));
    }

    if (nonBetaActiveIds.length > maxSlots) {
      logger.info(\`[Quota Enforcer] User \${email} has \${nonBetaActiveIds.length} non-beta active servers, limit \${maxSlots}. Demoting...\`);
      const keptServers = nonBetaActiveIds.slice(0, maxSlots);
      const removedServers = nonBetaActiveIds.slice(maxSlots);

      for (const sId of removedServers) {
        await db.collection("servers").doc(sId).set({ active: false, botTested: false }, { merge: true });
        logger.info(\`[Quota Enforcer] Deactivated server \${sId} for \${email}.\`);
      }

      const newActiveServerIds = [...keptServers, ...betaActiveIds];
      await modRef.update({
        activeServerIds: newActiveServerIds,
        activeServerId: newActiveServerIds.length > 0 ? newActiveServerIds[0] : null
      });
    }
  } catch (err) {
    logger.error({ err: err }, "[Quota Enforcer] Failed to enforce quota logic:");
  }
};

import { isServerPremium, resolveSub, getServerTierStatus }`;

content = content.replace(regex, replacement);

fs.writeFileSync('server.ts', content);
console.log('patched');
