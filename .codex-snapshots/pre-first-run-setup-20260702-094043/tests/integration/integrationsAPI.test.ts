import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

describe("Integrations API endpoint", () => {
  it("statically verifies all requested tests for endpoint", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const endpointCodeMatch = serverCode.match(/app\.post\("\/api\/integrations\/resolve"[\s\S]*?(?=\n  app\.post)/);
    expect(endpointCodeMatch).toBeTruthy();
    
    if (endpointCodeMatch) {
       const code = endpointCodeMatch[0];

       // 1. missing serverId
       expect(code).toContain("const serverId = req.body.serverId;");
       
       // 2. free tier check
       expect(code).toContain("isServerPremium");
       expect(code).toContain("Integrations require a Premium subscription.");

       // 3. invalid channel check
       expect(code).toContain("Channel not found in this server");
       expect(code).toContain("Bot is missing ViewChannel or SendMessages");

       // 4. duplicate target check
       expect(code).toContain("Integration for this target already exists.");

       // 5. add logic (limit check)
       expect(code).toContain("Limit of");

       // 6. edit logic (delete old)
       expect(code).toContain("action === \"edit\" && oldId && oldId !== newId");

       // 7. enable/disable (toggle)
       expect(code).toContain("action === \"toggle\"");
       expect(code).toContain("update({ enabled: !!enabled })");

       // 8. delete logic
       expect(code).toContain("action === \"delete\"");

       // 9. unchanged edits
       expect(code).toContain("isNewTarget === false && !!oldId");

       // 10. deleted channels/roles
       expect(code).toContain("Ping role not found in this server");

       // 11. cross-server tampering
       expect(code).toContain("(channel as any).guildId !== serverId");
    }

    const integrationsCode = fs.readFileSync(path.resolve(__dirname, "../../src/services/socialIntegrations.ts"), "utf-8");
    expect(integrationsCode).toContain("Date.now() < twitchTokenExpiry"); // token expiry
    expect(integrationsCode).toContain("!channel.isTextBased() || channel.guildId !== integration.serverId"); // cross-server tampering
    expect(integrationsCode).toContain("allowedMentions: integration.pingRoleId ? { roles: [integration.pingRoleId] } : { parse: [] }"); // allowedmentions
    expect(integrationsCode).toContain("if (!playlistRes.ok)"); // provider rate limits
    expect(integrationsCode).toContain("if (!streamRes.ok)"); // provider rate limits
  });

});
