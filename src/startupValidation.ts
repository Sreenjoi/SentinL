import { logger } from "./utils/logger.js";

export function validateStartup() {
    // Only strictly validate in actual production, skipping if AI_STUDIO_PREVIEW is set
    const isProd = process.env.NODE_ENV === 'production';
    const isPreview = process.env.AI_STUDIO_PREVIEW === 'true';

    // Allow dev environment or preview bypass
    if (!isProd || isPreview) {
        return;
    }

    // 1. Never allow fallback in production
    if (process.env.ALLOW_APPLET_FIREBASE_FALLBACK === 'true') {
        throw new Error("CRITICAL: ALLOW_APPLET_FIREBASE_FALLBACK=true is strictly forbidden in production context.");
    }

    const missingVars: string[] = [];
    const checkRequired = (varName: string) => {
        if (!process.env[varName] || process.env[varName].trim() === "") {
            missingVars.push(varName);
        }
    };

    // 2. Required config
    const coreVars = [
        "DISCORD_BOT_TOKEN",
        "DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET",
        "FIREBASE_SERVICE_ACCOUNT",
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIRESTORE_DATABASE_ID",
        "GROQ_API_KEY",
        "APP_URL",
    ];

    coreVars.forEach(checkRequired);

    if (process.env.PAYMENTS_ENABLED === 'true') {
        const paymentVars = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
        paymentVars.forEach(checkRequired);
    }

    if (missingVars.length > 0) {
        throw new Error(`CRITICAL: Server startup failed. Missing production configuration: ${missingVars.join(", ")}`);
    }

    // 3. Reject placeholder values and AI studio fallback projects in production
    if (process.env.VITE_FIREBASE_PROJECT_ID?.includes("ai-studio") || process.env.FIREBASE_PROJECT_ID?.includes("ai-studio")) {
        throw new Error(`CRITICAL: You cannot use AI Studio's fallback Firebase project (${process.env.VITE_FIREBASE_PROJECT_ID}) in an external production deployment.`);
    }

    if (process.env.DISCORD_BOT_TOKEN?.includes("placeholder") || process.env.DISCORD_BOT_TOKEN === "YOUR_BOT_TOKEN") {
        throw new Error("CRITICAL: Discord Bot Token contains placeholder values. Please provide a real token.");
    }

    if (process.env.RAZORPAY_KEY_ID?.includes("YOUR_RAZORPAY_KEY_ID")) {
        throw new Error("CRITICAL: Razorpay keys contain placeholders.");
    }

    // 4. Validate APP_URL as HTTPS
    const appUrl = process.env.APP_URL || "";
    if (appUrl) {
        if (!appUrl.startsWith("https://") && !appUrl.includes("localhost")) {
            throw new Error(`CRITICAL: APP_URL must use https://. Received: ${appUrl}`);
        }
    }
}
