import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Discord Bot Integrity', () => {
  it('should have a discordBot.ts file with more than 1000 characters', () => {
    const filePath = path.join(process.cwd(), 'src', 'discordBot.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content.length).toBeGreaterThan(1000);
  });

  it('should export required utilities and functions', async () => {
    const discordBot = await import('../../src/discordBot');
    
    expect(typeof discordBot.startDiscordBot).toBe('function');
    expect(typeof discordBot.performDiscordAction).toBe('function');
    expect(typeof discordBot.isAdvancedHeuristicSafe).toBe('function');
    expect(typeof discordBot.containsHighRiskSignal).toBe('function');
    
    // Also verify the global hook is accessible (it might be set later when startDiscordBot is called, so we can't test its value immediately, but we can check if we want)
    // We will just check the exports as required.
  });
});
