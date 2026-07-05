const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(
  'app.post("/api/bot/notify-setting", async (req, res)',
  'app.post("/api/bot/notify-setting", requireAuth, requireServerAuth, async (req: any, res)'
);

content = content.replace(
  'app.get("/api/guilds/:serverId/reports", async (req, res)',
  'app.get("/api/guilds/:serverId/reports", requireAuth, requireServerAuth, async (req: any, res)'
);

content = content.replace(
  'app.get("/api/guilds/:serverId/reports-settings", async (req, res)',
  'app.get("/api/guilds/:serverId/reports-settings", requireAuth, requireServerAuth, async (req: any, res)'
);

content = content.replace(
  'app.post("/api/guilds/:serverId/reports-settings", async (req, res)',
  'app.post("/api/guilds/:serverId/reports-settings", requireAuth, requireServerAuth, async (req: any, res)'
);

content = content.replace(
  'app.post(\n    "/api/recommendations/dismiss",\n    requireAuth,',
  'app.post(\n    "/api/recommendations/dismiss",\n    requireAuth, requireServerAuth,'
);
content = content.replace(
  'app.post(\n    "/api/guilds/:serverId/sync_custom_commands",\n    requireAuth,',
  'app.post(\n    "/api/guilds/:serverId/sync_custom_commands",\n    requireAuth, requireServerAuth,'
);
content = content.replace(
  'app.post(\n    "/api/guilds/:serverId/reports/:reportId/resolve",\n    requireAuth,',
  'app.post(\n    "/api/guilds/:serverId/reports/:reportId/resolve",\n    requireAuth, requireServerAuth,'
);

// Process the simple ones:
const simpleRoutes = [
  'app.post("/api/mod-action", requireAuth,',
  'app.post("/api/train", requireAuth,',
  'app.post("/api/rules/add", requireAuth,',
  'app.post("/api/recommendations/add", requireAuth,',
  'app.get("/api/analytics/messages", requireAuth,',
  'app.get("/api/analytics/members", requireAuth,',
  'app.get("/api/analytics/moderation", requireAuth,',
  'app.get("/api/analytics/commands", requireAuth,',
  'app.get("/api/analytics/summary", requireAuth,',
  'app.post("/api/integrations/resolve", requireAuth,'
];

for(const sr of simpleRoutes) {
  content = content.replace(sr, sr.replace('requireAuth', 'requireAuth, requireServerAuth'));
}

fs.writeFileSync('server.ts', content);
