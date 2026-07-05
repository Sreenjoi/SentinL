import { test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

test('Root-level scripts must not mutate source code', () => {
  const rootDir = process.cwd();
  
  const protectedTargets = [
    'server.ts',
    'package.json',
    'package-lock.json',
    'src',
    'app',
    'vite.config.ts'
  ];

  const writePatterns = [
    /fs\.writeFile/,
    /fs\.appendFile/,
    /fs\.promises\.writeFile/,
    /writeFileSync/,
    /appendFileSync/,
    /fse?\.write/,
    />\s*server\.ts/,
    />\s*package\.json/
  ];

  const files = fs.readdirSync(rootDir);
  const scriptExtensions = ['.js', '.cjs', '.mjs', '.ts'];

  const rootScripts = files.filter(f => {
    const ext = path.extname(f);
    const stat = fs.statSync(path.join(rootDir, f));
    return stat.isFile() && scriptExtensions.includes(ext) && f !== 'server.ts' && f !== 'vite.config.ts';
  });

  const violations: string[] = [];

  for (const script of rootScripts) {
    const content = fs.readFileSync(path.join(rootDir, script), 'utf-8');
    
    // Ignore this specific file if we were to test it in the root
    if (script === 'smoke_test_mutations.ts' || script === 'smoke_test.ts') continue;
    
    const hasWrite = writePatterns.some(p => p.test(content));
    if (hasWrite) {
      for (const target of protectedTargets) {
        if (content.includes(target)) {
          violations.push(`${script} appears to write to ${target}`);
        }
      }
    }
  }

  expect(violations, 'Non-archived scripts must not mutate source code').toEqual([]);
});
