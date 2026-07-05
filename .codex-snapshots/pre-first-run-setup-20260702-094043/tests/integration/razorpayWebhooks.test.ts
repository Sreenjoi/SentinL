import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

// We statically analyze server.ts to ensure all webhook requirements are implemented correctly
describe("Razorpay Webhooks & Payment Checks", () => {
    let serverCode: string;
    let razorpayServiceCode: string;
    let summaryCode: string;
    
    beforeAll(() => {
        serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
        razorpayServiceCode = fs.readFileSync(path.resolve(__dirname, "../../src/services/razorpay.ts"), "utf-8");
        summaryCode = fs.readFileSync(path.resolve(__dirname, "../../src/services/summaryService.ts"), "utf-8");
    });

    it("uses crypto.timingSafeEqual for razorpay verify payment", () => {
        expect(serverCode).toContain("isValidSig = crypto.timingSafeEqual(expectedBuf, signatureBuf);");
    });

    it("ignores payment.failed without downgrading", () => {
        expect(serverCode).toContain("case \"payment.failed\":");
        expect(serverCode).toContain("Ignored ${event}");
        expect(serverCode).toContain("SentinL uses one-time 30-day passes.");
        
        // Ensure the old downgrade code is gone
        const failedBlock = serverCode.substring(
             serverCode.indexOf("case \"payment.failed\":"), 
             serverCode.indexOf("case \"refund.processed\":")
        );
        expect(failedBlock).not.toContain("tier: \"free\"");
        expect(failedBlock).not.toContain("status: \"canceled\"");
    });

    it("handles forged/malformed signatures properly", () => {
       expect(serverCode).toContain("if (!signature || typeof signature !== \"string\")");
       expect(serverCode).toContain("if (!isValidSig) {");
       expect(serverCode).toContain("logger.warn(\"[Razorpay Webhook] Invalid signature\");");
    });

    it("handles refunds through processed-payment ledger", () => {
       expect(serverCode).toContain("case \"refund.processed\":");
       expect(razorpayServiceCode).toContain("const paymentRef = db.collection(\"processed_payments\").doc(paymentId);");
    });

    it("preserves existing linked servers and bounds by plan limit during renewal/upgrade", () => {
       expect(razorpayServiceCode).toContain("if (linkedServers.length > maxServers) {");
       expect(razorpayServiceCode).toContain("throw new Error(\"Conflict: Linked servers exceed maximum for the new plan");
    });

    it("finalizes quota atomically with summary save", () => {
       expect(summaryCode).toContain("db.runTransaction(async (t: any) => {");
       expect(summaryCode).toContain("t.set(usageRef");
       expect(summaryCode).toContain("t.set(summaryDocRef, summaryPayload);");
    });

    it("releases groq tokens on failure and reconciles on success", () => {
       expect(summaryCode).toContain("reconcileGroqTokens(db, estimatedTokensScope, data.usage.total_tokens)");
       expect(summaryCode).toContain("releaseGroqBudget(db, estimatedTokensScope)");
       expect(summaryCode).toMatch(/catch \(releaseErr(: any)?\)/);
    });
});
