import { expect, test, describe } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Config File Guards', () => {
  test('tests cannot delete config files', () => {
    const protectedConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    expect(() => {
      fs.unlinkSync(protectedConfigPath);
    }).toThrow(/Blocked destructive test filesystem operation/);

    expect(() => {
      fs.rmSync(protectedConfigPath);
    }).toThrow(/Blocked destructive test filesystem operation/);
  });

  test('tests cannot overwrite config files', () => {
    const protectedConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    expect(() => {
      fs.writeFileSync(protectedConfigPath, '{}');
    }).toThrow(/Blocked destructive test filesystem operation/);
  });
});
