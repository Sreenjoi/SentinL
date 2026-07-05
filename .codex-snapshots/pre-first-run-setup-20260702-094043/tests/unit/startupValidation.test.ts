import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateStartupConfig } from '../../src/utils/startupValidation';

describe('startupValidation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.NODE_ENV = 'production';
        process.env.AI_STUDIO_PREVIEW = 'false';
        process.env.ALLOW_APPLET_FIREBASE_FALLBACK = 'false';
        process.env.STRICT_STARTUP_VALIDATION = 'true';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    const setValidCoreVars = () => {
        process.env.DISCORD_BOT_TOKEN = 'live_token';
        process.env.DISCORD_CLIENT_ID = '1234';
        process.env.DISCORD_CLIENT_SECRET = 'secret';
        process.env.DISCORD_PUBLIC_KEY = 'pubkey';
        process.env.FIREBASE_SERVICE_ACCOUNT = '{"project_id": "real-project", "client_email": "test@test.com", "private_key": "privkey"}';
        process.env.FIREBASE_CLIENT_EMAIL = 'test@test.com';
        process.env.FIREBASE_PRIVATE_KEY = 'privkey';
        process.env.FIREBASE_PROJECT_ID = 'real-project';
        process.env.VITE_FIREBASE_API_KEY = 'apikey';
        process.env.VITE_FIREBASE_AUTH_DOMAIN = 'domain';
        process.env.VITE_FIREBASE_PROJECT_ID = 'real-project';
        process.env.VITE_FIREBASE_APP_ID = 'appid';
        process.env.VITE_FIRESTORE_DATABASE_ID = 'db';
        process.env.VITE_DISCORD_CLIENT_ID = '1234';
        process.env.GROQ_API_KEY = 'groq';
        process.env.PRIMARY_AI_PROVIDER = 'cloudflare';
        process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-account';
        process.env.CLOUDFLARE_API_TOKEN = 'cf-token';
        process.env.APP_URL = 'https://mysite.com';
        process.env.PAYMENTS_ENABLED = 'false';
    };

    it('passes with all required variables', () => {
        setValidCoreVars();
        const result = validateStartupConfig(process.env);
        expect(result.fatal.length).toBe(0);
    });

    it('throws when STRICT is true and core variables are missing', () => {
        setValidCoreVars();
        delete process.env.DISCORD_BOT_TOKEN;
        expect(() => validateStartupConfig(process.env)).toThrow();
    });

    it('requires payment variables when PAYMENTS_ENABLED is true in strict mode', () => {
        setValidCoreVars();
        process.env.PAYMENTS_ENABLED = 'true';
        expect(() => validateStartupConfig(process.env)).toThrow();
        
        process.env.RAZORPAY_KEY_ID = 'id';
        process.env.RAZORPAY_KEY_SECRET = 'sec';
        process.env.RAZORPAY_WEBHOOK_SECRET = 'web';
        const result = validateStartupConfig(process.env);
        expect(result.fatal.length).toBe(0);
    });

    it('returns missing keys instead of throwing when not strict', () => {
        setValidCoreVars();
        delete process.env.DISCORD_BOT_TOKEN;
        process.env.STRICT_STARTUP_VALIDATION = 'false';
        const result = validateStartupConfig(process.env);
        expect(result.missing).toContain("DISCORD_BOT_TOKEN");
        expect(result.disabledFeatures).toContain("discord_bot");
    });
});
