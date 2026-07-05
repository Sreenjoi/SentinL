import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "coverage",
  "archive",
]);

const EXCLUDED_PATHS = new Set([
  "scripts/archive"
]);

// Common binary extensions to avoid reading as UTF-8
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".ttf", ".woff", ".woff2", ".eot", ".pdf", ".zip", ".mp4", ".webm", ".mp3", ".wav"
]);

function scanForConflictMarkers(dir: string, baseDir: string, results: string[]) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    if (EXCLUDED_DIRS.has(file) || EXCLUDED_PATHS.has(relPath)) {
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanForConflictMarkers(fullPath, baseDir, results);
    } else if (stat.isFile()) {
      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("<<<<<<< ") || line.startsWith(">>>>>>> ")) {
             results.push(`${relPath}:${i + 1}: ${line}`);
          }
        }
      } catch (err) {
        // Ignore read errors for individual files
      }
    }
  }
}

describe("Git Merge Conflict Markers", () => {
  it("should not contain unresolved conflict markers in source files", () => {
    const results: string[] = [];
    scanForConflictMarkers(process.cwd(), process.cwd(), results);
    
    if (results.length > 0) {
      console.error("Unresolved Git conflict markers found:\n" + results.join("\n"));
    }
    
    expect(results).toEqual([]);
  });
});
