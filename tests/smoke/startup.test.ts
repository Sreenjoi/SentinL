import { describe, it, expect } from 'vitest';
import { spawn, execSync, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';

// Helper to kill a process tree
async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.killed || child.exitCode !== null || child.signalCode !== null) return;

  const waitForExit = new Promise<void>(resolve => {
    child.on('exit', () => resolve());
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });

  try {
    if (os.platform() === 'win32') {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch (e) {
    try {
      child.kill('SIGKILL');
    } catch (e2) {}
  }

  await waitForExit;
}

function sanitizeEnv(envOverride: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...envOverride };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    } else {
      env[key] = String(env[key]);
    }
  }
  return env;
}

function spawnServer(envOverride: Record<string, string | undefined>): { child: ChildProcess, getOutput: () => string } {
  const isWin = os.platform() === 'win32';
  
  const tsxPath = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  
  const child = spawn(process.execPath, [tsxPath, 'server.ts'], {
    cwd: process.cwd(),
    env: sanitizeEnv(envOverride),
    detached: !isWin, // Detach on Unix to use process group id
    stdio: 'pipe',
  });

  let output = '';
  child.stdout?.on('data', (d) => { output += d.toString(); });
  child.stderr?.on('data', (d) => { output += d.toString(); });

  return { child, getOutput: () => output };
}

describe('Startup Smoke Test', () => {
  it('should respect PORT environment variable', async () => {
    const { child, getOutput } = spawnServer({
      PORT: '3005',
      NODE_ENV: 'production',
      STRICT_STARTUP_VALIDATION: 'false',
      DISCORD_BOT_TOKEN: '',
      GROQ_API_KEY: '',
      FIREBASE_PROJECT_ID: ''
    });

    try {
      let up = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (child.exitCode !== null) {
          throw new Error(`Server exited prematurely with code ${child.exitCode}. Output:\n${getOutput()}`);
        }
        try {
          const res = await fetch('http://localhost:3005/api/health');
          if (res.ok) {
            up = true;
            break;
          }
        } catch (e) {
          // Retry
        }
      }

      if (!up) {
        console.error(`[Smoke Test 1] Server did not respond on port 3005. Output:\n${getOutput()}`);
        throw new Error(`Server did not respond on port 3005. Output:\n${getOutput()}`);
      }
      expect(up).toBe(true);
    } finally {
      await killProcessTree(child);
    }
  }, 20000);

  it('should not crash when STRICT_STARTUP_VALIDATION is false and vars are missing', async () => {
    const { child, getOutput } = spawnServer({
      PORT: '3006',
      NODE_ENV: 'production',
      STRICT_STARTUP_VALIDATION: 'false',
      DISCORD_BOT_TOKEN: '',
      GROQ_API_KEY: '',
      FIREBASE_PROJECT_ID: ''
    });

    try {
      let up = false;
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (child.exitCode !== null) {
          throw new Error(`Server exited prematurely with code ${child.exitCode}. Output:\n${getOutput()}`);
        }
        try {
          const res = await fetch('http://localhost:3006/api/health');
          if (res.ok) {
            up = true;
            break;
          }
        } catch (e) {
          // Retry
        }
      }

      if (!up) {
        console.error(`[Smoke Test 2] Server did not boot up in time. Output:\n${getOutput()}`);
        throw new Error(`Server did not boot up in time. Output:\n${getOutput()}`);
      }

      // Check if process is still running
      if (child.exitCode !== null) {
        throw new Error(`Process exited with code ${child.exitCode}. Output:\n${getOutput()}`);
      }
      expect(up).toBe(true);
    } finally {
      await killProcessTree(child);
    }
  }, 20000);

  it('should crash when STRICT_STARTUP_VALIDATION is true and vars are missing', async () => {
    const { child, getOutput } = spawnServer({
      PORT: '3007',
      NODE_ENV: 'production',
      STRICT_STARTUP_VALIDATION: 'true',
      DISCORD_BOT_TOKEN: '',
      GROQ_API_KEY: '',
      FIREBASE_PROJECT_ID: ''
    });

    try {
      const exitPromise = new Promise<number | null>(resolve => {
        if (child.exitCode !== null) {
          resolve(child.exitCode);
          return;
        }
        child.on('exit', (code) => resolve(code));
        child.on('error', () => resolve(null));
      });

      const timeoutPromise = new Promise<number | null>(resolve => {
        setTimeout(() => resolve(-1), 15000); // 15s wait for crash
      });

      const exitCode = await Promise.race([exitPromise, timeoutPromise]);

      if (exitCode === -1) {
        console.error(`[Smoke Test 3] Server did not crash within 15s. Output:\n${getOutput()}`);
        throw new Error(`Server did not crash within 15s. Output:\n${getOutput()}`);
      }
      
      expect(exitCode).not.toBe(0);
      expect(exitCode).not.toBeNull();
    } finally {
      await killProcessTree(child);
    }
  }, 20000);
});
