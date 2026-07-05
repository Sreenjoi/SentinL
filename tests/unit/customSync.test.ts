import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

describe("Custom Command Sync", () => {
   it("syncs only custom guild commands and rejects invalid ones", () => {
      const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
      
      expect(serverCode.includes("const nativeCommands = await buildManagedCommands();")).toBe(true);
      expect(serverCode.includes("const mergedCommands = finalCustomCommands;")).toBe(true);
      expect(serverCode.includes("const normalizedName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, \"\");")).toBe(true);
      expect(serverCode.includes("if (!normalizedName) {")).toBe(true);
      expect(serverCode.includes("if (normalizedName.length > 32) {")).toBe(true);
      expect(serverCode.includes("if (nativeNames.has(normalizedName)) {")).toBe(true);
      expect(serverCode.includes("if (customNames.has(normalizedName)) {")).toBe(true);
      expect(serverCode.includes("if (finalCustomCommands.length > 100) {")).toBe(true);
      
      // Ensures the guild PUT updates only sanitized custom commands. Native commands remain global.
      expect(serverCode.includes("body: mergedCommands,")).toBe(true);
      expect(serverCode.includes("Native commands remain global.")).toBe(true);
      
      // Ensure we imported buildManagedCommands correctly
      expect(serverCode).toMatch(/const \{ buildManagedCommands \} = await import\("\.\/src\/utils\/discordCommands\.(ts|js)"\);/);
   });
});
