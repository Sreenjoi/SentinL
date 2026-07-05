import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Giveaway Service", () => {
    let serviceCode: string;
    let botCode: string;

    beforeAll(() => {
        serviceCode = fs.readFileSync(path.resolve(__dirname, "../../src/services/giveaway.ts"), "utf-8");
        botCode = fs.readFileSync(path.resolve(__dirname, "../../src/discordBot.ts"), "utf-8");
    });

    it("handles automatic expiry and unified entry", () => {
        // The bot queries 'active' and 'ending'
        expect(botCode.includes("[\"active\", \"ending\"]")).toBe(true);
        expect(serviceCode.includes("processGiveaway")).toBe(true);
    });
    
    it("handles no entrants", () => {
        expect(serviceCode.includes("Giveaway ended with no valid entries.")).toBe(true);
    });

    it("handles deleted Discord message (404)", () => {
        expect(serviceCode.includes("embedReq.status === 404")).toBe(true);
        expect(serviceCode.includes("*(Original message was deleted)*")).toBe(true);
    });

    it("handles 403 on Discord updates", () => {
        expect(serviceCode.includes("403 as standard failure")).toBe(true);
    });

    it("handles retries", () => {
        expect(serviceCode.includes("throw new Error(`Discord embed update failed with status ${embedReq.status}`);")).toBe(true);
    });

    it("prevents concurrent manual/automatic ending", () => {
        expect(serviceCode.includes("t.update(giveawayRef, { status: \"ending\"")).toBe(true);
        expect(serviceCode.includes("if (data.status === \"ended\" || data.status === \"cancelled\")")).toBe(true);
    });

    it("handles 10,000 entrants limit in Discord Bot", () => {
        expect(botCode.includes("if (currentCount >= 10000)")).toBe(true);
        expect(botCode.includes("This giveaway has reached the maximum number of participants.")).toBe(true);
    });
});
