import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Discord Command Registration Security", () => {
  it("should be a POST route", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/register-commands"/);
    expect(routeMatch).toBeTruthy();
    
    // Should use mutation limiter
    const fullRouteMatch = serverCode.match(/app\.post\("\/api\/register-commands", requireAuth, mutationLimiter/);
    expect(fullRouteMatch).toBeTruthy();
  });

  it("should prevent non-superadmin from global sync", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/register-commands"[\s\S]*?logger\.info\([^)]*Registration process complete/);
    expect(routeMatch).toBeTruthy();
    
    if (routeMatch) {
      const funcBody = routeMatch[0];
      
      // Global logic shouldn't allow serverId to be empty for non-superadmin
      expect(funcBody).toMatch(/if \(!isAuth\) \{\s*return res\.status\(403\).json\(\{ error: "Forbidden: Not authorized for this server" \}\);\s*\}/);
      expect(funcBody).toMatch(/if \(!\(await isSuperAdmin\(\(?req as any\)?\.user\?\.uid\)\)\) \{\s*return res\.status\(403\).json\(\{ error: "Forbidden" \}\);\s*\}/);

      // Verify serverId drives guild specific command update
      expect(funcBody).toMatch(/serverId\s*\?\s*Routes\.applicationGuildCommands\(clientId,\s*serverId\)\s*:\s*Routes\.applicationCommands\(clientId\)/);
    }
  });
});
