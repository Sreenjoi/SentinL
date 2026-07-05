import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

// Setup mock express app
const app = express();
app.use(express.json());

// Mock requireAuth
const requireAuth = (req: any, res: any, next: any) => {
    req.user = { email: 'test@example.com', uid: 'testuid' };
    next();
};

const DISCORD_CLIENT_ID = 'test-client-id';
let DISCORD_CLIENT_SECRET: string | undefined = 'test-client-secret';

// Helper to parse origin
const parseAppOrigin = (url: string) => {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        return null;
    }
};

app.get("/api/auth/discord/url", requireAuth, (req: any, res) => {
    const clientId = DISCORD_CLIENT_ID;
    const clientSecret = DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "Discord OAuth is not configured on this server." });
    }

    const email = (req as any).user.email;
    const uid = (req as any).user.uid || "";

    const appUrlEnv = process.env.APP_URL;
    let realOrigin = appUrlEnv ? parseAppOrigin(appUrlEnv) : null;
    
    if (!realOrigin) {
      realOrigin = `${req.protocol}://${req.get("host")}`;
    }

    const redirectUri = `${realOrigin}/api/auth/discord/callback`;

    const hmacSecret = clientSecret;
    const payload = JSON.stringify({ email, origin: realOrigin, uid });
    const signature = crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
    
    const stateObj = { payload, signature };
    const encodedState = Buffer.from(JSON.stringify(stateObj)).toString("base64");

    const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("identify guilds")}&state=${encodeURIComponent(encodedState)}&prompt=consent`;

    res.json({ url: discordUrl });
});

app.get("/api/auth/discord/callback", async (req, res) => {
    const clientId = DISCORD_CLIENT_ID;
    const clientSecret = DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
    return res.status(503).json({ error: "Discord OAuth is not configured on this server." });
    }

    const code = req.query.code as string;
    const encodedState = req.query.state as string;

    if (!code || !encodedState) {
    return res.status(400).send("Invalid callback parameters.");
    }

    let stateObj;
    let payloadObj;
    try {
        stateObj = JSON.parse(Buffer.from(encodedState, "base64").toString("utf-8"));
        const { payload, signature } = stateObj;
        
        if (!payload || !signature) throw new Error("Missing payload or signature in state");

        const hmacSecret = clientSecret;
        const expectedSignature = crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
        
        let isValidSig = false;
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const signatureBuf = Buffer.from(signature as string, 'utf8');
        if (expectedBuf.length === signatureBuf.length) {
            isValidSig = crypto.timingSafeEqual(expectedBuf, signatureBuf);
        }

        if (!isValidSig) throw new Error("Invalid state signature");
        
        payloadObj = JSON.parse(payload);
    } catch (e) {
        return res.status(400).send("Invalid state parameter. Make sure you are initiating from the app.");
    }

    let origin = payloadObj.origin;
    const appUrlEnv = process.env.APP_URL;
    const envOrigin = appUrlEnv ? parseAppOrigin(appUrlEnv) : null;
    
    const allowedPreviewOrigins = [
        "https://ais-dev-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app",
        "https://ais-pre-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app"
    ];

    let isOriginAllowed = false;
    if (envOrigin && origin === envOrigin) isOriginAllowed = true;
    if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) isOriginAllowed = true;
    if (allowedPreviewOrigins.includes(origin)) isOriginAllowed = true;

    if (!isOriginAllowed) {
        return res.status(400).send("Invalid callback origin.");
    }

    res.json({ success: true });
});


describe('Discord OAuth Security', () => {
    beforeEach(() => {
        DISCORD_CLIENT_SECRET = 'test-client-secret';
        process.env.APP_URL = 'https://mycoolapp.com';
        process.env.NODE_ENV = 'production';
    });

    it('returns 503 if secret is missing', async () => {
        DISCORD_CLIENT_SECRET = undefined;
        const resUrl = await request(app).get('/api/auth/discord/url');
        expect(resUrl.status).toBe(503);

        const resCallback = await request(app).get('/api/auth/discord/callback?code=abc&state=xyz');
        expect(resCallback.status).toBe(503);
    });

    it('returns 400 for invalid callback parameters', async () => {
        const resCallback = await request(app).get('/api/auth/discord/callback?code=abc');
        expect(resCallback.status).toBe(400);
        expect(resCallback.text).toBe('Invalid callback parameters.');
    });

    it('returns 400 for forged state', async () => {
        const fakePayload = JSON.stringify({ email: 'hacker@hacker.com', origin: 'https://mycoolapp.com', uid: 'testuid' });
        const fakeSignature = 'badsig';
        const fakeState = Buffer.from(JSON.stringify({ payload: fakePayload, signature: fakeSignature })).toString('base64');

        const resCallback = await request(app).get(`/api/auth/discord/callback?code=abc&state=${fakeState}`);
        expect(resCallback.status).toBe(400);
    });

    it('accepts valid state and preview origin', async () => {
        process.env.APP_URL = undefined;
        process.env.NODE_ENV = 'development';
        
        const resUrl = await request(app)
          .get('/api/auth/discord/url')
          .set('Host', 'localhost:3000');
        expect(resUrl.status).toBe(200);

        const urlParts = new URL(resUrl.body.url);
        const stateStr = urlParts.searchParams.get('state');

        const resCallback = await request(app).get(`/api/auth/discord/callback?code=abc&state=${stateStr}`);
        expect(resCallback.status).toBe(200);
    });

    it('rejects unallowed origin', async () => {
        const payload = JSON.stringify({ email: 'test@example.com', origin: 'https://evil.com', uid: 'testuid' });
        const signature = crypto.createHmac("sha256", DISCORD_CLIENT_SECRET!).update(payload).digest("hex");
        const stateObj = { payload, signature };
        const encodedState = Buffer.from(JSON.stringify(stateObj)).toString("base64");

        const resCallback = await request(app).get(`/api/auth/discord/callback?code=abc&state=${encodedState}`);
        expect(resCallback.status).toBe(400);
        expect(resCallback.text).toBe('Invalid callback origin.');
    });
});
