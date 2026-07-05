import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Activation Bug Fixes", () => {
    it("Settings and DiscordConnect do not contain escaped template variables for activation fetch", () => {
         const settingsPath = path.join(process.cwd(), "src/components/BotSettings.tsx");
         const discordConnectPath = path.join(process.cwd(), "src/components/DiscordConnect.tsx");
         
         const settingsCode = fs.readFileSync(settingsPath, "utf-8");
         const discordConnectCode = fs.readFileSync(discordConnectPath, "utf-8");

         // Should NOT contain \${selectedServerId} or \${token}
         expect(settingsCode).not.toMatch(/fetch\(`\/api\/guilds\/\\\${selectedServerId}\/activation`/);
         expect(settingsCode).not.toMatch(/Bearer \\\${token}/);
         
         expect(discordConnectCode).not.toMatch(/fetch\(`\/api\/guilds\/\\\${id}\/activation`/);
         expect(discordConnectCode).not.toMatch(/Bearer \\\${token}/);
         
         // Should contain the correct ones
         expect(settingsCode).toContain("`/api/guilds/${selectedServerId}/activation`");
         expect(settingsCode).toContain("Bearer ${token}");

         // Failed activation check
         expect(settingsCode).toContain("if (!res.ok)");
         expect(settingsCode).toContain("setOptimisticActive(");
         
         expect(discordConnectCode).toContain("if (!res.ok)");
         expect(discordConnectCode).toContain("await res.json()");
    });
});

describe("Discord Bot Inactive Suppression", () => {
    it("MessageCreate ignores messages when server active is false", () => {
         const discordBotPath = path.join(process.cwd(), "src/discordBot.ts");
         const code = fs.readFileSync(discordBotPath, "utf-8");
         
         // Validate we check active state at the top before heuristics
         expect(code).toMatch(/if \(!serverSnap\.exists \|\| !serverData\?\.active\) \{\s*\/\/ Ignored msg from inactive server, intentionally suppressing heavy logs/);
    });
});
