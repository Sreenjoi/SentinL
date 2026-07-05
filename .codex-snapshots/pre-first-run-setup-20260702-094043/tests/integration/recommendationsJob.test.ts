import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Recommendations Job Cost Controls", () => {
  it("should conditionalize scheduling the job on ENABLE_RECOMMENDATIONS_JOB === 'true'", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Specifically verify it's looking at ENABLE_RECOMMENDATIONS_JOB for both setInterval and setTimeout 
    expect(serverCode).toContain('process.env.ENABLE_RECOMMENDATIONS_JOB === "true"');
    
    // Check that setInterval for recommendations is inside the 'true' check block
    const regex = /if\s*\(\s*process\.env\.ENABLE_RECOMMENDATIONS_JOB\s*===\s*["']true["']\s*\)\s*\{[\s\S]*?setInterval\(\s*\(\)\s*=>\s*\{[\s\S]*?generateServerRecommendations/;
    const conditionalSetInterval = regex.test(serverCode);
    expect(conditionalSetInterval).toBe(true);
  });

  it("should have ENABLE_RECOMMENDATIONS_JOB='false' in .env.example", () => {
    const envCode = fs.readFileSync(path.resolve(__dirname, "../../.env.example"), "utf-8");
    expect(envCode).toContain('ENABLE_RECOMMENDATIONS_JOB="false"');
  });

  it("should keep DEFAULT_RECOMMENDATIONS_BATCH_SIZE as 5 to limit queries", () => {
    const jobCode = fs.readFileSync(path.resolve(__dirname, "../../src/jobs/recommendations.ts"), "utf-8");
    expect(jobCode).toContain('parseInt(process.env.RECOMMENDATIONS_BATCH_SIZE || "5", 10)');
  });

  it("should use separate recommendations AI health state to not affect moderation", () => {
    const jobCode = fs.readFileSync(path.resolve(__dirname, "../../src/jobs/recommendations.ts"), "utf-8");
    expect(jobCode).toContain('db.collection("system_health").doc("recommendations_ai")');
    expect(jobCode).not.toContain('db.collection("system_health").doc("groq")');
  });
});
