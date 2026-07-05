import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Firebase Init Logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  
  it('handles missing Firebase config gracefully by setting firebaseReady to false', async () => {
    // Set invalid API key so it throws even if fallback config exists
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'invalid-key-not-starting-with-aiza');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', '');
    
    (global as any).__AI_STUDIO_PREVIEW__ = true;
    (global as any).__APPLET_CONFIG__ = {};
    
    const firebaseModule = await import('../../src/firebase');
    
    expect(firebaseModule.firebaseReady).toBe(false);
    expect(firebaseModule.firebaseInitError).toBeInstanceOf(Error);
    expect(firebaseModule.firebaseInitError?.message).toMatch(/valid Firebase API key/i);
  });
  
  it('falls back to valid config when env appId is invalid', async () => {
    // Set valid API key to pass the first check
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'AIzaSyD4iiHGpSH0uiPFJGOIqPfcAzjJADBxOQc');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'test-project');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN', 'test-project.firebaseapp.com');
    // Set INVALID app ID 
    vi.stubEnv('VITE_FIREBASE_APP_ID', 'invalid-app-id');
    
    // Mirror the Vite define fallback that preview/local builds inject.
    (global as any).__FALLBACK_APP_ID__ = '1:123456789:web:abcdef123456';

    const firebaseModule = await import('../../src/firebase');
    
    expect(firebaseModule.firebaseReady).toBe(true);
  });
});
