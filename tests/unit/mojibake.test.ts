import { describe, it } from "vitest";
import fs from "fs";
import path from "path";

// Utility to recursively find all files in a directory
function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

const mojibakePatterns = [
  /\u00E2\u009C/g,      // check mark double encoded
  /\u00F0\u009F/g,      // party popper double encoded
  /\u00C3\u00B1/g,      // ñ double encoded
  /\u00E0\u00A4/g,      // Hindi leading bytes double encoded
  /\u00E6\u0097/g,      // Japanese leading bytes double encoded
  /\u00E2\u0080/g,      // em dash double encoded
  /\u00C3/g,             // generic A-tilde
  /\u00C2/g,             // generic A-circumflex
  /\u00EF\u00B8/g,      // emoji presentation double encoded
  /\u00ED\u0095/g,      // Korean leading bytes double encoded
  /\u00D8/g              // O-stroke
];

describe("Mojibake Test", () => {
  it("should not contain mojibake patterns in src files", () => {
    // Assuming this test runs in the root via vitest
    const srcDir = path.resolve(process.cwd(), "src");
    if (!fs.existsSync(srcDir)) return;

    const srcFiles = getAllFiles(srcDir);
    
    srcFiles.forEach(file => {
      // Exclude binary files or non-text files if necessary
      if (!file.match(/\.(ts|tsx|js|jsx|json)$/)) return;
      
      const content = fs.readFileSync(file, 'utf8');
      
      mojibakePatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match) {
          throw new Error(`Found mojibake pattern ${pattern} in file ${file}`);
        }
      });
    });
  });

  it("should not contain mojibake patterns in server.ts", () => {
    const serverFile = path.resolve(process.cwd(), "server.ts");
    if (fs.existsSync(serverFile)) {
      const content = fs.readFileSync(serverFile, 'utf8');
      mojibakePatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match) {
          throw new Error(`Found mojibake pattern ${pattern} in file ${serverFile}`);
        }
      });
    }
  });

  it("should not contain mojibake patterns in docs files", () => {
    const docsDir = path.resolve(process.cwd(), "docs");
    if (!fs.existsSync(docsDir)) return;

    const docsFiles = getAllFiles(docsDir);
    
    docsFiles.forEach(file => {
      if (!file.match(/\.(md|mdx|txt)$/)) return;
      
      const content = fs.readFileSync(file, 'utf8');
      
      mojibakePatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match) {
          throw new Error(`Found mojibake pattern ${pattern} in file ${file}`);
        }
      });
    });
  });
});
