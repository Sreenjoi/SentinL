import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync("server.ts", "utf-8");

const startIdx = content.indexOf('app.post("/api/unclaim-server"');
const endIdx = content.indexOf('app.post("/api/kick-bot"');

let newStr = `app.post("/api/unclaim-server", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const { serverId } = req.body;
      const userId = (req as any).user.uid;
      const email = (req as any).user.email;
      const reqUserId = req.body.userId;
      
      if (reqUserId && userId !== reqUserId) {
        return res.status(403).json({ error: "Forbidden: Cannot unclaim for another user" });
      }

      if (!serverId || !userId) {
        return res.status(400).json({ error: "Missing serverId or userId" });
      }

      const db = getAdminDB();
      const userIsSuperAdminForMod = await isSuperAdmin(userId);

      const modDoc = await db.collection("moderators").doc(email).get();
      if (!modDoc.exists && !userIsSuperAdminForMod) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to manage any servers. Please link your Discord account or contact the server owner." });
      }

      const modData = modDoc.data();
      const allowedServerIds = modData?.serverIds || [];
      const userIsSuperAdmin = await isSuperAdmin(userId);
      if (!allowedServerIds.includes(serverId) && !userIsSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: You lack permissions to manage this specific server." });
      }

      const { unclaimServer } = await import("./src/utils/entitlements.js");
      await unclaimServer(userId, serverId, db);
      
      res.json({
        success: true,
        message: "Server successfully unclaimed.",
        tier: "free"
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error unclaiming server:");
      res.status(500).json({ error: "Failed to unclaim server." });
    }
  });

  `;

content = content.substring(0, startIdx) + newStr + content.substring(endIdx);
writeFileSync("server.ts", content);
