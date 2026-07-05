import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("OAuth Security /api/auth/discord/url", () => {
  it("should secure the /api/auth/discord/url route with requireAuth", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.get\("\/api\/auth\/discord\/url".*?\)/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      expect(routeMatch[0]).toContain("requireAuth");
    }
  });

  it("should extract email from req.user, not req.query", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    // Find the definition of email inside the discord URL route
    const startIdx = serverCode.indexOf('app.get("/api/auth/discord/url"');
    const endIdx = serverCode.indexOf('app.get(', startIdx + 1);
    const routeBlock = serverCode.substring(startIdx, endIdx !== -1 ? endIdx : serverCode.length);
    
    expect(routeBlock).toContain("const email = req.user.email;");
    expect(routeBlock).not.toContain("req.query.email");
  });

  it("should pass the auth token in DiscordConnect component", () => {
    const discordConnectCode = fs.readFileSync(path.resolve(__dirname, "../../src/components/DiscordConnect.tsx"), "utf-8");
    
    const handleConnectBlock = discordConnectCode.substring(
      discordConnectCode.indexOf("const handleConnect ="),
      discordConnectCode.indexOf("if (!contentType") 
    );

    expect(handleConnectBlock).toContain("Authorization");
    expect(handleConnectBlock).toContain("Bearer ${token}");
    expect(handleConnectBlock).not.toContain("uid=${");
    expect(handleConnectBlock).not.toContain("email=${");
  });
});
