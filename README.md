# SentinL - AI Discord Moderation Bot

SentinL is a complete Discord AI moderation bot with a massive context window, custom Community DNA rules, and a human-in-the-loop dashboard. It is designed to be deployed as a single monolithic service that manages both the frontend and the backend bot processes.

## Architecture
- **Backend**: Express monolithic architecture.
- **Hosting**: Platform-neutral (runs on any Node.js / container host).
- **Discord Bot**: Runs as a `discord.js` Gateway bot natively within the server (`/src/discordBot.ts`), removing the need for a separate proxy or HTTP interactions endpoint.
- **Dashboard**: React + Vite monolithic App.
- **Database & Auth**: Firebase Firestore & Firebase Authentication, with Firebase Admin SDK utilized for backend verification.
- **AI Model**: Cloudflare Workers AI/Qwen primary with optional Groq fallback/escalation.
- **Billing**: Razorpay.

## Safety Note
Patch scripts are archived history only and must not be executed.

## Prerequisites
1. A Discord Developer account (to create a bot).
2. A Cloudflare account with Workers AI access for primary AI moderation. A Groq account is optional if you want fallback or premium escalation.
3. A Google Cloud / Firebase account.
4. A Razorpay account.
5. Node.js v22 & npm installed.

## Step 1: Firebase Setup
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. Enable **Firestore Database** (Start in production mode).
4. Enable **Authentication** (Email/Password & Google providers).
5. Go to Project Settings > Service Accounts and generate a new private key (save it for your environment values).
6. Go to Project Settings > General and add a Web App. Put the `firebaseConfig` properties into your frontend `.env`.

## Step 2: Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a New Application.
3. Go to the **Bot** tab, add a bot, and copy the **Token** (`DISCORD_BOT_TOKEN`).
4. Enable **Message Content Intent** (and Server Members / Presence if needed) under Privileged Gateway Intents.
5. Go to **General Information** and copy the **Application ID** (`DISCORD_CLIENT_ID`).
6. Generate an invite link in **OAuth2 > URL Generator** with scopes `bot` and `applications.commands`, and required permissions (e.g., `Send Messages`, `Manage Messages`, `Read Message History`, `Kick/Ban Members`). Invite the bot to your server.

## Step 3: Local Environment
Copy `.env.example` to `.env` and configure accordingly:
```bash
cp .env.example .env
```
Ensure that variables for Firebase (Admin SDK and client), Cloudflare AI, Razorpay, and Discord are populated. Add Groq only if you want Groq fallback or escalation.

*Note on Embedding & Preview:* In a production environment (`NODE_ENV="production"`), the app will not allow framing/embedding by default for security. Frontend Vite environment variables are validated during build. Backend startup validation reports missing external-service credentials as warnings unless `STRICT_STARTUP_VALIDATION="true"` is set, in which case missing required configuration throws a fatal startup error. If you need to embed it in AI Studio or preview it via framing, explicitly set `ALLOW_AI_STUDIO_EMBED="true"`. Do not set AI Studio preview flags on a real production deployment.

## Step 4: Local Development
To run SentinL locally with both the frontend app and backend services:
```bash
npm run dev
```
This executes `tsx server.ts` locally. Because the project acts as a monolith, it mounts Vite middleware directly into the Express backend to manage local frontend views while automatically running `discordBot.ts`. 

If you deploy more than one app instance, only one instance should run the Discord Gateway bot. Set `DISCORD_BOT_ENABLED=false` on dashboard/API-only replicas and keep `DISCORD_BOT_ENABLED=true` on exactly one always-on bot instance.

## Step 5: Production & Deployment

**Note: This application requires Node.js 22 to build and run.** Make sure your hosting provider (Railway, Render, etc.) is configured to use Node 22.
**Node Version Requirement**: SentinL requires exactly **Node 22**. Do not deploy on Node 24 or older Node versions, as this will cause compatibility issues. If deploying to Railway, Render, or another hosting provider, ensure you explicitly select Node 22 (e.g. using `NIXPACKS_NODE_VERSION=22` on Railway).

Build the UI and server side into portable JS:
```bash
npm run build
```

### Security Headers
SentinL natively serves strict security headers (Content-Security-Policy, HSTS, X-Content-Type-Options) using `helmet` directly in the Express `server.ts` layer. You do NOT need to configure external hosting rules (like `firebase.json` hosting rewrites or NGINX header injections) for these to work on platforms like Railway or Cloud Run.

### Debugging with Sourcemaps
To generate source maps for production builds, set `ENABLE_SOURCEMAPS=true` during the build process:
```bash
ENABLE_SOURCEMAPS=true npm run build
```
Note: Source maps are disabled by default for production builds to keep the output bundle small.

### Provider-Neutral Docker Deployment
SentinL is designed to be deployed using Docker, making it compatible with any container host (e.g., Railway, Render, Fly.io, Cloud Run, custom VPS). The included `Dockerfile` uses a multi-stage approach to securely build the app and remove dev dependencies, without baking secrets into the image.

To build and run the container locally:
```bash
docker build -t sentinl .
docker run -p 3000:3000 --env-file .env sentinl
```

To deploy to a cloud provider, connect your repository or push the Docker image, and configure the required environment variables. The app automatically respects the `PORT` environment variable provided by the host.

### Build Details and `PRESERVE_DIST`
By default, `npm run build` will wipe the `dist/` directory before building the frontend and backend assets. If you are developing inside an environment where wiping `dist/` breaks concurrent viewing (like AI Studio previews), you can set the `PRESERVE_DIST` environment variable:
```bash
PRESERVE_DIST=true npm run build
```

### Production Deployment Checklist
For production deployments (e.g., Railway, Render), your build process requires the following frontend Vite variables to be set in your hosting provider's environment settings BEFORE running `npm run build`:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIRESTORE_DATABASE_ID`
- `VITE_DISCORD_CLIENT_ID`

**Important Firebase Configuration Notes:**
- For AI Studio/local previews, you must copy `firebase-applet-config.example.json` to `firebase-applet-config.json` and fill in your Firebase Web App configuration.
- `firebase-applet-config.json` is local-only and excluded from version control.
- It must be recreated after restoring from AI Studio snapshots if it goes missing.
- For production, use `VITE_FIREBASE_*` environment variables instead of this file.
- For Google Sign-In to work, you must enable the Google provider in **Firebase Console > Authentication > Sign-in method**.
- The `VITE_FIREBASE_*` values MUST come from the **Firebase Console > Project Settings > General > Web App config**. Do not guess these values.
- Your production hosting domains (e.g., `your-app.up.railway.app`) **MUST be added** to your authorized domains in **Firebase Console > Authentication > Settings > Authorized domains** to allow Google Sign-In.
- Because these `VITE_*` variables are bundled into the frontend at build time, **changing any `VITE_*` environment variable requires a full rebuild and redeploy** of the application for the changes to take effect in the browser.

**Production Deployment Validation:**
If any of these required `VITE_FIREBASE_*` or `VITE_DISCORD_CLIENT_ID` variables are missing, contain placeholder values, or are improperly formatted during a `NODE_ENV=production` build, the build will strictly fail and exit.

### Required Environment Variables
Ensure the following variables are set in your production host environment:
- `PORT` (usually injected automatically by the hosting platform; defaults to 3000 if not set)
- `APP_URL` - **Must** be the public deployed URL of your application (e.g. `https://yourdomain.com`). This is required for OAuth redirects and bot links.
- `ENABLE_RECOMMENDATIONS_JOB` - Set to "true" to enable automated rule generation for Pro servers. NOTE: The automated recommendations background job will consume AI provider tokens.
- `DISCORD_BOT_ENABLED` - Set to "true" on exactly one always-on bot worker. Set to "false" on dashboard/API-only replicas to avoid duplicate Discord Gateway connections.
- `EVIDENCE_RETENTION_DAYS` - Days before old moderation evidence text is redacted from resolved records. Defaults to 30.
- `SUMMARY_RETENTION_DAYS` - Days before saved summary text is redacted while keeping summary metadata. Defaults to 90.

**AI Provider Setup:**
SentinL can use Cloudflare Workers AI (Qwen) as the primary moderation provider when configured. Groq remains supported as a fallback provider and for premium/large-model escalation where configured. Do not describe Groq as the normal moderation path when `PRIMARY_AI_PROVIDER=cloudflare`.

If using Cloudflare/Qwen as the primary moderation provider, follow this deployment checklist:
1. Set `PRIMARY_AI_PROVIDER=cloudflare`
2. Set `CLOUDFLARE_ACCOUNT_ID`
3. Set `CLOUDFLARE_API_TOKEN`
4. Set `CLOUDFLARE_FAST_MODEL=@cf/qwen/qwen3-30b-a3b-fp8` or your chosen Cloudflare Workers AI model
5. Keep `GROQ_API_KEY` only if you want Groq fallback or Groq-backed escalation. Do NOT put Cloudflare model names into Groq-specific model variables.

- `PRIMARY_AI_PROVIDER` - "groq" or "cloudflare"
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare Account ID for Workers AI
- `CLOUDFLARE_API_TOKEN` - Cloudflare API Token for Workers AI
- `CLOUDFLARE_FAST_MODEL` - Defaults to `@cf/qwen/qwen3-30b-a3b-fp8`
- `PRIMARY_AI_MODEL` - Groq primary/fallback model when Groq is used. Do not set this to a Cloudflare model.
- `PREMIUM_AI_MODEL` - Groq large-model escalation when enabled
- `GROQ_API_KEY` - Required only when Groq fallback or Groq escalation is enabled

- `GROQ_RPM_LIMIT` - Max requests per minute. Adjust according to your Groq tier (default 25).
- `GROQ_TPM_LIMIT` - Max tokens per minute. Adjust according to your Groq tier (default 4500).
- `GROQ_TOKEN_SAFETY_RATIO` - The safety margin to apply against Limits (default 0.8).
- `GROQ_GLOBAL_LIMITER_ENABLED` - Set to true to use cross-container firestore rate limit budget (default true).
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET` 
- `DISCORD_PUBLIC_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIRESTORE_DATABASE_ID` - Explicit FIRESTORE_DATABASE_ID is required to prevent fallback leaks in production. If you want to use the default database, set `FIRESTORE_DATABASE_ID=""` and `ALLOW_DEFAULT_FIRESTORE_DATABASE="true"`.
- `VITE_FIREBASE_API_KEY` - Required for frontend app
- `VITE_FIREBASE_AUTH_DOMAIN` - Required for frontend app
- `VITE_FIREBASE_PROJECT_ID` - Required for frontend app
- `VITE_FIREBASE_APP_ID` - Required for frontend app
- `VITE_FIRESTORE_DATABASE_ID` - Required for frontend app
- `VITE_DISCORD_CLIENT_ID` - Required for frontend app
- `GROQ_API_KEY`
- Payment variables (e.g., `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)

To start the built app in production, run:
```bash
npm start
```
