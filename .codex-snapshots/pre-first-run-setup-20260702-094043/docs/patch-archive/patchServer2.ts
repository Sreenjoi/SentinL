import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync("server.ts", "utf-8");

const claimStart = content.indexOf('app.post("/api/claim-server"');
const claimEnd = content.indexOf('app.post("/api/unclaim-server"');

let newClaim = `app.post("/api/claim-server", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const { serverId } = req.body;
      const userId = (req as any).user.uid;
      const userEmail = (req as any).user.email;
      const reqUserId = req.body.userId; 
      
      if (!serverId || !userId) {
        return res.status(400).json({ error: "Missing serverId or userId" });
      }
      
      if (reqUserId && userId !== reqUserId) {
        return res.status(403).json({ error: "Forbidden: Cannot claim for another user" });
      }

      const db = getAdminDB();
      const userIsSuperAdminForMod = await isSuperAdmin(userId);
      const modDoc = await db.collection("moderators").doc(userEmail).get();
      if (!modDoc.exists && !userIsSuperAdminForMod) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to manage any servers. Please link your Discord account or contact the server owner." });
      }

      const modData = modDoc.data();
      const allowedServerIds = modData?.serverIds || [];
      const userIsSuperAdmin = await isSuperAdmin(userId);
      if (!allowedServerIds.includes(serverId) && !userIsSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: You lack permissions to claim this specific server." });
      }
      
      // Make sure ownerEmail is synced first
      await db.collection("servers").doc(serverId).set({ ownerEmail: userEmail }, { merge: true });

      const { claimServer } = await import("./src/utils/entitlements.js");
      await claimServer(userId, serverId, db);
      
      res.json({
         success: true,
         message: "Server successfully claimed and linked!",
         tier: "free" // The UI refetches tier
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error claiming server:");
      res.status(403).json({ error: error.message || "Failed to claim server." });
    }
  });

  `;
content = content.substring(0, claimStart) + newClaim + content.substring(claimEnd);
writeFileSync("server.ts", content);
