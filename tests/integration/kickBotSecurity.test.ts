import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Kick Bot Security", () => {
  it("should have requireAuth and requireServerAuth middlewares on the kick-bot endpoint", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/kick-bot".*?\)/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      expect(routeMatch[0]).toContain("requireAuth");
      expect(routeMatch[0]).toContain("requireServerAuth");
    }
  });

  it("should enforce using req.user.email instead of req.body.email", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Check that we're deriving email from req.user
    const kickRouteBody = serverCode.match(/app\.post\("\/api\/kick-bot"[\s\S]*?guild\.leave\(\)/);
    if(kickRouteBody) {
        expect(kickRouteBody[0]).toMatch(/const email = \(?req as any\)?\.user\.email;/);
        // We shouldn't be destructuring email from req.body blindly
        expect(kickRouteBody[0]).not.toContain("const { serverId, email } = req.body;");
    }
  });
});
