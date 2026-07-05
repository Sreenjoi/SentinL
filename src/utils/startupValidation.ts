import { logger } from "./logger.js";

export interface StartupValidationResult {
    mode: "preview" | "development" | "production";
    strict: boolean;
    missing: string[];
    disabledFeatures: string[];
    warnings: string[];
    fatal: string[];
}

export function validateStartupConfig(env: NodeJS.ProcessEnv): StartupValidationResult {
    const isProd = env.NODE_ENV === "production";
    const isPreview = env.AI_STUDIO_PREVIEW === 'true';
    const isStrict = env.STRICT_STARTUP_VALIDATION === 'true';

    const result: StartupValidationResult = {
        mode: isPreview ? "preview" : (isProd ? "production" : "development"),
        strict: isStrict,
        missing: [],
        disabledFeatures: [],
        warnings: [],
        fatal: []
    };

    const checkRequired = (varName: string) => {
        if (!env[varName] || env[varName].trim() === "") {
            result.missing.push(varName);
            return false;
        }
        return true;
    };

    // Auto-detect Railway URL if APP_URL is not explicitly set.
    // Other hosts must set APP_URL explicitly so OAuth callbacks and Discord links are correct.
    if (!env.APP_URL && (env.RAILWAY_STATIC_URL || env.RAILWAY_PUBLIC_DOMAIN)) {
        env.APP_URL = `https://${env.RAILWAY_PUBLIC_DOMAIN || env.RAILWAY_STATIC_URL}`;
    }

    if (!env.APP_URL) {
        result.missing.push("APP_URL");
        if (isStrict) {
            result.fatal.push("APP_URL environment variable is missing.");
        } else {
            result.warnings.push("APP_URL environment variable is missing.");
        }
    } else {
        try {
            new URL(env.APP_URL);
            if (!env.APP_URL.startsWith("https://") && !env.APP_URL.includes("localhost")) {
                result.warnings.push(`APP_URL must use https://. Received: ${env.APP_URL}`);
            }
        } catch {
            if (isStrict) {
                result.fatal.push("Invalid APP_URL provided.");
            } else {
                result.warnings.push("Invalid APP_URL provided.");
            }
        }
    }

    const discordVars = ["DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_PUBLIC_KEY"];
    let missingDiscord = false;
    for (const v of discordVars) {
        if (!checkRequired(v)) missingDiscord = true;
    }
    if (missingDiscord) {
        result.disabledFeatures.push("discord_bot");
        if (isStrict) result.fatal.push("Missing required Discord credentials.");
    } else if (env.DISCORD_BOT_TOKEN?.includes("placeholder") || env.DISCORD_BOT_TOKEN === "YOUR_BOT_TOKEN") {
        result.warnings.push("Discord Bot Token contains placeholder values.");
        result.disabledFeatures.push("discord_bot");
    }

    let hasValidServiceAccount = false;
    if (env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
            if (sa.project_id && sa.client_email && sa.private_key) {
                hasValidServiceAccount = true;
            } else {
                if (isStrict) result.fatal.push("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
                else result.warnings.push("FIREBASE_SERVICE_ACCOUNT is missing required fields.");
            }
        } catch {
            if (isStrict) result.fatal.push("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
            else result.warnings.push("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
        }
    }

    const firebaseVars = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
    let hasIndividualVars = true;
    for (const v of firebaseVars) {
        if (!env[v] || env[v].trim() === "") hasIndividualVars = false;
    }

    if (!hasValidServiceAccount && !hasIndividualVars) {
        result.disabledFeatures.push("firebase_admin");
        if (isStrict) result.fatal.push("Missing required Firebase Admin credentials.");
        for (const v of firebaseVars) {
            if (!env[v] || env[v].trim() === "") result.missing.push(v);
        }
        if (!env.FIREBASE_SERVICE_ACCOUNT) result.missing.push("FIREBASE_SERVICE_ACCOUNT");
    }
    
    const viteFirebaseVars = [
        "VITE_FIREBASE_API_KEY", 
        "VITE_FIREBASE_AUTH_DOMAIN", 
        "VITE_FIREBASE_PROJECT_ID", 
        "VITE_FIREBASE_APP_ID", 
        "VITE_FIRESTORE_DATABASE_ID", 
        "VITE_DISCORD_CLIENT_ID"
    ];
    let missingViteFirebase = false;
    for (const v of viteFirebaseVars) {
        if (!checkRequired(v)) missingViteFirebase = true;
    }
    if (missingViteFirebase && isStrict) {
        result.fatal.push("Missing VITE_FIREBASE variables for client. If deploying to Railway, Render, or Vercel, ensure these are set in your Environment Variables settings.");
    }

    const primaryAIProvider = (env.PRIMARY_AI_PROVIDER || "cloudflare").toLowerCase();
    if (primaryAIProvider === "groq") {
        if (!checkRequired("GROQ_API_KEY")) {
            result.disabledFeatures.push("ai_moderation");
            if (isStrict) result.fatal.push("Missing GROQ_API_KEY while PRIMARY_AI_PROVIDER=groq.");
        }
    } else {
        const missingCloudflare =
            !checkRequired("CLOUDFLARE_ACCOUNT_ID") ||
            !checkRequired("CLOUDFLARE_API_TOKEN");
        if (missingCloudflare) {
            result.disabledFeatures.push("ai_moderation");
            if (isStrict) {
                result.fatal.push("Missing Cloudflare Workers AI credentials while PRIMARY_AI_PROVIDER=cloudflare.");
            }
        }

        if (!env.GROQ_API_KEY || env.GROQ_API_KEY.trim() === "") {
            result.warnings.push("GROQ_API_KEY is missing. Groq fallback-only AI calls will be unavailable, but Cloudflare primary moderation can still run.");
        }
    }

    const paymentVars = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
    let missingPayments = false;
    for (const v of paymentVars) {
        if (!checkRequired(v)) missingPayments = true;
    }
    if (missingPayments) {
        result.disabledFeatures.push("payments");
        if (isStrict && env.PAYMENTS_ENABLED === 'true') {
            result.fatal.push("Missing required Razorpay credentials but payments are enabled.");
        }
    }

    if (result.fatal.length > 0) {
        throw new Error(`FATAL STARTUP ERRORS:\n- ${result.fatal.join("\n- ")}`);
    }

    return result;
}
