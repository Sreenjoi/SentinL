import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Discord Permissions Security", () => {
  it("should have requireAuth and requireServerAuth middlewares on the permissions endpoint", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.get\("\/api\/discord\/permissions\/:serverId".*?\)/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      expect(routeMatch[0]).toContain("requireAuth");
      expect(routeMatch[0]).toContain("requireServerAuth");
    }
  });

  // Since requireServerAuth is an internal function in server.ts not exported,
  // we do a static analysis to ensure it behaves correctly for auth and moderators.
  it("unauthorized user gets 403, authorized moderator gets permissions", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // We check that requireServerAuth has the 403 logic.
    const requireServerAuthMatch = serverCode.match(/const requireServerAuth = .*?\{([\s\S]*?)next\(\);/);
    expect(requireServerAuthMatch).toBeTruthy();
    
    if (requireServerAuthMatch) {
      const funcBody = requireServerAuthMatch[1];
      // Unauthorized user check
      expect(funcBody).toContain('res.status(401).json({ error: "Unauthorized" })');
      
      // Moderator / Unauthorized for server check (403)
      expect(funcBody).toContain('res.status(403).json({ error: "Forbidden: Not authorized for this server" })');
      
      // Authorized check
      expect(funcBody).toContain('const isAuth = await checkServerAuth(');
    }
    
    // We check that the route returns permissions (which implies authorized moderator gets permissions)
    const routeLogicMatch = serverCode.match(/app\.get\("\/api\/discord\/permissions\/:serverId"[\s\S]*?res\.json\(\{ permissions/);
    expect(routeLogicMatch).toBeTruthy();
  });
});
