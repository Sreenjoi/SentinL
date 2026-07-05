import { vi, afterAll, afterEach } from 'vitest';
import cron from 'node-cron';

// Prevent tests from hanging when discordBot.ts is imported by mocking long-lived timers
const realSetInterval = global.setInterval;
const realSetTimeout = global.setTimeout;
const realFetch = global.fetch;

vi.spyOn(global, 'setInterval').mockImplementation((cb: any, ms?: number, ...args: any[]) => {
    // Only block the long background polling intervals from the discord bot / server
    if (ms !== undefined && ms >= 5000) {
        return {} as any;
    }
    return realSetInterval(cb, ms, ...args);
});

vi.spyOn(global, 'setTimeout').mockImplementation((cb: any, ms?: number, ...args: any[]) => {
    // Keep short test waits working, but block long background recovery / retry timers.
    if (ms !== undefined && ms >= 5000) {
        return {} as any;
    }
    return realSetTimeout(cb, ms, ...args);
});

vi.spyOn(cron, 'schedule').mockImplementation(() => { 
    return { start: vi.fn(), stop: vi.fn() } as any; 
});

afterEach(() => {
    vi.clearAllTimers();
    if (global.fetch && (global.fetch as any).mockRestore) {
        (global.fetch as any).mockRestore();
    }
    global.fetch = realFetch;
    // Clean up discord bot globals if they exist
    if ((global as any).__botClientGhost) {
        if ((global as any).__botClientGhost.removeAllListeners) {
            (global as any).__botClientGhost.removeAllListeners();
        }
        if ((global as any).__botClientGhost.destroy) {
            (global as any).__botClientGhost.destroy();
        }
        delete (global as any).__botClientGhost;
    }
});

afterAll(() => {
    vi.restoreAllMocks();
});
