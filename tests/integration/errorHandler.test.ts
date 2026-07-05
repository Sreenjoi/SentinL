import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Global API Error Handler Security", () => {
  it("should redact error details in production", () => {
    const errorHandlerCode = fs.readFileSync(path.resolve(__dirname, "../../src/utils/errorHandler.ts"), "utf-8");
    
    // Check the file directly
    expect(errorHandlerCode).toContain('process.env.NODE_ENV === "production"');
    
    // It should structure the response correctly based on the environment
    expect(errorHandlerCode).toMatch(/if\s*\(isProdMode\)\s*\{\s*(return\s+)?res\.status\(500\)\.json\(\{ error: "Internal server error" \}\);\s*\}/);
    expect(errorHandlerCode).toMatch(/else\s*\{\s*(return\s+)?res\.status\(500\)\.json\(\{ error: "Internal server error", details: err\.message \}\);\s*\}/);
  });
});
