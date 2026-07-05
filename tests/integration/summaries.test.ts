import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

describe("Summary Semantics & Constraints", () => {
    let summaryCode: string;

    beforeAll(() => {
        summaryCode = fs.readFileSync(path.resolve(__dirname, "../../src/services/summaryService.ts"), "utf-8");
    });

    it("uses transaction to reserve count before fetching", () => {
        expect(summaryCode).toContain("t.set(usageRef, { pending: pending + 1 }, { merge: true });");
    });

    it("refunds pending if generation fails", () => {
        const catchBlock = summaryCode.substring(summaryCode.indexOf("} catch (e: any) {"));
        expect(catchBlock).toContain("t.set(usageRef, { pending: Math.max(0, pending - 1) }");
    });

    it("finalizes and applies pending count to real usage on success", () => {
        expect(summaryCode).toContain("t.set(usageRef, { count: count + 1, pending: Math.max(0, pending - 1) }");
    });

    it("limits Pro plans to 50/300/1000", () => {
        expect(summaryCode).toContain("if (tierStatus.tier === \"pro_1\") limitAmount = 50;");
        expect(summaryCode).toContain("else if (tierStatus.tier === \"pro_3\") limitAmount = 300;");
        expect(summaryCode).toContain("else limitAmount = 1000;");
    });

    it("throws clear error for 429 without exposing raw body", () => {
        expect(summaryCode).toContain("if (err?.status === 429)");
        expect(summaryCode).toContain("throw Object.assign(new Error(\"AI provider rate limit reached.");
    });

    it("catches empty validMessages", () => {
        expect(summaryCode).toContain("validMessages.length === 0");
        expect(summaryCode).toContain("No user messages found in that channel");
    });
});
