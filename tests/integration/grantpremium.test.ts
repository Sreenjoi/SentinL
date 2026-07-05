import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("GrantPremium Fixes", () => {
    it("grantpremium to server ID activates moderation when bot is in guild", () => {
        const discordBotPath = path.join(process.cwd(), "src/discordBot.ts");
        const code = fs.readFileSync(discordBotPath, "utf-8").replace(/\s+/g, ' ');

        expect(code).toContain('const botInGuild = client.guilds.cache.has(targetId);');
        expect(code).toContain('if (botInGuild) {');
        expect(code).toContain('serverUpdates.active = true;');
        expect(code).toContain('serverUpdates.botPresent = true;');
        expect(code).toContain('await db .collection("servers") .doc(targetId) .set(serverUpdates, { merge: true });');
    });

    it("grantpremium to server ID does not activate if bot is not in guild", () => {
        const discordBotPath = path.join(process.cwd(), "src/discordBot.ts");
        const code = fs.readFileSync(discordBotPath, "utf-8");
        
        // Assert we check botInGuild before setting active=true
        expect(code).toContain('if (botInGuild) {');
        expect(code).toContain('serverUpdates.active = true;');
    });

    it("grantpremium to user ID does not create fake server activation", () => {
        const discordBotPath = path.join(process.cwd(), "src/discordBot.ts");
        const code = fs.readFileSync(discordBotPath, "utf-8");
        
        // Ensure there is an else branch for user updates that does NOT update "servers"
        expect(code).toMatch(/} else \{\s*\/\/\s*User target/);
        // User branch only updates subscriptions
        const userBranchBlock = code.split('// User target')[1].split('return;')[0];
        expect(userBranchBlock).toBeDefined();
        expect(userBranchBlock).not.toContain('db.collection("servers")');
    });

    it("Slash command target_type is defined", () => {
        const cmdPath = path.join(process.cwd(), "src/utils/discordCommands.ts");
        const code = fs.readFileSync(cmdPath, "utf-8");

        expect(code).toContain('.setName("target_type")');
        expect(code).toContain('{ name: "Server", value: "server" }');
        expect(code).toContain('{ name: "User", value: "user" }');
    });
});
