import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Tab Navigation Hash Fixes", () => {
    it("Components listen to 'hashchange' and use 'replaceState'", () => {
         const components = [
             "BotSettings.tsx",
             "ContentModeration.tsx",
             "AdvancedAnalytics.tsx",
             "ReportsManager.tsx",
             "LevelingManager.tsx",
             "CommandPalette.tsx"
         ];

         for (const comp of components) {
              const compPath = path.join(process.cwd(), "src/components", comp);
              if (fs.existsSync(compPath)) {
                  const code = fs.readFileSync(compPath, "utf-8");
                  
                  if (comp === "CommandPalette.tsx") {
                       // Command palette should smooth scroll
                       expect(code).toContain("window.scrollTo({ top: 0, behavior: \"smooth\" })");
                  } else {
                       // Component should have hash change listener
                       expect(code).toContain('addEventListener("hashchange"');
                       expect(code).toContain('window.history.replaceState(');
                       // The useState initializer should have `window.location.hash` or fallback
                       expect(code).toContain('window.location.hash');
                  }
              }
         }
    });
});
