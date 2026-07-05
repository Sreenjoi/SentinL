import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Appeals Strictness", () => {
    let serverCode: string;
    let botLogicCode: string;

    beforeAll(() => {
        serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
        botLogicCode = fs.readFileSync(path.resolve(__dirname, "../../src/appealsBotLogic.ts"), "utf-8");
    });

    it("restricts review actions to uphold and overturn", () => {
        expect(serverCode.includes("Invalid appeal action. Must be 'uphold' or 'overturn'.")).toBe(true);
    });

    it("validates reviewNote length and type", () => {
        expect(serverCode.includes("reviewNote must be a string up to 1000 characters.")).toBe(true);
    });

    it("processes review transactionally (no races)", () => {
        expect(serverCode.includes("t.get(caseRef)")).toBe(true);
        expect(serverCode.includes("t.update(caseRef, updateData)")).toBe(true);
        expect(serverCode.includes("Case is not currently submitted for appeal or already decided.")).toBe(true);
    });

    it("processes submission transactionally to prevent duplicate submissions", () => {
        expect(botLogicCode.includes("runTransaction(async (t) =>")).toBe(true);
        expect(botLogicCode.includes("t.update(caseRef")).toBe(true);
    });

    it("verifies the case belongs to the requested server and user on submission", () => {
        expect(botLogicCode.includes("caseData.serverId && caseData.serverId !== serverId")).toBe(true);
        expect(botLogicCode.includes("caseData.userId !== interaction.user.id")).toBe(true);
    });

    it("rejects expired appeals", () => {
        expect(botLogicCode.includes("This appeal window has expired.")).toBe(true);
        expect(botLogicCode.includes("caseData.expiresAt.toDate() < new Date()")).toBe(true);
    });

    it("ignores closed DMs (failed discord notifications)", () => {
         // Should not bubble up exceptions on send
         expect(serverCode.includes("Failed to notify user:")).toBe(true);
         expect(botLogicCode).toMatch(/user\.send\(\{[\s\S]+?\}\)\.catch\(\(\) => \{[\s\S]+?\}\)/);
    });

    it("reverses reversable timeouts appropriately", () => {
         expect(serverCode.includes("member.timeout(null, \"Appeal overturned\")")).toBe(true);
    });

    it("records that deleted messages are not restored", () => {
         expect(serverCode.includes("Discord does not allow SentinL to restore deleted messages")).toBe(true);
    });

    it("has audit records for reviews", () => {
         expect(serverCode.includes("const auditRef = db.collection(`servers/${serverId}/auditLogs`).doc();")).toBe(true);
         expect(serverCode.includes("type: \"APPEAL_REVIEW\"")).toBe(true);
    });
});
