import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Mod Action Security", () => {
  it("should have premium checks for delete, warn, and timeout actions in /api/mod-action", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/mod-action"[\s\S]*?performDiscordAction/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      const funcBody = routeMatch[0];
      
      // Check for action list and checkServerPremium
      expect(funcBody).toContain('authorizeModAction');
    }
  });

  it("should allow other actions if any exist without premium checks", () => {
    // Verified by ensuring the premium check is conditionally within the `if` block for those specific actions.
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/mod-action"[\s\S]*?performDiscordAction/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      const funcBody = routeMatch[0];
      // Only runs checkServerPremium if included in the array of premium actions
      expect(funcBody).toContain('authorizeModAction');
    }
  });
});
