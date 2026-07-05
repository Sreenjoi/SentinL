import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Production Route Security", () => {
  it("should not expose temporary debug/fix API routes", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Ensure these specific routes are fully deleted or not present
    expect(serverCode).not.toContain('app.get("/api/debug-spaghetti"');
    expect(serverCode).not.toContain('app.get("/api/fix-spaghetti"');
    expect(serverCode).not.toContain('app.get("/api/debug-user/:id"');
    expect(serverCode).not.toContain('app.get("/api/test-db"');
    expect(serverCode).not.toContain('app.get("/api/debug_logs"');
  });

  it("should secure the diagnostics route with NODE_ENV checks", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // The diagnostics route still exists but must explicitly block in production
    const diagMatch = serverCode.includes('app.get("/api/diagnostics/server/:serverId"');
    expect(diagMatch).toBe(true);

    // Verify presence of NODE_ENV check inside /api/diagnostics
    // It should check against 'production'
    expect(serverCode).toContain('process.env.NODE_ENV === "production"');
    expect(serverCode).toContain('isSuperAdmin(');
  });
});
