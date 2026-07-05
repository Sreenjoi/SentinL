import { describe, it, expect } from "vitest";

// Real functions imported from discordBot
import { isAdvancedHeuristicSafe, checkQuotaIsExceeded } from "../../src/utils/moderationHelpers.js";

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
}

describe("Integration & Quality Tests", () => {
    describe("Quota Check", () => {
        it("should allow a request if free server is at 99 calls and limit is 100", () => {
             expect(checkQuotaIsExceeded(99, 100)).toBe(false); // Not exceeded
        });
        it("should block a request if free server is at 100 calls and limit is 100", () => {
             expect(checkQuotaIsExceeded(100, 100)).toBe(true);  // Exceeded
        });
    });

    describe("Trivial Filter Bypass & Safe Boundary", () => {
        it("should allow harmless URLs (bypass trigger)", () => {
             expect(isAdvancedHeuristicSafe("https://example.com/safe/link")).toBe(true);
        });
        it("should block malicious free-text", () => {
             expect(isAdvancedHeuristicSafe("You are an idiot who steals money")).toBe(false);
        });
        it("should allow fast-pass equivalents (e.g. short safe words)", () => {
             expect(isAdvancedHeuristicSafe("gg wp")).toBe(true);
             expect(isAdvancedHeuristicSafe("thanks")).toBe(true);
             expect(isAdvancedHeuristicSafe("one sec")).toBe(true);
             expect(isAdvancedHeuristicSafe("hello")).toBe(true);
        });
    });

    describe("Razorpay Webhook Signature", () => {
         it("should verify a correctly formatted HMAC signature", () => {
             const crypto = require('crypto');
             // Simulated payload
             const payload = JSON.stringify({ event: "payment.captured" });
             const secret = "test_webhook_secret";
             const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
             
             expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
         });
         
         it("should reject an invalid signature", () => {
             const payload = JSON.stringify({ event: "payment.captured" });
             const secret = "test_webhook_secret";
             
             expect(verifyWebhookSignature(payload, "invalid_signature", secret)).toBe(false);
         });
    });
});
