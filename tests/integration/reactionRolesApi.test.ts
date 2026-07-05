import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Reaction Roles Hardening", () => {
    let serverCode: string;
    let rolesManagerCode: string;

    beforeAll(() => {
        serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
        rolesManagerCode = fs.readFileSync(path.resolve(__dirname, "../../src/components/RolesManager.tsx"), "utf-8");
    });

    it("verifies mappings length 1 to 5", () => {
        expect(serverCode).toContain("mappings.length > 5");
    });

    it("verifies discord title and label limits", () => {
        expect(serverCode).toContain("title.length > 256");
        expect(serverCode).toContain("m.label.length > 80");
        expect(serverCode).toContain("Label must be under 80 characters");
    });

    it("prevents duplicate roles and checks highest role", () => {
        expect(serverCode).toContain("Duplicate role IDs are not allowed");
        expect(serverCode).toContain("me.roles.highest.comparePositionTo(role) <= 0");
    });

    it("ensures creation uses transaction", () => {
        expect(serverCode).toContain("t.set(serverDocRef, { reactionRoles: reactionRolesList }, { merge: true })");
    });

    it("ensures deletion uses transaction", () => {
        const delCode = serverCode.substring(serverCode.indexOf("app.delete(\"/api/guilds/:serverId/reaction-roles/:panelId\""));
        expect(delCode).toContain("await db.runTransaction(async (t: any)");
    });

    it("ensures RolesManager save does not directly write reactionRoles", () => {
        const rrMatch = rolesManagerCode.match(/reactionRoles:\s*serverSettings\.reactionRoles/);
        expect(rrMatch).toBeNull();
    });
});
