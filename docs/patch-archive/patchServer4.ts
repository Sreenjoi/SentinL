import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync("server.ts", "utf-8");

const startIdx = content.indexOf('app.post("/api/start-trial"');
const endIdx = content.indexOf('app.post("/api/webhooks/razorpay"');

let newStr = `app.post("/api/start-trial", requireAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.body;
    const userId = (req as any).user.uid;
    const email = (req as any).user.email;

    if (!serverId) return res.status(400).json({ error: "No server ID provided" });

    try {
      const db = getAdminDB();
      const isAuth = await checkServerAuth(userId, email, serverId, db);
      if (!isAuth) return res.status(403).json({ error: "Unauthorized" });

      const { isServerPremium, startTrial } = await import("./src/utils/entitlements.js");
      const alreadyPremium = await isServerPremium(serverId, db);
      if (alreadyPremium) {
        return res.status(400).json({ error: "This server already has premium features active or is linked to an active subscription." });
      }

      await startTrial(userId, serverId, 14 * 24 * 60 * 60 * 1000, db);

      res.json({ success: true, tier: "pro_1", message: "Trial started successfully. Enjoy your 14 days of Pro features!" });
    } catch (error: any) {
      logger.error({ err: error }, "Error starting trial:");
      res.status(400).json({ error: error.message || "Failed to start trial." });
    }
  });

  `;

content = content.substring(0, startIdx) + newStr + content.substring(endIdx);
writeFileSync("server.ts", content);
