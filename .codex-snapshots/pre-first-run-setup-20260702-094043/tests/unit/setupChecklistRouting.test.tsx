/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SetupChecklist Routing Integration', () => {
  it('verifies all internal checklist links map to active app routes or anchor elements', () => {
    const checklistSrc = fs.readFileSync(path.resolve(__dirname, '../../src/components/SetupChecklist.tsx'), 'utf-8');
    const settingsSrc = fs.readFileSync(path.resolve(__dirname, '../../src/components/BotSettings.tsx'), 'utf-8');
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../../src/App.tsx'), 'utf-8');
    
    // Check required routes
    expect(checklistSrc.includes("to: '/connect'")).toBe(true);
    expect(checklistSrc.includes("to: '/settings#general/setup-claim-server'")).toBe(true);
    expect(checklistSrc.includes("to: '/settings#general/setup-activate-bot'")).toBe(true);
    
    expect(appSrc.includes('path="/connect"')).toBe(true);
    expect(settingsSrc.includes('id="setup-claim-server"')).toBe(true);
    expect(settingsSrc.includes('id="setup-activate-bot"')).toBe(true);
    expect(settingsSrc.includes('id="setup-log-channel"')).toBe(true);
  });
});
