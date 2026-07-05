import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync("server.ts", "utf-8");

const tierRouteBegin = content.indexOf('app.get("/api/guilds/:serverId/tier"');
const tierRouteEnd = content.indexOf('app.get("/api/get-guilds-permissions"'); // the next route

let newTierRoute = `app.get("/api/guilds/:serverId/tier", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    try {
      const serverId = req.params.serverId;
      const userId = (req as any).user.uid;
      const db = getAdminDB();
      const { getServerTierStatus } = await import("./src/utils/entitlements.js");

      const serverTierStatus = await getServerTierStatus(serverId, db);
      
      let userTier = "free";
      let userIsTrial = false;
      
      const userSub = await db.collection("subscriptions").doc(userId).get();
      if (userSub.exists) {
         const data = userSub.data()!;
         let isActive = data.status === "active" || (!data.status && (data.accessTier === "premium" || data.accessTier === "pro_1" || data.accessTier === "pro_3"));
         if (isActive && data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate().getTime() < Date.now()) {
            isActive = false;
         }
         let isTrial = false;
         if (data.status === "trial" && data.trialEnd && data.trialEnd.toDate && data.trialEnd.toDate().getTime() > Date.now()) {
            isTrial = true;
         }
         if (isActive || isTrial) {
            userTier = data.accessTier || "free";
            userIsTrial = isTrial;
         }
      }

      res.json({
        tier: serverTierStatus.isPremium ? serverTierStatus.tier : "free",
        userTier: userTier,
        isBetaTester: serverTierStatus.isBeta,
        userIsTrial: userIsTrial,
        isTrial: serverTierStatus.isTrial,
        maxServersSetting: serverTierStatus.maxServers
      });
    } catch (error) {
      next(error);
    }
  });

  `;
  
content = content.substring(0, tierRouteBegin) + newTierRoute + content.substring(tierRouteEnd);

writeFileSync("server.ts", content);
