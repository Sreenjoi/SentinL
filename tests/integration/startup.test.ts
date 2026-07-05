import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'child_process';

describe('Production Startup APP_URL check', () => {
  it('fails fast when APP_URL is missing', () => {
    try {
      const env = { ...process.env, NODE_ENV: 'production', DISCORD_TOKEN: 'fake', DISCORD_CLIENT_ID: 'fake', DISCORD_CLIENT_SECRET: 'fake' };
      delete env.APP_URL;
      execSync('npx tsx server.ts', {
        env,
        stdio: 'pipe'
      });
      expect.fail('Should have exited with error');
    } catch (e: any) {
      expect(e.status).toBe(1);
      expect(e.stderr.toString()).toContain('[Startup] ERROR: APP_URL environment variable is missing or invalid in production');
    }
  }, 15000);

  it('fails fast when APP_URL is invalid', () => {
    try {
      execSync('npx tsx server.ts', {
        env: { ...process.env, NODE_ENV: 'production', APP_URL: 'http://[::1]:80:80', DISCORD_TOKEN: 'fake', DISCORD_CLIENT_ID: 'fake', DISCORD_CLIENT_SECRET: 'fake' },
        stdio: 'pipe'
      });
      expect.fail('Should have exited with error');
    } catch (e: any) {
      expect(e.status).toBe(1);
      expect(e.stderr.toString()).toContain('[Startup] ERROR: APP_URL environment variable is missing or invalid in production');
    }
  }, 15000);

  it('bypasses check when ALLOW_MISSING_APP_URL is true', () => {
    try {
      // Need a timeout to kill the server if it successfully starts listening,
      // but if it fails fast it will throw.
      execSync('npx tsx server.ts', {
        env: { ...process.env, NODE_ENV: 'production', APP_URL: '', ALLOW_MISSING_APP_URL: 'true' },
        timeout: 10000,
        stdio: 'pipe'
      });
    } catch (e: any) {
      // It might throw due to timeout, which means it started successfully and didn't process.exit(1)
      expect(e.code).toBe('ETIMEDOUT');
      expect(e.stderr.toString()).not.toContain('APP_URL environment variable is missing or invalid in production');
    }
  }, 15000);

  it('bypasses check when a valid APP_URL is provided', () => {
    try {
      execSync('npx tsx server.ts', {
        env: { ...process.env, NODE_ENV: 'production', APP_URL: 'https://test.app', DISCORD_TOKEN: 'fake', DISCORD_CLIENT_ID: 'fake', DISCORD_CLIENT_SECRET: 'fake' },
        timeout: 10000,
        stdio: 'pipe'
      });
    } catch (e: any) {
      expect(e.code).toBe('ETIMEDOUT');
      expect(e.stderr.toString()).not.toContain('APP_URL environment variable is missing or invalid in production');
    }
  }, 15000);
});
