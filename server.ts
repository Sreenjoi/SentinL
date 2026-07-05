import "dotenv/config";
import { logger } from "./src/utils/logger.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import nacl from "tweetnacl";
import path from "path";
import Razorpay from "razorpay";
import crypto from "crypto";

import { PLAN_CONFIG, processIdempotentRazorpayPayment, validateCreateOrderRequest } from "./src/services/razorpay.js";
import { buildFrameAncestors, parseAppOrigin } from "./src/utils/cspHelper.js";
import { generateServerSummary } from "./src/services/summaryService.js";
import { DEFAULT_RULE_PRESETS, normalizeRulePreset } from "./src/data/serverRulePresets.js";
import {
  containsHighRiskSignal,
  hasLocalStructuralModerationRisk,
  shouldBypassClearlySafeLongMessage,
} from "./src/utils/moderationHelpers.js";

import {
  startDiscordBot,
  shutdownDiscordBot,
  getBotClient,
  getSentinLProtectedFooter,
  addBotLog,
  performDiscordAction,
  intentsWarning,
  resolveUserReport,
  invalidateRulesCache,
  invalidateTrainingCache,
  invalidateLevelingCache,
  updateServerHealthWidget,
} from "./src/discordBot.ts";
import { SocialIntegrationService } from "./src/services/socialIntegrations";

// --- Anti-Crash & Rate Limit Handling ---
process.on('unhandledRejection', (reason: any, promise) => {
  logger.error({ promise, err: reason }, '[Anti-Crash] Unhandled Rejection at:');
  addBotLog(`[System Fault] Unhandled Promise Rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (error: any) => {
  logger.error({ err: error }, '[Anti-Crash] Uncaught Exception - shutting down');
  addBotLog(`[System Fault] Uncaught Exception: ${error?.message || error}`);
  setTimeout(() => process.exit(1), 1000);
});

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || "";

const isSuperAdmin = async (uid: string | undefined): Promise<boolean> => {
  if (!uid) return false;
  try {
    const db = getAdminDB();
    const doc = await db.collection("admins").doc(uid).get();
    return doc.exists;
  } catch(e) { return false; }
};

const RAZORPAY_KEY_ID =
  process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET =
  process.env.RAZORPAY_KEY_SECRET || "";
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";

import admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import fs from "fs";

import { getAdminDB } from "./src/server/firebaseAdmin.js";
export { getAdminDB };

// --- Auth Middleware ---
const requireAuth = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    getAdminDB(); // Ensure app is initialized
    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Explicitly enforce that the user's email must be verified.
    if (!decodedToken.email_verified) {
      return res.status(403).json({
        error: "Email must be verified. Please check your inbox, verify your email, then refresh the page and try again."
      });
    }
    
    (req as any).user = decodedToken;
    next();
  } catch (error: any) {
    if (error.message === "Database service is not configured.") {
      return res.status(503).json({ error: "Database service is not configured." });
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

export const checkServerAuth = async (userId: string, email: string | undefined, serverId: string, db: any) => {
  if (await isSuperAdmin(userId)) return true;
  
  if (email) {
    const modDoc = await db.collection("moderators").doc(email).get();
    if (modDoc.exists && (modDoc.data()?.serverIds || []).includes(serverId)) return true;

    const serverDoc = await db.collection("servers").doc(serverId).get();
    if (serverDoc.exists && serverDoc.data()?.ownerEmail === email) return true;
  }

  // 1. Check user's global subscription linked servers
  const subDoc = await db.collection("subscriptions").doc(userId).get();
  if (subDoc.exists && (subDoc.data()?.linkedServerIds || []).includes(serverId)) return true;

  // 2. Check direct server_subscriptions ownership
  const serverSubDoc = await db.collection("server_subscriptions").doc(serverId).get();
  if (serverSubDoc.exists) {
    const ownerId = serverSubDoc.data()?.ownerId;
    if (ownerId === userId) {
      // The user is marked as owner in server_subscriptions, but the server is NOT in their 
      // subscriptions/{userId}.linkedServerIds. This is a stale record. Deny access.
      return false;
    }
  }

  return false;
};

const getAuthorizedDiscordUserId = async (
  userId: string,
  email: string | undefined,
  serverId: string,
  db: any,
): Promise<string> => {
  if (!email) return userId;
  const modDoc = await db.collection("moderators").doc(email).get();
  if (!modDoc.exists) return userId;
  const modData = modDoc.data() || {};
  const serverIds = Array.isArray(modData.serverIds) ? modData.serverIds : [];
  if (modData.firebaseUid && modData.firebaseUid !== userId) return userId;
  if (!serverIds.includes(serverId)) return userId;
  return typeof modData.discordId === "string" && modData.discordId ? modData.discordId : userId;
};

const isPlaceholderSecret = (value: string | undefined, label: string): boolean => {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized ||
    normalized.includes("placeholder") ||
    normalized.includes("default") ||
    normalized.includes("changeme") ||
    normalized === label.toLowerCase();
};

const isFirestoreQuotaError = (error: any): boolean => {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === 8 ||
    message.includes("resource_exhausted") ||
    message.includes("quota limit exceeded") ||
    message.includes("free daily read units");
};

const getDiscordBotToken = (): string | null => {
  let tokenData = process.env.DISCORD_BOT_TOKEN?.trim();
  if (tokenData && tokenData.split(".").length > 3) {
    tokenData = tokenData.split(".").slice(0, 3).join(".");
  }
  return tokenData ? tokenData.trim() : null;
};

const fetchBotGuildIdsFromDiscordRest = async (
  requestedIds?: string[],
): Promise<string[]> => {
  const token = getDiscordBotToken();
  if (!token) return [];

  if (requestedIds && requestedIds.length > 0) {
    const checks = await Promise.all(
      requestedIds.map(async (id) => {
        const resp = await fetch(`https://discord.com/api/v10/guilds/${id}`, {
          headers: { Authorization: `Bot ${token}` },
        }).catch(() => null);
        return resp?.ok ? id : null;
      }),
    );
    return checks.filter((id): id is string => Boolean(id));
  }

  const guildIds: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://discord.com/api/v10/users/@me/guilds");
    url.searchParams.set("limit", "200");
    if (after) url.searchParams.set("after", after);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bot ${token}` },
    }).catch(() => null);
    if (!resp?.ok) break;
    const data = await resp.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) break;
    data.forEach((guild: any) => {
      if (typeof guild?.id === "string") guildIds.push(guild.id);
    });
    after = data[data.length - 1]?.id;
    if (!after || data.length < 200) break;
  }
  return guildIds;
};

const sendFirestoreQuotaResponse = (res: any) =>
  res.status(503).json({
    error: "Firebase quota has been reached. SentinL is temporarily unable to read or update dashboard data. Please try again after the Firestore daily quota resets.",
    code: "FIRESTORE_QUOTA_EXHAUSTED",
    retryable: true,
  });

const requireServerAuth = async (req: any, res: any, next: any) => {
  if (!(req as any).user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const serverId = req.params.serverId || req.query.serverId || req.body.serverId;
  if (!serverId) {
    return res.status(400).json({ error: "Missing serverId" });
  }
  try {
    const db = getAdminDB();
    const isAuth = await checkServerAuth((req as any).user.uid, (req as any).user.email, serverId, db);
    if (!isAuth) {
      return res.status(403).json({ error: "Forbidden: Not authorized for this server" });
    }
    next();
  } catch (error: any) {
    if (error.message === "Database service is not configured.") {
      return res.status(503).json({ error: "Database service is not configured." });
    }
    if (isFirestoreQuotaError(error)) {
      logger.warn({ err: error }, "Firestore quota exhausted in requireServerAuth");
      return sendFirestoreQuotaResponse(res);
    }
    logger.error({ err: error }, "Error in requireServerAuth");
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getDashboardModeratorIdentity = async (req: any, serverId: string, db: admin.firestore.Firestore) => {
  const user = req.user || {};
  const fallbackName = user.name || user.email || "Dashboard moderator";
  const identity: {
    id: string;
    name: string;
    avatarUrl: string | null;
    discordId: string | null;
  } = {
    id: user.uid,
    name: fallbackName,
    avatarUrl: typeof user.picture === "string" ? user.picture : null,
    discordId: null,
  };

  if (!user.email) return identity;

  try {
    const modSnap = await db.collection("moderators").doc(user.email).get();
    if (!modSnap.exists) return identity;
    const modData = modSnap.data() || {};
    const serverIds = Array.isArray(modData.serverIds) ? modData.serverIds : [];
    if (modData.firebaseUid && modData.firebaseUid !== user.uid) return identity;
    if (!serverIds.includes(serverId)) return identity;

    const discordUsername =
      typeof modData.discordUsername === "string" && modData.discordUsername.trim()
        ? modData.discordUsername.trim()
        : null;
    const discordId =
      typeof modData.discordId === "string" && modData.discordId.trim()
        ? modData.discordId.trim()
        : null;
    const discordAvatar =
      typeof modData.discordAvatar === "string" && modData.discordAvatar.trim()
        ? modData.discordAvatar.trim()
        : null;

    identity.name = discordUsername || fallbackName;
    identity.discordId = discordId;
    if (discordId && discordAvatar) {
      const ext = discordAvatar.startsWith("a_") ? "gif" : "png";
      identity.avatarUrl = `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatar}.${ext}?size=128`;
    }
  } catch (err) {
    logger.warn({ err, uid: user.uid }, "Failed to resolve moderator display identity");
  }

  return identity;
};

const getReportAssignmentConflict = (
  reportData: any,
  currentUserId: string,
  currentDiscordId?: string | null,
): string | null => {
  const assigneeId = typeof reportData?.assigneeId === "string" ? reportData.assigneeId : "";
  const assigneeDiscordId =
    typeof reportData?.assigneeDiscordId === "string" ? reportData.assigneeDiscordId : "";
  if (!assigneeId && !assigneeDiscordId) return null;
  if (assigneeId === currentUserId) return null;
  if (currentDiscordId && (assigneeId === currentDiscordId || assigneeDiscordId === currentDiscordId)) return null;
  return typeof reportData?.assigneeName === "string" && reportData.assigneeName.trim()
    ? reportData.assigneeName.trim()
    : "another moderator";
};

export const enforceQuotaLimits = async (userId: string, email: string, db: admin.firestore.Firestore) => {
  try {
    const subSnap = await db.collection("subscriptions").doc(userId).get();
    
    let maxSlots = 1;
    let userSubActive = false;
    if (subSnap.exists) {
      try {
        const resolvedUserSub = resolveSub(subSnap.data(), userId, userId);
        if (resolvedUserSub && resolvedUserSub.isPremium) {
          maxSlots = resolvedUserSub.maxServers;
          userSubActive = true;
        }
      } catch (err) {
        logger.warn({ userId, err: err instanceof Error ? err.message : err }, "[Quota Enforcer] Failed to parse user entitlement date, deferring user limits");
        maxSlots = 1;
        userSubActive = false;
      }
    }

    if (!email) return;

    const modRef = db.collection("moderators").doc(email);
    const modSnap = await modRef.get();
    if (!modSnap.exists) return;

    const modData = modSnap.data() || {};
    const activeIds = modData.activeServerIds || [];

    const nonBetaActiveIds: string[] = [];
    const betaActiveIds: string[] = [];

    // Parallelize with safe concurrency limit (batching by 5)
    const checkServer = async (sId: string) => {
      try {
        const tierStatus = await getServerTierStatus(sId, db);
        if (tierStatus.isPremium && tierStatus.source !== "owner") {
            // It has standalone premium or beta
            betaActiveIds.push(sId);
        } else {
            // No standalone premium; counts against user quota
            nonBetaActiveIds.push(sId);
        }
      } catch (err) {
         logger.warn({ serverId: sId, err: err instanceof Error ? err.message : err }, "[Quota Enforcer] Failed to parse server entitlement date, deferring deactivation");
         // Defer deactivation: treat as beta/standalone so it doesn't take up quota or get deactivated
         betaActiveIds.push(sId);
      }
    };

    for (let i = 0; i < activeIds.length; i += 5) {
      const chunk = activeIds.slice(i, i + 5);
      await Promise.all(chunk.map(checkServer));
    }

    if (nonBetaActiveIds.length > maxSlots) {
      logger.info(`[Quota Enforcer] User ${email} has ${nonBetaActiveIds.length} non-beta active servers, limit ${maxSlots}. Demoting...`);
      const keptServers = nonBetaActiveIds.slice(0, maxSlots);
      const removedServers = nonBetaActiveIds.slice(maxSlots);

      for (const sId of removedServers) {
        await db.collection("servers").doc(sId).set({ active: false, botTested: false }, { merge: true });
        logger.info(`[Quota Enforcer] Deactivated server ${sId} for ${email}.`);
      }

      const newActiveServerIds = [...keptServers, ...betaActiveIds];
      await modRef.update({
        activeServerIds: newActiveServerIds,
        activeServerId: newActiveServerIds.length > 0 ? newActiveServerIds[0] : null
      });
    }
  } catch (err) {
    logger.error({ err: err }, "[Quota Enforcer] Failed to enforce quota logic:");
  }
};

import { isServerPremium, resolveSub, getServerTierStatus } from "./src/utils/entitlements.js";
import { processGiveaway } from "./src/services/giveaway.js";

import { generateServerRecommendations } from "./src/jobs/recommendations.ts";

import { validateStartupConfig, StartupValidationResult } from './src/utils/startupValidation.ts';
import { globalErrorHandler } from './src/utils/errorHandler.ts';

export let startupValidation: StartupValidationResult;

export async function createApp() {
  try {
    startupValidation = validateStartupConfig(process.env);
  } catch (err: any) {
    logger.error(err.message);
    if (err.message.includes('FATAL')) {
      process.exit(1);
    }
  }
  if (process.env.ENABLE_STARTUP_RECOMMENDATIONS === "true" && process.env.ENABLE_RECOMMENDATIONS_JOB === "true") {
    setTimeout(() => {
      generateServerRecommendations().catch(logger.error);
    }, 10000);
  }
  
  if (process.env.ENABLE_RECOMMENDATIONS_JOB === "true") {
    setInterval(() => {
      generateServerRecommendations().catch(logger.error);
    }, 86400000);
  }

  const app = express();
  app.set("trust proxy", 1);
  
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: "Too many requests from this IP, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const mutationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: { error: "Too many requests from this IP, please try again after a minute" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", generalLimiter);

  const isProd = process.env.NODE_ENV === "production";

  const frameAncestorsList = buildFrameAncestors(
    process.env.APP_URL,
    process.env.ALLOW_AI_STUDIO_EMBED
  );

  // In development, Vite HMR requires 'unsafe-inline' and 'unsafe-eval'
  // In production, neither is required. Razorpay and Firebase work fine with external sources.
  const scriptSrc = ["'self'", "https://apis.google.com", "https://checkout.razorpay.com"];
  if (!isProd) {
    scriptSrc.push("'unsafe-inline'");
    scriptSrc.push("'unsafe-eval'");
  } else if (process.env.ALLOW_UNSAFE_EVAL === "true") {
    logger.warn("[Security] Ignoring ALLOW_UNSAFE_EVAL in production. Remove this env var unless you are debugging a non-production preview.");
  }

  app.use(helmet({
    xFrameOptions: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: scriptSrc,
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://cdn.discordapp.com", "https://firebasestorage.googleapis.com", "https://discord.com", "https://unavatar.io"],
        connectSrc: [
          "'self'",
          "https://firestore.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://api.groq.com",
          "https://cdn.discordapp.com",
          "https://discord.com",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com",
          "ws:",
          "wss:"
        ],
        // frameSrc controls what external sites SentinL is allowed to iframe
        frameSrc: ["'self'", "https://discord.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        // frameAncestors controls who is allowed to embed SentinL in an iframe
        frameAncestors: frameAncestorsList,
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      }
    }
  }));

  const isPreview = process.env.AI_STUDIO_PREVIEW === "true";
  const allowEmbed = process.env.ALLOW_AI_STUDIO_EMBED === "true" || (!isProd && isPreview) || (!isProd && process.env.ALLOW_AI_STUDIO_EMBED !== "false");

  const allowedOrigins: string[] = [];
  if (!isProd) {
    allowedOrigins.push("http://localhost:3000");
  }

  if (allowEmbed) {
    allowedOrigins.push(
      "https://ais-pre-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app",
      "https://ais-dev-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app"
    );
  }

  if (process.env.APP_URL) {
    const envOrigin = parseAppOrigin(process.env.APP_URL);
    if (envOrigin && !allowedOrigins.includes(envOrigin)) allowedOrigins.push(envOrigin);
  }

  // Fallback for when there's no APP_URL and we need to run locally, just in case
  if (allowedOrigins.length === 0) {
    allowedOrigins.push("http://localhost:3000");
  }

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  // Standard JSON body parser
  app.use(
    express.json({
      limit: '50kb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );


  app.get("/api/diagnostics/server/:serverId", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    if (process.env.NODE_ENV === "production" || !(await isSuperAdmin((req as any).user?.uid))) {
      return res.status(403).json({ error: "Forbidden: Diagnostics only available in development" });
    }
    try {
      const serverId = req.params.serverId;
      const db = getAdminDB();
      const serverDoc = await db.collection("servers").doc(serverId).get();
      
      const subDoc = await db.collection("subscriptions").doc(serverId).get();
      const linkSnap = await db.collection("server_subscriptions").doc(serverId).get();
      let ownerSub = null;
      if (linkSnap.exists && linkSnap.data()?.ownerId) {
        const ownerDoc = await db.collection("subscriptions").doc(linkSnap.data()!.ownerId).get();
        if (ownerDoc.exists) ownerSub = ownerDoc.data();
      }
      
      const client = getBotClient();
      let botHealth = {};
      if (client && client.isReady()) {
         try {
           const guild = await client.guilds.fetch(serverId).catch(() => null);
           if (guild) {
             const botMember = await guild.members.fetch(client.user.id).catch(() => null);
             botHealth = {
               isInGuild: true,
               guildName: guild.name,
               botPermissions: botMember ? botMember.permissions.toArray() : [],
               memberCount: guild.memberCount
             };
           } else {
             botHealth = { isInGuild: false, reason: "Guild not found by client" };
           }
         } catch(e: any) {
             botHealth = { isInGuild: false, error: e.message };
         }
      } else {
        botHealth = { isBotReady: false };
      }
      
      return res.json({
         serverData: serverDoc.data() || null,
         subscription: subDoc.data() || null,
         serverSubscriptionLink: linkSnap.data() || null,
         ownerSubscription: ownerSub,
         botHealth
      });
    } catch (error: any) {
      return next(error);
    }
  });

  app.get("/api/guilds/:serverId/tier", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    try {
      const serverId = req.params.serverId;
      const userId = (req as any).user.uid;
      const db = getAdminDB();
      const serverTierStatus = await getServerTierStatus(serverId, db);
      
      let userTier = "free";
      let userIsTrial = false;
      
      const userSub = await db.collection("subscriptions").doc(userId).get();
      if (userSub.exists) {
         const data = userSub.data()!;
         let isActive = data.status === "active" || (!data.status && (data.accessTier === "premium" || data.accessTier === "pro_1" || data.accessTier === "pro_3"));
         if (isActive && data.expiresAt && data.expiresAt.toDate && data.expiresAt.toDate().getTime() < Date.now()) {
            isActive = false;
         }
         let isTrial = false;
         if (data.status === "trial" && data.trialEnd && data.trialEnd.toDate && data.trialEnd.toDate().getTime() > Date.now()) {
            isTrial = true;
         }
         if (isActive || isTrial) {
            userTier = data.accessTier || "free";
            userIsTrial = isTrial;
         }
      }

      res.json({
        tier: serverTierStatus.isPremium ? serverTierStatus.tier : "free",
        userTier: userTier,
        isBetaTester: serverTierStatus.isBeta,
        userIsTrial: userIsTrial,
        isTrial: serverTierStatus.isTrial,
        maxServersSetting: serverTierStatus.maxServers,
        entitlementExpiry: serverTierStatus.expiry
          ? serverTierStatus.expiry.toDate().toISOString()
          : null,
        entitlementStatus: serverTierStatus.status,
        entitlementSource: serverTierStatus.source
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/bot-guilds", requireAuth, async (req: any, res, next: any) => {
    const client = getBotClient();
    try {
      const uid = (req as any).user?.uid;
      const email = (req as any).user?.email;
      const superAdmin = await isSuperAdmin(uid);
      const requestedIds = String(req.query.ids || "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d{10,30}$/.test(id));
      if (!client || !client.isReady()) {
        let allowedIdsForRest = requestedIds;
        if (!superAdmin && allowedIdsForRest.length === 0) {
          const allowed = new Set<string>();
          if (email) {
            const modDoc = await getAdminDB().collection("moderators").doc(email).get();
            const serverIds = modDoc.exists && Array.isArray(modDoc.data()?.serverIds) ? modDoc.data()?.serverIds : [];
            serverIds.forEach((id: string) => allowed.add(id));
          }
          const subDoc = await getAdminDB().collection("subscriptions").doc(uid).get();
          const linkedServerIds = subDoc.exists && Array.isArray(subDoc.data()?.linkedServerIds) ? subDoc.data()?.linkedServerIds : [];
          linkedServerIds.forEach((id: string) => allowed.add(id));
          allowedIdsForRest = Array.from(allowed);
        }

        const restGuildIds = await fetchBotGuildIdsFromDiscordRest(
          superAdmin && requestedIds.length === 0 ? undefined : allowedIdsForRest,
        );
        const filteredGuildIds = superAdmin || requestedIds.length > 0
          ? restGuildIds
          : restGuildIds.filter((id) => allowedIdsForRest.includes(id));

        return res.json({
          guilds: filteredGuildIds,
          warning: "Bot gateway not ready; verified guild membership through Discord REST.",
          ...(superAdmin ? {
            groqPresent: !!process.env.GROQ_API_KEY,
            missingToken: !(process.env.DISCORD_BOT_TOKEN),
            intentsWarning,
          } : {}),
        });
      }

      let allowedGuildIds: string[] = [];
      if (superAdmin) {
        allowedGuildIds = client.guilds.cache.map((g) => g.id);
      } else if (requestedIds.length > 0) {
        allowedGuildIds = requestedIds.filter((id) => client.guilds.cache.has(id));
      } else {
        const allowed = new Set<string>();
        if (email) {
          const modDoc = await getAdminDB().collection("moderators").doc(email).get();
          const serverIds = modDoc.exists && Array.isArray(modDoc.data()?.serverIds) ? modDoc.data()?.serverIds : [];
          serverIds.forEach((id: string) => allowed.add(id));
        }
        const subDoc = await getAdminDB().collection("subscriptions").doc(uid).get();
        const linkedServerIds = subDoc.exists && Array.isArray(subDoc.data()?.linkedServerIds) ? subDoc.data()?.linkedServerIds : [];
        linkedServerIds.forEach((id: string) => allowed.add(id));
        allowedGuildIds = client.guilds.cache
          .map((g) => g.id)
          .filter((id) => allowed.has(id));
      }

      res.json({
        guilds: allowedGuildIds,
        ...(superAdmin ? {
          groqPresent: !!process.env.GROQ_API_KEY,
          intentsWarning,
        } : {}),
      });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/discord/user/:id", requireAuth, async (req: any, res, next: any) => {
    try {
      const client = getBotClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ error: "Bot not ready" });
      }
      const user = await client.users.fetch(req.params.id, { force: true }).catch(() => null);
      if (!user) return res.status(404).json({ error: "User not found" });

      const isAnimated = user.avatar?.startsWith("a_");
      const ext = isAnimated ? "gif" : "png";
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || "0") % 5}.png`;

      res.json({ avatarUrl });
    } catch (e) {
      logger.error(e);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.get("/api/discord/roles/:serverId", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const client = getBotClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ error: "Bot not ready" });
      }
      const guild = await client.guilds.fetch(req.params.serverId).catch(() => null);
      if (!guild) return res.status(404).json({ error: "Server not found" });
      const fetchedRoles = await guild.roles.fetch();
      logger.info(`[DEBUG] Fetched ${fetchedRoles.size} roles for guild ${req.params.serverId}`);
      
      const botMember = await guild.members.fetch(client.user?.id).catch(() => null);
      const botHighestRolePosition = botMember?.roles.highest.position || 0;

      const roles = Array.from(fetchedRoles.values())
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          isManaged: r.managed,
          position: r.position,
        }))
        .filter((r) => r.name !== "@everyone" && !r.isManaged);
      logger.info(`[DEBUG] Filtered to ${roles.length} roles`);
      res.json({ roles, botHighestRolePosition });
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/discord/permissions/:serverId", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    try {
      const client = getBotClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ error: "Bot not ready" });
      }
      const guild = await client.guilds.fetch(req.params.serverId).catch(() => null);
      if (!guild) return res.status(404).json({ error: "Server not found" });

      const botMember = await guild.members.fetch(client.user.id).catch(() => null);
      if (!botMember) return res.status(404).json({ error: "Bot member not found in server" });

      const { PermissionFlagsBits } = await import("discord.js");
      const hasAdministrator = botMember.permissions.has(PermissionFlagsBits.Administrator);
      const hasPermission = (permission: bigint) =>
        hasAdministrator || botMember.permissions.has(permission);
      const permissions = {
        ViewChannel: hasPermission(PermissionFlagsBits.ViewChannel),
        SendMessages: hasPermission(PermissionFlagsBits.SendMessages),
        ManageRoles: hasPermission(PermissionFlagsBits.ManageRoles),
        KickMembers: hasPermission(PermissionFlagsBits.KickMembers),
        BanMembers: hasPermission(PermissionFlagsBits.BanMembers),
        ManageMessages: hasPermission(PermissionFlagsBits.ManageMessages),
        ModerateMembers: hasPermission(PermissionFlagsBits.ModerateMembers),
        ReadMessageHistory: hasPermission(PermissionFlagsBits.ReadMessageHistory),
        AddReactions: hasPermission(PermissionFlagsBits.AddReactions),
        AttachFiles: hasPermission(PermissionFlagsBits.AttachFiles),
        EmbedLinks: hasPermission(PermissionFlagsBits.EmbedLinks)
      };

      res.json({ isInGuild: true, hasAdministrator, permissions, raw: botMember.permissions.toArray() });
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/discord/channels/:serverId", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const client = getBotClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ error: "Bot not ready" });
      }
      const guild = await client.guilds.fetch(req.params.serverId).catch(() => null);
      if (!guild) return res.status(404).json({ error: "Server not found" });
      const fetchedChannels = await guild.channels.fetch();
      logger.info(`[DEBUG] Fetched ${fetchedChannels.size} channels for guild ${req.params.serverId}`);
      const channels = Array.from(fetchedChannels.values())
        .filter((c: any) => c && c.isTextBased())
        .map((c: any) => ({
          id: c.id,
          name: c.name,
        }));
      logger.info(`[DEBUG] Filtered to ${channels.length} text channels`);
      res.json({ channels });
    } catch (e: any) {
      next(e);
    }
  });

  app.post("/api/server/:serverId/health-widget/sync", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const { flushAnalyticsBatcher } = await import("./src/discordBot.ts");
      if (flushAnalyticsBatcher) {
          await flushAnalyticsBatcher();
      }
      await updateServerHealthWidget(req.params.serverId, true);
      res.json({ success: true, message: "Widget update triggered successfully." });
    } catch (e: any) {
      logger.error({ err: e }, "[Health Sync Endpoint Error]");
      next(e);
    }
  });

  app.post("/api/register-commands", requireAuth, mutationLimiter, async (req: any, res: any, next: any) => {
    const serverId = req.body.serverId;
    
    if (serverId) {
      const db = getAdminDB();
      const isAuth = await checkServerAuth((req as any).user?.uid, (req as any).user?.email, serverId, db);
      if (!isAuth) {
        return res.status(403).json({ error: "Forbidden: Not authorized for this server" });
      }
    } else {
      if (!(await isSuperAdmin((req as any).user?.uid))) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    
    logger.info(`[Discord Commands] Registration endpoint hit (serverId: ${serverId || 'global'})`);
    try {
      const discordJS = await import("discord.js");
      const {
        REST,
        Routes,
        SlashCommandBuilder,
        ContextMenuCommandBuilder,
        ApplicationCommandType,
        PermissionFlagsBits,
      } = discordJS;
      let tokenData = process.env.DISCORD_BOT_TOKEN?.trim();
      if (tokenData && tokenData.split(".").length > 3) {
        tokenData = tokenData.split(".").slice(0, 3).join(".");
      }
      const token = tokenData ? tokenData.trim() : undefined;
      const client = getBotClient();

      // Try to get Client ID from env, or the bot client itself
      const clientId = process.env.DISCORD_CLIENT_ID || client?.user?.id;

      if (!clientId) {
        return res.status(503).json({ error: "Service Unavailable: DISCORD_CLIENT_ID is not configured and the bot client is not ready." });
      }

      if (!token) {
        logger.error("[Discord Commands] No bot token found.");
        return res.status(503).json({ error: "Service Unavailable: DISCORD_BOT_TOKEN is not configured." });
      }

      logger.info(`[Discord Commands] Registering for Client ID: ${clientId}`);
      const rest = new REST({ version: "10" }).setToken(token);

      const managedCommands = await (await import("./src/utils/discordCommands.ts")).buildManagedCommands();


      // To avoid 50035, we should either:
      // 1. Completely replace ALL commands with our managed ones (Safest)
      // 2. OR, correctly filter existing ones AND strip all their extra properties (id, application_id, etc.)

      // We'll go with Option 1: Managed commands are the source of truth.
      // If you need to keep unmanaged commands, you must map c => ({ name: c.name, description: c.description, options: c.options, etc. })

      const managedNames = managedCommands.map((c) => c.name);

      const commandRoute = serverId
        ? Routes.applicationGuildCommands(clientId, serverId)
        : Routes.applicationCommands(clientId);

      // Keep existing commands that we don't manage, but STRIP them to just registration fields.
      // For guild syncs, native SentinL commands are removed from guild scope so Discord does
      // not show duplicates beside the global commands.
      const existingCommands = await rest.get(commandRoute) as any[];
      const keepers = existingCommands
        .filter((c: any) => !managedNames.includes(c.name))
        .map((c) => ({
          name: c.name,
          description: c.description,
          options: c.options,
          default_member_permissions: c.default_member_permissions,
          dm_permission: c.dm_permission,
          nsfw: c.nsfw,
        }));

      const finalCommands = serverId ? keepers : [...managedCommands, ...keepers];

      const added: string[] = [];
      const updated: string[] = [];
      const removed: string[] = [];
      const failed: { name: string; error: string }[] = [];

      logger.info(
        `[Discord Commands] Processing ${finalCommands.length} commands ${serverId ? 'for server ' + serverId : 'globally'} via PUT for instant sync...`,
      );

      try {
        await rest.put(commandRoute, {
          body: finalCommands,
        });
        
        // Let's figure out what changed (roughly) for the UI response
        for (const cmd of finalCommands) {
          const existing = existingCommands.find((c) => c.name === cmd.name);
          if (existing) {
            updated.push(cmd.name);
          } else {
            added.push(cmd.name);
          }
        }
        if (serverId) {
          for (const cmd of existingCommands) {
            if (managedNames.includes(cmd.name)) {
              removed.push(cmd.name);
            }
          }
        }
      } catch (err: any) {
        logger.error({ err: err.message || err }, `[Discord Commands] Global PUT failed:`);
        failed.push({
          name: "Global Sync",
          error: err.message || "Unknown error",
        });
      }

      logger.info("[Discord Commands] Registration process complete.");
      res.json({
        success: failed.length === 0,
        message: "Command registration complete",
        details: {
          added,
          updated,
          removed,
          failed,
        },
      });
    } catch (e: any) {
      logger.error({ err: e }, "[Discord Commands] CRITICAL ERROR:");
      res.status(500).json({ error: "Failed to register commands." });
    }
  });



  app.post("/api/mod-action", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res: any, next: any) => {
    const { serverId, channelId, messageId, action, authorId, reason, flaggedMessageId } = req.body;
    if (!serverId || !channelId || !messageId || !action) {
      return res.status(400).json({ error: "Missing parameters" });
    }
    
    if (!(req as any).user || !(req as any).user.uid) return res.status(403).json({ error: "Forbidden" });

    try {
      const db = getAdminDB();
      const { authorizeModAction } = await import("./src/utils/modAuth.js");
      const discordUserId = await getAuthorizedDiscordUserId((req as any).user.uid, (req as any).user.email, serverId, db);
      await authorizeModAction(discordUserId, serverId, action, db, reason, undefined, true);

      let flaggedMessageData: any = null;
      let flaggedMessageRef: any = null;
      if (flaggedMessageId) {
        flaggedMessageRef = db.collection("flaggedMessages").doc(flaggedMessageId);
        const flaggedSnap = await flaggedMessageRef.get();
        if (!flaggedSnap.exists) {
          return res.status(404).json({ error: "Flagged message not found" });
        }
        flaggedMessageData = flaggedSnap.data();
        if (flaggedMessageData?.serverId !== serverId) {
          return res.status(403).json({ error: "Forbidden: flagged message belongs to another server" });
        }
        if (flaggedMessageData?.channelId && flaggedMessageData.channelId !== channelId) {
          return res.status(400).json({ error: "Channel does not match flagged message" });
        }
        if (flaggedMessageData?.messageId && flaggedMessageData.messageId !== messageId) {
          return res.status(400).json({ error: "Message ID does not match flagged message" });
        }
        if (authorId && flaggedMessageData?.authorId && flaggedMessageData.authorId !== authorId) {
          return res.status(400).json({ error: "Author does not match flagged message" });
        }
      }

      let result = { success: true };
      if (action !== "approved" && action !== "remove" && action !== "delete_record") {
        result = await performDiscordAction(
          serverId,
          channelId,
          messageId,
          action,
          authorId,
          reason
        );
      }

      if (flaggedMessageId && flaggedMessageRef && flaggedMessageData) {
          const docRef = flaggedMessageRef;
          const msg = flaggedMessageData;
          const updateData: any = {};
          
          if (action === "remove") {
             updateData.status = "resolved";
          } else if (action === "delete_record") {
             await docRef.delete();
             const crypto = await import("crypto");
             const actionDocId = crypto.randomUUID();
             await db.collection("modActions").doc(actionDocId).set({
                serverId,
                type: "delete_record",
                timestamp: new Date().toISOString(),
                reason: reason || "Manual deletion of record via dashboard",
                userId: authorId || msg.authorId,
                moderatorId: (req as any).user.uid,
                messageId: messageId,
                channelId: channelId,
                userName: msg.authorUsername
             });
             return res.json({ success: true });
          } else {
             updateData.actionTaken = action;
             if (msg.actionTaken === "auto_deleted" && (action === "warn" || action === "warned" || action === "timeout")) {
               updateData.actionTaken = "auto_deleted";
             }
             if (action === "delete" || action === "deleted") updateData.isDeleted = true;
             else if (action === "warn" || action === "warned") {
               updateData.isWarned = true;
               if (msg.actionTaken === "auto_deleted" || msg.isDeleted) updateData.isDeleted = true;
             }
             else if (action === "approved") updateData.isApproved = true;
             else if (action === "timeout") {
               if (msg.actionTaken === "auto_deleted" || msg.isDeleted) updateData.isDeleted = true;
             }
          }
          
          await docRef.update(updateData);
          
          const crypto = await import("crypto");
          const actionDocId = crypto.randomUUID();
          await db.collection("modActions").doc(actionDocId).set({
             serverId,
             type: action,
             timestamp: new Date().toISOString(),
             reason: reason || "Manual review via dashboard",
             userId: authorId || msg.authorId,
             moderatorId: (req as any).user.uid,
             messageId: messageId,
             channelId: channelId,
             userName: msg.authorUsername
          });
      }

      res.json(result);
    } catch (e: any) {
      if (e.message?.includes("Forbidden") || e.message?.includes("do not have permission")) {
        return res.status(403).json({ error: e.message });
      }
      if (e.message?.includes("Invalid action") || e.message?.includes("exceeds")) {
        return res.status(400).json({ error: e.message });
      }
      
      logger.error({ err: e }, "Mod action API error:");
      next(e instanceof Error ? e : new Error(String(e)));
    }
  });

  app.post("/api/train", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const isPro = await isServerPremium(req.body.serverId, db);
      if (!isPro) {
        return res.status(403).json({ error: "AI training feedback requires a Pro subscription." });
      }
      const body = req.body;
      
      if (typeof body.messageId !== "string" || !body.messageId.trim()) {
        return res.status(400).json({ error: "messageId must be a non-empty string." });
      }
      if (typeof body.serverId !== "string" || !body.serverId.trim()) {
        return res.status(400).json({ error: "serverId must be a non-empty string." });
      }
      if (!["Safe", "Spam", "Moderate", "Inappropriate", "Extreme"].includes(body.correctSeverity)) {
        return res.status(400).json({ error: "correctSeverity must be exactly one of: Safe, Spam, Moderate, Inappropriate, Extreme." });
      }
      if (typeof body.reason !== "string" || body.reason.length < 10 || body.reason.length > 500) {
        return res.status(400).json({ error: "reason must be between 10 and 500 characters." });
      }
      if (body.originalContent != null && (typeof body.originalContent !== "string" || body.originalContent.length > 5000)) {
        return res.status(400).json({ error: "originalContent must be a string up to 5000 characters." });
      }
      if (body.originalReasoning != null && (typeof body.originalReasoning !== "string" || body.originalReasoning.length > 5000)) {
        return res.status(400).json({ error: "originalReasoning must be a string up to 5000 characters." });
      }

      const autoId = crypto.randomUUID();
      await db
        .collection("trainingFeedback")
        .doc(autoId)
        .set({
          originalMessageId: body.messageId,
          originalContent: body.originalContent || "",
          originalVerdict: body.originalVerdict || "Unknown",
          originalReasoning: body.originalReasoning || "",
          correctedSeverity: body.correctSeverity,
          moderatorReason: body.reason,
          moderatorId: (req as any).user.uid,
          serverId: body.serverId,
          timestamp: FieldValue.serverTimestamp(),
          source: "dashboard",
          botResponse: null,
          processed: false,
        });

      invalidateTrainingCache(body.serverId);

      res.json({ success: true });
    } catch (e: any) {
      next(e);
    }
  });

  app.post("/api/rules/add", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const { serverId, ruleText } = req.body;
      if (!serverId || !ruleText) {
        return res.status(400).json({ error: "Missing serverId or ruleText" });
      }

      if (typeof ruleText !== "string" || ruleText.trim().length === 0) {
        return res.status(400).json({ error: "Rule text cannot be empty." });
      }
      if (ruleText.length > 2000) {
        return res.status(400).json({ error: "Rule text cannot exceed 2000 characters." });
      }
      const sanitizedRule = ruleText.trim();
      const normalizedRule = sanitizedRule.toLowerCase();
      const existingRulesSnap = await db
        .collection(`servers/${serverId}/rules`)
        .get();
      const duplicateRule = existingRulesSnap.docs.some((doc: any) => {
        const existingText = String(doc.data()?.text || "").trim().toLowerCase();
        const existingNormalizedText = String(doc.data()?.normalizedText || "").trim().toLowerCase();
        return existingText === normalizedRule || existingNormalizedText === normalizedRule;
      });
      if (duplicateRule) {
        return res.json({ success: true, duplicate: true, message: "Rule already exists." });
      }

      const ruleId = crypto.randomUUID();
      await db.collection(`servers/${serverId}/rules`).doc(ruleId).set({
        text: sanitizedRule,
        normalizedText: normalizedRule,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: (req as any).user.uid,
      });

      invalidateRulesCache(serverId);

      res.json({ success: true, message: "Rule added successfully!" });
    } catch (e: any) {
      logger.error({ err: e }, "Error adding rule:");
      next(e);
    }
  });

  app.get("/api/rule-presets", requireAuth, async (_req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const presetCollection = db.collection("rule_presets");

      await Promise.all(DEFAULT_RULE_PRESETS.map(async (preset) => {
        const ref = presetCollection.doc(preset.id);
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set({
            ...preset,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }));

      const snap = await presetCollection.orderBy("order", "asc").get();
      const presets = snap.docs
        .map((doc: any) => normalizeRulePreset({ id: doc.id, ...doc.data() }))
        .filter(Boolean);

      res.json({ presets: presets.length > 0 ? presets : DEFAULT_RULE_PRESETS });
    } catch (e: any) {
      logger.warn({ err: e }, "Failed to load rule presets; returning bundled defaults.");
      res.json({ presets: DEFAULT_RULE_PRESETS });
    }
  });

  app.post("/api/guilds/:serverId/server-type", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const { serverId } = req.params;
      const { presetId } = req.body || {};
      const preset = DEFAULT_RULE_PRESETS.find((item) => item.id === presetId);
      if (!preset) {
        return res.status(400).json({ error: "Unknown server type preset." });
      }

      await db.collection("servers").doc(serverId).set({
        serverTypePresetId: preset.id,
        serverTypeLabel: preset.label,
        serverTypeUpdatedAt: FieldValue.serverTimestamp(),
        serverTypeUpdatedBy: (req as any).user.uid,
      }, { merge: true });

      res.json({ success: true, presetId: preset.id, label: preset.label });
    } catch (e: any) {
      next(e);
    }
  });

  app.post("/api/recommendations/add", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const body = req.body;
      const recRef = db
        .collection("recommendations")
        .doc(body.recommendationId);
      const recDoc = await recRef.get();
      if (!recDoc.exists) return res.status(404).json({ error: "Not found" });

      const existingStatus = recDoc.data()?.status;
      if (existingStatus === "added") {
        return res.json({ success: true, message: "Already added." });
      }

      const recData = recDoc.data() as any;
      if (recData.serverId !== body.serverId) {
        return res.status(403).json({ error: "Forbidden: recommendation belongs to another server" });
      }
      const ruleId = crypto.randomUUID();
      await db
        .collection(`servers/${body.serverId}/rules`)
        .doc(ruleId)
        .set({
          text: recData.ruleText || "",
          createdAt: FieldValue.serverTimestamp(),
          createdBy: (req as any).user.uid,
        });

      invalidateRulesCache(body.serverId);

      if (recData.feedbackIds && Array.isArray(recData.feedbackIds)) {
        const batch = db.batch();
        for (const fId of recData.feedbackIds) {
          batch.set(
            db.collection("trainingFeedback").doc(fId),
            {
              recommendationStatus: "added",
              recommendationId: body.recommendationId,
              recommendationAppliedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        }
        await batch.commit();
        invalidateTrainingCache(body.serverId);
      }

      await recRef.update({ status: "added" });
      res.json({ success: true });
    } catch (e: any) {
      next(e);
    }
  });

  app.post(
    "/api/recommendations/dismiss",
    requireAuth, requireServerAuth,
    async (req: any, res, next: any) => {
      try {
        const db = getAdminDB();
        const body = req.body;
        const recRef = db.collection("recommendations").doc(body.recommendationId);
        const recDoc = await recRef.get();
        if (!recDoc.exists) return res.status(404).json({ error: "Not found" });
        if (recDoc.data()?.serverId !== body.serverId) {
          return res.status(403).json({ error: "Forbidden: recommendation belongs to another server" });
        }
        await recRef.update({ status: "dismissed" });
        res.json({ success: true });
      } catch (e: any) {
        next(e);
      }
    },
  );

  // --- Analytics API ---
  app.get("/api/analytics/messages", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const serverId = req.query.serverId as string;
    const periodStr = req.query.period as string;
    if (!serverId) return res.status(400).json({ error: "Missing serverId" });
    try {
      const db = getAdminDB();
      // Notice: Removed Pro restriction so that base UI and Health widgets can display message volume stats.
      
      let query: any = db.collection(`analytics/${serverId}/messages`);
      const snap = await query.get();
      let docs = snap.docs.map((d: any) => ({
        hour: d.id,
        total: d.data().total || 0,
        attachments: d.data().attachments || 0,
        channels: d.data().channels || {},
      }));

      if (periodStr && periodStr.endsWith("d")) {
        const days = parseInt(periodStr.replace("d", ""));
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().slice(0, 10);
          docs = docs.filter((d: any) => d.hour >= cutoffStr);
        }
      }
      res.json(docs);
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/analytics/members", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const serverId = req.query.serverId as string;
    const periodStr = req.query.period as string;
    if (!serverId) return res.status(400).json({ error: "Missing serverId" });
    try {
      const db = getAdminDB();
      const isPro = await isServerPremium(serverId, db);
      if (!isPro) return res.status(403).json({ error: "Analytics require a Pro subscription." });
      
      let query: any = db.collection(`analytics/${serverId}/members`);
      const snap = await query.get();
      let docs = snap.docs.map((d: any) => ({
        date: d.id,
        joins: d.data().joins || 0,
        leaves: d.data().leaves || 0,
        total: d.data().total || 0,
      }));

      if (periodStr && periodStr.endsWith("d")) {
        const days = parseInt(periodStr.replace("d", ""));
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().slice(0, 10);
          docs = docs.filter((d: any) => d.date >= cutoffStr);
        }
      }
      res.json(docs);
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/analytics/moderation", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const serverId = req.query.serverId as string;
    const periodStr = req.query.period as string;
    if (!serverId) return res.status(400).json({ error: "Missing serverId" });
    try {
      const db = getAdminDB();
      const isPro = await isServerPremium(serverId, db);
      if (!isPro) return res.status(403).json({ error: "Analytics require a Pro subscription." });
      
      let query: any = db.collection(`analytics/${serverId}/moderation`);
      if (periodStr && periodStr.endsWith("d")) {
        const days = parseInt(periodStr.replace("d", ""));
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().slice(0, 10);
          query = query.where(admin.firestore.FieldPath.documentId(), ">=", cutoffStr);
        }
      }
      const snap = await query.get();
      const docs = snap.docs.map((d: any) => ({
        date: d.id,
        ...d.data(),
      }));
      res.json(docs);
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/analytics/commands", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const serverId = req.query.serverId as string;
    const periodStr = req.query.period as string;
    if (!serverId) return res.status(400).json({ error: "Missing serverId" });
    try {
      const db = getAdminDB();
      const isPro = await isServerPremium(serverId, db);
      if (!isPro) return res.status(403).json({ error: "Analytics require a Pro subscription." });
      
      let query: any = db.collection(`analytics/${serverId}/commands`);
      if (periodStr && periodStr.endsWith("d")) {
        const days = parseInt(periodStr.replace("d", ""));
        if (!isNaN(days)) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          const cutoffStr = cutoff.toISOString().slice(0, 10);
          query = query.where(admin.firestore.FieldPath.documentId(), ">=", cutoffStr);
        }
      }
      const snap = await query.get();
      const docs = snap.docs.map((d: any) => ({
        date: d.id,
        ...d.data(),
      }));
      res.json(docs);
    } catch (e: any) {
      next(e);
    }
  });

  app.get("/api/analytics/summary", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const serverId = req.query.serverId as string;
    if (!serverId) return res.status(400).json({ error: "Missing serverId" });
    try {
      const db = getAdminDB();
      const isPro = await isServerPremium(serverId, db);
      if (!isPro) return res.status(403).json({ error: "Analytics require a Pro subscription." });

      const msgSnap = await db
        .collection(`analytics/${serverId}/messages`)
        .orderBy(admin.firestore.FieldPath.documentId(), "desc")
        .limit(24 * 7)
        .get();
      const totalMessages = msgSnap.docs.reduce(
        (a, b) => a + (b.data().total || 0),
        0,
      );

      const memSnap = await db
        .collection(`analytics/${serverId}/members`)
        .orderBy(admin.firestore.FieldPath.documentId(), "desc")
        .limit(31)
        .get();
      const lastMem = memSnap.empty ? 0 : memSnap.docs[0].data().total || 0;
      const prevMem =
        memSnap.size > 30
          ? memSnap.docs[30].data().total || 0
          : memSnap.size > 0
            ? memSnap.docs[memSnap.size - 1].data().total || 0
            : 0;

      // Fallback: If no analytics yet, try to get live count from bot
      let liveCount = lastMem;
      if (liveCount === 0) {
        const bot = getBotClient();
        if (bot?.isReady()) {
          const guild =
            bot.guilds.cache.get(serverId) ||
            (await bot.guilds.fetch(serverId).catch(() => null));
          if (guild) liveCount = guild.memberCount;
        }
      }

      return res.json({
        totalMessages7d: totalMessages,
        memberChange30d: lastMem - prevMem,
        currentMembers: liveCount,
      });
    } catch (e: any) {
      next(e);
    }
  });

  // Helper inside Node for Discord Verification
  function verifyDiscordSignature(req: any) {
    const signature = req.headers["x-signature-ed25519"] as string;
    const timestamp = req.headers["x-signature-timestamp"] as string;
    const bodyText = req.rawBody;

    if (!signature || !timestamp || !DISCORD_PUBLIC_KEY || !bodyText)
      return false;

    try {
      return nacl.sign.detached.verify(
        Buffer.from(timestamp + bodyText),
        Buffer.from(signature, "hex"),
        Buffer.from(DISCORD_PUBLIC_KEY, "hex"),
      );
    } catch (e) {
      return false;
    }
  }

  // --- API Endpoints ---
  app.post("/api/integrations/resolve", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const serverId = req.body.serverId;
      const { platform, target, action, oldId, announcementChannelId, pingRoleId, enabled, isNewTarget } = req.body;

      const isPro = await isServerPremium(serverId, db);
      if (!isPro) {
        return res.status(403).json({ error: "Integrations require a Premium subscription." });
      }

      if (action === "delete") {
        if (!oldId) return res.status(400).json({ error: "Missing oldId for delete" });
        await db.collection("servers").doc(serverId).collection("integrations").doc(oldId).delete();
        return res.json({ success: true });
      }

      if (action === "toggle") {
        if (!oldId) return res.status(400).json({ error: "Missing oldId for toggle" });
        await db.collection("servers").doc(serverId).collection("integrations").doc(oldId).update({ enabled: !!enabled });
        return res.json({ success: true });
      }

      if (!platform || !target) {
        return res.status(400).json({ error: "Missing platform or target" });
      }

      if (platform !== "youtube" && platform !== "twitch") {
        return res.status(400).json({ error: "Invalid platform" });
      }

      if (!announcementChannelId || typeof announcementChannelId !== "string" || announcementChannelId.length > 64) {
        return res.status(400).json({ error: "Invalid announcement channel." });
      }

      // Verify the selected Discord channel belongs to the authorized server and the bot can ViewChannel and SendMessages.
      try {
        const botClient = getBotClient();
        if (botClient) {
          const channel = await botClient.channels.fetch(announcementChannelId);
          if (!channel || (channel as any).guildId !== serverId) {
            return res.status(400).json({ error: "Channel not found in this server." });
          }
          const { PermissionsBitField } = await import("discord.js");
          const perms = (channel as any).permissionsFor?.(botClient.user?.id);
          if (!perms || !perms.has(PermissionsBitField.Flags.ViewChannel) || !perms.has(PermissionsBitField.Flags.SendMessages)) {
            return res.status(400).json({ error: "Bot is missing ViewChannel or SendMessages in the selected channel." });
          }
        }
      } catch (e) {
        logger.error({ err: e }, "Channel validation error:");
        return res.status(400).json({ error: "Invalid channel or missing bot permissions (View/Send)." });
      }

      if (pingRoleId) {
        try {
          const botClient = getBotClient();
          if (botClient) {
            const guild = await botClient.guilds.fetch(serverId);
            if (!guild) return res.status(400).json({ error: "Guild not found." });
            const role = await guild.roles.fetch(pingRoleId);
            if (!role) return res.status(400).json({ error: "Ping role not found in this server." });
          }
        } catch (e) {
          logger.error({ err: e }, "Role validation error:");
          return res.status(400).json({ error: "Invalid ping role." });
        }
      }

      let targetId = "";
      let targetName = "";
      let targetUrl = "";

      let skipResolution = action === "edit" && isNewTarget === false && !!oldId;
      if (skipResolution) {
        const existing = await db.collection("servers").doc(serverId).collection("integrations").doc(oldId).get();
        if (existing.exists && existing.data()!.platform === platform) {
          targetId = existing.data()!.targetId;
          targetName = existing.data()!.targetName;
          targetUrl = existing.data()!.targetUrl;
        } else {
          skipResolution = false;
        }
      }

      if (!skipResolution) {
        if (platform === "youtube") {
          const result = await SocialIntegrationService.resolveYoutubeChannelId(target);
          if (!result) return res.status(404).json({ error: "Could not find YouTube channel. Use full URL or @handle." });
          targetId = result.id;
          targetName = result.name;
          targetUrl = `https://youtube.com/channel/${result.id}`;
        } else if (platform === "twitch") {
          const twitchUser = target.replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, "").replace(/\//g, "").toLowerCase();
          const result = await SocialIntegrationService.resolveTwitchUserId(twitchUser);
          if (!result) return res.status(404).json({ error: "Could not find Twitch user." });
          targetId = result.id;
          targetName = result.name;
          targetUrl = `https://twitch.tv/${twitchUser}`;
        }
      }

      const newId = `${platform}_${targetId}`;

      // checking for duplicate
      if (action === "add" || (action === "edit" && newId !== oldId)) {
        const existing = await db.collection(`servers/${serverId}/integrations`).doc(newId).get();
        if (existing.exists) {
          return res.status(400).json({ error: "Integration for this target already exists." });
        }
      }

      const docData: any = {
        platform,
        targetId,
        targetName,
        targetUrl,
        announcementChannelId,
        enabled: !!enabled,
      };

      if (pingRoleId) docData.pingRoleId = pingRoleId;

      if (action === "add") {
        docData.createdAt = new Date().toISOString();
        const limitCheck = await db.collection("servers").doc(serverId).collection("integrations").count().get();
        const maxLimit = isPro ? 10 : 3;
        if (limitCheck.data().count >= maxLimit) {
           return res.status(400).json({ error: `Limit of ${maxLimit} integrations reached.` });
        }
      }

      await db.collection("servers").doc(serverId).collection("integrations").doc(newId).set(docData, { merge: true });

      if (action === "edit" && oldId && oldId !== newId) {
        await db.collection("servers").doc(serverId).collection("integrations").doc(oldId).delete();
      }

      return res.json({ targetId, targetName, targetUrl, id: newId });
    } catch (e: any) {
      logger.error({ err: e }, "Resolve error:");
      return next(e);
    }
  });

  app.post(
    "/api/guilds/:serverId/sync_custom_commands",
    requireAuth, requireServerAuth,
    async (req: any, res, next: any) => {
      const { serverId } = req.params;
      try {
        const db = getAdminDB();
        const isPro = await isServerPremium(serverId, db);
        if (!isPro) {
          return res.status(403).json({ error: "Custom commands require a Premium subscription." });
        }

        const snap = await db.collection(`servers/${serverId}/custom_commands`).get();
        const customCommands = snap.docs.map((d) => d.data());

        const discordJS = await import("discord.js");
        const { REST, Routes } = discordJS;
        let tokenData = process.env.DISCORD_BOT_TOKEN?.trim();
        if (tokenData && tokenData.split(".").length > 3) {
          tokenData = tokenData.split(".").slice(0, 3).join(".");
        }
        const token = tokenData ? tokenData.trim() : undefined;
        const client: any = getBotClient();
        const clientId = process.env.DISCORD_CLIENT_ID || (client?.user ? client.user.id : null);

        if (!token || token.includes("YOUR_VALUE_HERE") || !clientId || clientId.includes("YOUR_VALUE_HERE")) {
          return res.status(500).json({ error: "Discord bot credentials are not configured correctly." });
        }

        // 1. Build authoritative native SentinL command definitions
        const { buildManagedCommands } = await import("./src/utils/discordCommands.js");
        const nativeCommands = await buildManagedCommands();
        const nativeNames = new Set(nativeCommands.map(c => c.name));

        const retained: string[] = [];
        const added: string[] = [];
        const rejected: Array<{name: string, reason: string}> = [];
        const finalCustomCommands: any[] = [];
        const customNames = new Set<string>();

        // 2. Validate Custom Commands
        for (const cmd of customCommands) {
          const rawName = cmd.name || "";
          const normalizedName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, "");

          if (!normalizedName) {
            rejected.push({ name: rawName, reason: "Empty after normalization." });
            continue;
          }
          if (normalizedName.length > 32) {
             rejected.push({ name: rawName, reason: "Name exceeds 32 characters." });
             continue;
          }
          if (nativeNames.has(normalizedName)) {
            rejected.push({ name: rawName, reason: "Collides with native command." });
            continue;
          }
          if (customNames.has(normalizedName)) {
            rejected.push({ name: rawName, reason: "Duplicate custom command name." });
            continue;
          }

          const description = (cmd.description || "A custom command").substring(0, 100);

          const payload: any = {
            name: normalizedName,
            description: description,
            options: cmd.requiresUser
              ? [
                  {
                    name: "user",
                    description: "The user to target with this command",
                    type: 6, // USER type
                    required: true,
                  },
                ]
              : undefined,
          };

          if (cmd.permission === "moderator") {
            payload.default_member_permissions = "8"; // Administrator
          }

          customNames.add(normalizedName);
          finalCustomCommands.push(payload);
          added.push(normalizedName);
        }

        // Enforce Discord Limit for guild commands (100 total CHAT_INPUT).
        // Native SentinL commands are registered globally; guild scope is reserved
        // for server-specific custom commands to avoid duplicate slash commands.
        if (finalCustomCommands.length > 100) {
           return res.status(400).json({
               error: `Custom commands exceed Discord's limit of 100 per guild. (Custom valid: ${finalCustomCommands.length})` 
           });
        }

        // 3. Only register server-specific custom commands at guild scope.
        const mergedCommands = finalCustomCommands;

        const rest = new REST({ version: "10" }).setToken(token);

        logger.info(`[Discord Commands] Syncing ${mergedCommands.length} guild custom commands for server ${serverId}. Native commands remain global.`);

        try {
           const existingCommands = await rest.get(Routes.applicationGuildCommands(clientId, serverId)) as any[];
           if (existingCommands) {
               // We only retain names of our native items just to log them
               for(const ec of existingCommands) {
                  retained.push(ec.name);
               }
           }
        } catch (e) {}

        await rest.put(Routes.applicationGuildCommands(clientId, serverId), {
          body: mergedCommands,
        });

        res.json({
          success: true,
          message: `Synced ${finalCustomCommands.length} custom commands.`,
          details: {
             added,
             retained,
             rejected,
             total_merged: mergedCommands.length
          }
        });
      } catch (e: any) {
        logger.error({ err: e }, "Failed to sync custom commands:");
        return res.status(500).json({ error: e.message || "Internal Server Error" });
      }
    }
  );



  app.get("/api/download/logo", (req, res) => {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) {
      res.download(logoPath, "SentinL_Logo.png");
    } else {
      res.status(404).send("Logo not found");
    }
  });

  app.get("/api/health", (req, res) => {
    if (!startupValidation) {
        return res.status(503).json({
            status: "degraded",
            error: "Startup validation incomplete or failed",
            mode: "unknown",
            disabledFeatures: []
        });
    }

    const client = getBotClient();
    const isBotDisabled = startupValidation.disabledFeatures.includes("discord_bot");
    
    res.json({
      status: "ok",
      intentsWarning,
      mode: startupValidation.mode,
      disabledFeatures: startupValidation.disabledFeatures,
      bot: {
        ready: client?.isReady() ?? false,
        disabledReason: isBotDisabled ? "missing_discord_token" : undefined
      }
    });
  });

  app.get("/api/health/details", requireAuth, async (req: any, res: any) => {
    if (!(await isSuperAdmin((req as any).user?.uid))) return res.status(403).json({ error: "Forbidden" });
    const client = getBotClient();
    const guilds = client?.isReady() ? client.guilds.cache.map((g) => g.id) : [];
    res.json({
      status: "ok",
      bot: {
        ready: client?.isReady() ?? false,
        tag: client?.user?.tag,
        latency: client?.ws.ping,
        status: client?.ws.status,
      },
      guilds,
      intentsWarning,
      env: {
        hasToken: !!process.env.DISCORD_BOT_TOKEN,
        hasGroq: !!process.env.GROQ_API_KEY,
      },
    });
  });

  app.post("/api/bot/notify-setting", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const { serverId, type, enabled } = req.body;

    if (type === "leveling_toggle") {
      invalidateLevelingCache(serverId);
      const client = getBotClient();
      if (!client || !client.isReady()) {
        return res.status(503).json({ error: "Bot is offline" });
      }

      try {
        const guild = await client.guilds.fetch(serverId).catch(() => null);
        if (guild) {
          // Find the best channel to announce in (system channel or first general channel)
          let channel = guild.systemChannel;
          if (!channel) {
            // Find first text channel the bot can write to
            const channels = await guild.channels.fetch();
            channel = channels.find(
              (c) =>
                c &&
                c.isTextBased() &&
                c.permissionsFor(client.user!)?.has("SendMessages"),
            ) as any;
          }

          if (channel) {
            await channel.send(
              `✅ **SentinL Web Update:** Leveling system is now **${enabled ? "ENABLED" : "DISABLED"}**.`,
            );
            return res.json({ success: true, message: "Server notified" });
          }
        }
        return res.json({
          success: false,
          message: "No suitable channel found in Discord server",
        });
      } catch (err: any) {
        logger.error({ err: err }, "Notify error");
        return next(err);
      }
    }

    res.json({ success: true });
  });

  // Report API Endpoints
  app.get("/api/guilds/:serverId/reports", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const { serverId } = req.params;
    const { status } = req.query;

    try {
      const db = getAdminDB();

      let q = db
        .collection("servers")
        .doc(serverId)
        .collection("reports") as any;
      if (status) {
        q = q.where("status", "==", status);
      }

      const snapshot = await q.orderBy("timestamp", "desc").limit(100).get();
      const reports = snapshot.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || doc.data().timestamp,
      }));

      res.json({ reports });
    } catch (err: any) {
      next(err);
    }
  });

  app.get("/api/guilds/:serverId/reports-settings", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const { serverId } = req.params;
    try {
      const db = getAdminDB();
      const doc = await db
        .collection("servers")
        .doc(serverId)
        .collection("settings")
        .doc("reports")
        .get();
      res.json(
        doc.exists ? doc.data() : { cooldown: 300, notifyReporter: true },
      );
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/reports-settings", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    const { serverId } = req.params;
    const { cooldown, notifyReporter, modLogChannelId } = req.body;
    try {
      const db = getAdminDB();
      const sanitizedSettings: any = {};
      
      if (typeof cooldown === "number" && cooldown >= 0 && cooldown <= 86400) {
        sanitizedSettings.cooldown = cooldown;
      }
      if (typeof notifyReporter === "boolean") {
        sanitizedSettings.notifyReporter = notifyReporter;
      }
      if (typeof modLogChannelId === "string" && modLogChannelId.length <= 64) {
        sanitizedSettings.modLogChannelId = modLogChannelId;
      }
      
      if (Object.keys(sanitizedSettings).length === 0) {
        return res.status(400).json({ error: "No valid fields provided." });
      }

      await db
        .collection("servers")
        .doc(serverId)
        .collection("settings")
        .doc("reports")
        .set(sanitizedSettings, { merge: true });
      res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/reports/:reportId/assign", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId, reportId } = req.params;

    try {
      const db = getAdminDB();
      const reportRef = db.collection("servers").doc(serverId).collection("reports").doc(reportId);
      const reportSnap = await reportRef.get();

      if (!reportSnap.exists) {
        return res.status(404).json({ error: "Report not found" });
      }

      const reportData = reportSnap.data() || {};
      if (reportData.status && reportData.status !== "pending") {
        return res.status(400).json({ error: "Only pending reports can be assigned." });
      }

      const moderator = await getDashboardModeratorIdentity(req, serverId, db);
      const conflictName = getReportAssignmentConflict(reportData, req.user.uid, moderator.discordId);
      if (conflictName) {
        return res.status(423).json({
          error: `This report is already assigned to ${conflictName}. You can view it, but only the assigned moderator can take action.`,
        });
      }

      await reportRef.set(
        {
          assigneeId: moderator.id,
          assigneeName: moderator.name,
          assigneeAvatar: moderator.avatarUrl,
          assigneeDiscordId: moderator.discordId,
          assignedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      const serverSnap = await db.collection("servers").doc(serverId).get();
      let logChannelId = serverSnap.data()?.logChannelId;
      if (!logChannelId) {
        const reportSettingsSnap = await db
          .collection("servers")
          .doc(serverId)
          .collection("settings")
          .doc("reports")
          .get();
        logChannelId = reportSettingsSnap.data()?.modLogChannelId || reportSettingsSnap.data()?.logChannelId;
      }
      const client = getBotClient();
      if (client && client.isReady?.() && logChannelId) {
        try {
          const channel =
            client.channels.cache.get(logChannelId) ||
            (await client.channels.fetch(logChannelId).catch(() => null));
          if (channel && channel.isTextBased()) {
            const { EmbedBuilder } = await import("discord.js");
            const assigneeText = moderator.discordId
              ? `<@${moderator.discordId}>`
              : moderator.name;
            const embed = new EmbedBuilder()
              .setTitle("Report Claimed")
              .setDescription(`${assigneeText} is now handling report \`${reportId}\`.`)
              .setColor(0xff6f61)
              .addFields(
                {
                  name: "Reported User",
                  value: reportData.reportedUserId ? `<@${reportData.reportedUserId}>` : "Unknown",
                  inline: true,
                },
                {
                  name: "Reporter",
                  value: reportData.reporterId ? `<@${reportData.reporterId}>` : "Unknown",
                  inline: true,
                },
              )
              .setFooter(getSentinLProtectedFooter())
              .setTimestamp(new Date());
            await channel.send({ embeds: [embed], allowedMentions: { users: moderator.discordId ? [moderator.discordId] : [] } });
          }
        } catch (err) {
          logger.warn({ err, serverId, reportId }, "Failed to send report assignment notification");
        }
      }

      res.json({ success: true, assignee: moderator });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/reports/:reportId/archive", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId, reportId } = req.params;

    try {
      const db = getAdminDB();
      const reportRef = db.collection("servers").doc(serverId).collection("reports").doc(reportId);
      
      const docSnap = await reportRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: "Report not found" });
      }

      const reportData = docSnap.data();
      const moderator = await getDashboardModeratorIdentity(req, serverId, db);
      const conflictName = getReportAssignmentConflict(reportData, req.user.uid, moderator.discordId);
      if (conflictName) {
        return res.status(423).json({
          error: `This report is assigned to ${conflictName}. You can view it, but only the assigned moderator can archive it.`,
        });
      }

      // Update the report to archived
      await reportRef.update({
        status: "archived",
        updatedAt: new Date().toISOString()
      });

      // Write an audit log
      const crypto = await import("crypto");
      const actionDocId = crypto.randomUUID();
      await db.collection("modActions").doc(actionDocId).set({
        serverId,
        type: "archive_report",
        timestamp: new Date().toISOString(),
        reason: "Report archived via dashboard",
        userId: reportData?.reporterId || "unknown", // Using reporterId or target user depending on data model, let's use reporter for now or a generic one
        moderatorId: req.user.uid,
        messageId: reportData?.messageId || null,
        channelId: reportData?.channelId || null,
        userName: reportData?.reporterUsername || "unknown"
      });

      res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  // --- AI Moderation Settings Endpoints ---

  app.get("/api/guilds/:serverId/moderation-settings", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;

    try {
      const db = getAdminDB();

      const doc = await db
        .collection("servers")
        .doc(serverId)
        .get();
      
      res.json({
        confidenceThreshold: doc.exists ? (doc.data()?.confidenceThreshold ?? 80) : 80,
        autoDelete: doc.exists ? (doc.data()?.autoDelete ?? false) : false
      });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/moderation-settings", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;
    const { confidenceThreshold, autoDelete } = req.body;

    try {
      const db = getAdminDB();

      await db
        .collection("servers")
        .doc(serverId)
        .set({
          confidenceThreshold: typeof confidenceThreshold === 'number' ? confidenceThreshold : 80,
          autoDelete: typeof autoDelete === 'boolean' ? autoDelete : false,
          updatedBy: (req as any).user.uid,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

      res.json({ success: true });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/moderation/test-scan", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;

    try {
      const db = getAdminDB();
      const serverRef = db.collection("servers").doc(serverId);
      const [serverSnap, rulesSnap] = await Promise.all([
        serverRef.get(),
        serverRef.collection("rules").limit(25).get(),
      ]);

      const serverData = serverSnap.exists ? serverSnap.data() || {} : {};
      const keywords = Array.isArray(serverData.keywords)
        ? serverData.keywords.filter((keyword: unknown) => typeof keyword === "string")
        : [];
      const rulesText = rulesSnap.docs
        .map((ruleDoc: any) => {
          const data = ruleDoc.data() || {};
          return [data.text, data.rule, data.description, data.name]
            .filter((value) => typeof value === "string" && value.trim())
            .join(" ");
        })
        .filter(Boolean)
        .join("\n");

      const samples = [
        {
          label: "Normal chat message",
          text: "I updated the channel notes and will check the rest of the settings after lunch.",
        },
        {
          label: "Clearly dangerous message",
          text: "go die",
        },
        {
          label: "Sarcastic or hostile message",
          text: "Congratulations, that somehow made things worse.",
        },
        {
          label: "Suspicious invite link",
          text: "join my server discord.gg/example right now",
        },
      ];

      const results = samples.map((sample) => {
        const metadata = {
          rulesText,
          keywords,
          isReply: false,
          hasMention: false,
        };
        const safeBypass = shouldBypassClearlySafeLongMessage(sample.text, metadata);
        const highRisk = containsHighRiskSignal(sample.text);
        const localRisk = hasLocalStructuralModerationRisk(sample.text, metadata);

        if (safeBypass.bypass) {
          return {
            label: sample.label,
            outcome: "Allowed",
            reason: "SentinL would treat this as ordinary conversation and avoid spending an AI check.",
          };
        }

        if (highRisk) {
          return {
            label: sample.label,
            outcome: "Flagged",
            reason: "SentinL would catch this immediately because it contains a clear safety risk.",
          };
        }

        if (localRisk) {
          return {
            label: sample.label,
            outcome: "Reviewed",
            reason: "SentinL would slow down and review this more carefully because it may be sarcastic, hostile, or against your rules.",
          };
        }

        return {
          label: sample.label,
          outcome: "AI Review",
          reason: "SentinL would ask the AI model to decide because this sample needs more judgment.",
        };
      });

      await serverRef.set({
        botTested: true,
        lastOnboardingTestScanAt: FieldValue.serverTimestamp(),
        lastOnboardingTestScanBy: (req as any).user.uid,
      }, { merge: true });

      res.json({
        success: true,
        dryRun: true,
        aiCallsUsed: 0,
        results,
      });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/onboarding/completion", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;
    const mode = req.body?.mode === "skip" ? "skip" : "finish";

    try {
      const db = getAdminDB();
      await db.collection("servers").doc(serverId).set({
        onboarding: {
          firstRunCompleted: true,
          completedAt: FieldValue.serverTimestamp(),
          completedBy: (req as any).user.uid || "unknown",
          completionMode: mode,
        },
      }, { merge: true });

      res.json({ success: true, mode });
    } catch (err: any) {
      next(err);
    }
  });

  app.get("/api/guilds/:serverId/appeals", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;
    try {
      const db = getAdminDB();
      // Fetch cases where status is appealed OR appealStatus is submitted
      // Wait, Firestore doesn't support an OR operator easily without two queries or 'in' arrays, so we can fetch all open/appealed cases.
      const casesRef = db.collection(`servers/${serverId}/moderationCases`);
      const snap = await casesRef.where("appealStatus", "in", ["submitted", "upheld", "overturned"]).limit(100).get();
      
      const appeals = snap.docs.map((d) => d.data());
      appeals.sort((a: any, b: any) => {
        const tA = a.appealSubmittedAt?.toMillis?.() || 0;
        const tB = b.appealSubmittedAt?.toMillis?.() || 0;
        return tB - tA;
      });
      // Reorder or filter on client side if needed, but we'll return these.
      res.json({ appeals });
    } catch (err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/appeals/:caseId/:action", requireAuth, requireServerAuth, async (req: any, res: any, next: any) => {
    const { serverId, caseId, action } = req.params;
    const { reviewNote } = req.body;
    try {
      if (action !== "uphold" && action !== "overturn") {
        return res.status(400).json({ error: "Invalid appeal action. Must be 'uphold' or 'overturn'." });
      }

      if (reviewNote !== undefined && (typeof reviewNote !== "string" || reviewNote.length > 1000)) {
        return res.status(400).json({ error: "reviewNote must be a string up to 1000 characters." });
      }

      const db = getAdminDB();
      const { authorizeAppealReview } = await import("./src/utils/modAuth.js");
      await authorizeAppealReview((req as any).user.uid, (req as any).user.email, serverId, db);

      const caseRef = db.collection(`servers/${serverId}/moderationCases`).doc(caseId);
      
      let caseData: any = null;
      let shouldNotifyUser = false;
      let overturnTimeout = false;

      await db.runTransaction(async (t) => {
        const caseSnap = await t.get(caseRef);
        
        if (!caseSnap.exists) {
          throw new Error("Case not found");
        }

        caseData = caseSnap.data()!;
        
        if (caseData.appealStatus !== "submitted") {
          throw Object.assign(new Error("Case is not currently submitted for appeal or already decided."), { status: 400 });
        }
        
        const updateData: any = {
          status: action === "uphold" ? "upheld" : "overturned",
          appealStatus: action === "uphold" ? "upheld" : "overturned",
          reviewedBy: (req as any).user.uid,
          reviewedAt: FieldValue.serverTimestamp(),
        };
        
        if (reviewNote !== undefined) updateData.reviewNote = reviewNote;

        t.update(caseRef, updateData);
        
        // Audit record
        const auditRef = db.collection(`servers/${serverId}/auditLogs`).doc();
        t.set(auditRef, {
             type: "APPEAL_REVIEW",
             caseId,
             action,
             moderatorId: (req as any).user.uid,
             timestamp: FieldValue.serverTimestamp()
        });

        shouldNotifyUser = true;

        if (action === "overturn" && caseData.actionTaken === "timeout" && caseData.userId) {
             overturnTimeout = true;
        }
      });
      
      if (action === "overturn") {
         try {
             await db.collection("servers").doc(serverId).collection("feedback").add({
                 messageId: caseData.messageId || "",
                 originalAction: caseData.actionTaken,
                 reason: caseData.reason,
                 correction: action,
                 reviewer: (req as any).user.uid,
                 timestamp: FieldValue.serverTimestamp()
             });
         } catch(e) {}
      }

      let timeoutRemoved = false;
      if (overturnTimeout) {
         try {
             const botClient = getBotClient();
             if (botClient) {
                const guild = await botClient.guilds.fetch(serverId).catch(() => null);
                if (guild) {
                    const member = await guild.members.fetch(caseData.userId).catch(() => null);
                    if (member) {
                        await member.timeout(null, "Appeal overturned");
                        timeoutRemoved = true;
                    }
                }
             }
         } catch (e) {
             logger.error(e, "Failed to overturn timeout");
         }
      }

      // Notify user via Discord
      if (shouldNotifyUser) {
        try {
           const botClient = getBotClient();
           if (botClient) {
               const userObj = await botClient.users.fetch(caseData.userId).catch(() => null);
               if (userObj) {
                    let resultText = action === "uphold" ? "Staff decided the original action was correct." : "The moderation decision was overturned.";
                    if (action === "overturn" && caseData.actionTaken === "message_deleted") {
                        resultText += " Note that Discord does not allow SentinL to restore deleted messages.";
                    }
                    if (timeoutRemoved) {
                        resultText += " Your timeout has been removed.";
                    }
                    await userObj.send({
                      content: `Your appeal for case **${caseId}** was reviewed. ${resultText}`,
                      allowedMentions: { parse: [] }
                    }).catch(() => null);
               }
           }
        } catch (e) {
           logger.error({ err: e }, "Failed to notify user:");
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      if (e.message?.includes("Case not found") || e.message?.includes("already decided")) {
         return res.status(400).json({ error: e.message });
      }
      if (e.message?.includes("Forbidden") || e.message?.includes("do not have permission")) {
        return res.status(403).json({ error: e.message });
      }
      if (e.message?.includes("Invalid action") || e.message?.includes("exceeds")) {
        return res.status(400).json({ error: e.message });
      }
      next(e);
    }
  });

  app.post("/api/guilds/:serverId/reaction-roles", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const serverId = req.params.serverId;
      const { channelId, title, mappings } = req.body;

      if (!mappings || !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 5) {
        return res.status(400).json({ error: "Mappings must be an array with 1 to 5 entries." });
      }

      if (title && (typeof title !== "string" || title.length > 256)) {
        return res.status(400).json({ error: "Title must be under 256 characters." });
      }

      const roleIds = new Set();
      for (const m of mappings) {
        if (!m.roleId) return res.status(400).json({ error: "Missing roleId in mappings." });
        if (roleIds.has(m.roleId)) return res.status(400).json({ error: "Duplicate role IDs are not allowed." });
        roleIds.add(m.roleId);
        
        if (m.label && (typeof m.label !== "string" || m.label.length > 80)) {
          return res.status(400).json({ error: "Label must be under 80 characters." });
        }
      }

      const client = getBotClient();
      if (!client || !client.isReady()) return res.status(503).json({ error: "Bot not ready" });

      const guild = await client.guilds.fetch(serverId).catch(() => null);
      if (!guild) return res.status(404).json({ error: "Server not found" });

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.guildId !== serverId || !channel.isTextBased()) {
         return res.status(400).json({ error: "Invalid channel, or channel does not belong to this server." });
      }

      const me = guild.members.me;
      if (!me) return res.status(500).json({ error: "Bot member not found in guild." });

      const channelPerms = me.permissionsIn(channel);
      if (!channelPerms.has("ViewChannel") || !channelPerms.has("SendMessages") || !channelPerms.has("EmbedLinks") || !channelPerms.has("ReadMessageHistory")) {
         return res.status(400).json({ error: "Bot missing required permissions in channel: ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory." });
      }
      if (!me.permissions.has("ManageRoles")) {
         return res.status(400).json({ error: "Bot missing required guild permission: ManageRoles." });
      }

      for (const m of mappings) {
        const role = guild.roles.cache.get(m.roleId) || await guild.roles.fetch(m.roleId).catch(() => null);
        if (!role || role.guild.id !== serverId) {
           return res.status(400).json({ error: `Role ${m.roleId} is invalid or doesn't belong to this server.` });
        }
        if (role.managed || role.id === guild.id || me.roles.highest.comparePositionTo(role) <= 0) {
           return res.status(400).json({ error: `Cannot assign role ${role.name}. It must not be managed, @everyone, and must be below the bot's highest role.` });
        }
      }

      const db = getAdminDB();
      const isPremium = await isServerPremium(serverId, db);
      const serverDocRef = db.collection("servers").doc(serverId);

      const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = await import("discord.js");
      
      const panelId = "rr-" + crypto.randomUUID().replace(/-/g, "").substring(0, 12);
      
      const row = new ActionRowBuilder();
      for (const m of mappings) {
        let button = new ButtonBuilder().setCustomId(`rrbtn_${panelId}_${m.roleId}`).setStyle(ButtonStyle.Secondary);
        let emojiSet = false;
        
        if (m.emoji) {
            try {
                button = button.setEmoji(m.emoji);
                emojiSet = true;
            } catch(e) {
                // Ignore invalid emojis here to prevent crash
            }
        }
        
        const rName = guild.roles.cache.get(m.roleId)?.name || "Role";
        const labelStr = m.label || (!emojiSet && m.emoji ? m.emoji : null) || (!emojiSet ? rName : null);
        
        if (labelStr) {
            try {
                button = button.setLabel(labelStr.substring(0, 80));
            } catch(e) {}
        }
        
        row.addComponents(button);
      }

      const embed = new EmbedBuilder()
        .setTitle(title || "Reaction Roles")
        .setDescription("Click the buttons below to receive or remove roles.")
        .setColor(0x3498db);

      const msg = await (channel as any).send({ embeds: [embed], components: [row] });

      const newPanel = {
        id: panelId,
        channelId: channel.id,
        messageId: msg.id,
        title,
        mappings,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await db.runTransaction(async (t: any) => {
          const snap = await t.get(serverDocRef);
          const reactionRolesList = snap.data()?.reactionRoles || [];
          if (!isPremium && reactionRolesList.length >= 5) {
             throw new Error("Free tier is limited to 5 Reaction Role panels. Please upgrade to Pro for unlimited panels.");
          }
          reactionRolesList.push(newPanel);
          t.set(serverDocRef, { reactionRoles: reactionRolesList }, { merge: true });
        });
        res.json({ success: true, panel: newPanel });
      } catch (err: any) {
        await msg.delete().catch(() => null);
        throw err;
      }
    } catch (e: any) {
      if (e.message?.includes("Free tier is limited")) {
         return res.status(403).json({ error: e.message });
      }
      logger.error({ err: e }, "Failed to create reaction role:");
      next(e);
    }
  });

  app.delete("/api/guilds/:serverId/reaction-roles/:panelId", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const serverId = req.params.serverId;
      const panelId = req.params.panelId;
      
      const db = getAdminDB();
      const serverDocRef = db.collection("servers").doc(serverId);

      let panelToDelete: any = null;
      await db.runTransaction(async (t: any) => {
         const snap = await t.get(serverDocRef);
         const rrList = snap.data()?.reactionRoles || [];
         panelToDelete = rrList.find((p: any) => p.id === panelId);
      });

      if (panelToDelete) {
         try {
             // 1. Delete Discord Message outside transaction
             const client = getBotClient();
             if (client && client.isReady()) {
                 const guild = await client.guilds.fetch(serverId).catch(() => null);
                 if (guild) {
                     const channel: any = await guild.channels.fetch(panelToDelete.channelId).catch(() => null);
                     if (channel) {
                        const msg = await channel.messages.fetch(panelToDelete.messageId).catch(() => null);
                        if (msg) {
                            await msg.delete().catch((err: any) => {
                                // Treat 403 / 404 as skip / failure logs
                                if (err.status !== 404) {
                                    throw err;
                                }
                            });
                        }
                     }
                 }
             }

             // 2. Finalize
             await db.runTransaction(async (t: any) => {
                 const snap = await t.get(serverDocRef);
                 const rrList = snap.data()?.reactionRoles || [];
                 const panelIndex = rrList.findIndex((p: any) => p.id === panelId);
                 if (panelIndex > -1) {
                     rrList.splice(panelIndex, 1);
                     t.set(serverDocRef, { reactionRoles: rrList }, { merge: true });
                 }
             });
         } catch(err: any) {
             logger.error({ err: err }, "Failed to delete original Discord message or update DB");
             return res.status(500).json({ error: "Failed to delete message on Discord: " + err.message });
         }
      }
      
      res.json({ success: true });
    } catch (e: any) {
      logger.error({ err: e }, "Failed to delete reaction role:");
      next(e);
    }
  });



  app.post("/api/guilds/:serverId/giveaways/start", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res: any, next: any) => {
    const { serverId } = req.params;
    const { prize, channelId, winnersCount, durationHours, requirements } = req.body;
    const userId = (req as any).user.uid;

    if (!prize || typeof prize !== "string" || prize.trim().length === 0 || prize.length > 200) {
      return res.status(400).json({ error: "Prize is required and must be under 200 characters." });
    }
    
    // requirements is now a requiredRoleId
    let requiredRoleId: string | null = null;
    if (requirements && typeof requirements === "string") {
      requiredRoleId = requirements.trim();
      if (requiredRoleId.length > 30) {
         return res.status(400).json({ error: "Invalid role ID." });
      }
    }
    
    if (!channelId || typeof channelId !== "string") {
      return res.status(400).json({ error: "Channel ID is required." });
    }
    const parsedDuration = Number(durationHours);
    if (isNaN(parsedDuration) || parsedDuration <= 0 || parsedDuration > 720) {
      return res.status(400).json({ error: "Duration must be a positive number between 1 and 720 hours." });
    }
    const parsedWinners = Number(winnersCount) || 1;
    if (parsedWinners < 1 || parsedWinners > 20) {
      return res.status(400).json({ error: "Winners count must be between 1 and 20." });
    }

    try {
      const db = getAdminDB();
      const modSnap = await db.collection("moderators").doc((req as any).user.email).get();
      const discordId = modSnap.data()?.discordId || null;
      const hostedByMention = discordId ? `<@${discordId}>` : (req as any).user.email;

      // Verify server has pro or premium tier
      let isPremium = await isServerPremium(serverId, db);

      if (!isPremium) {
        // Check user subscription as fallback (in case they haven't explicitly linked it but own it)
        const userSub = await db.collection("subscriptions").doc(userId).get();
        const userTier = userSub.data()?.accessTier;
        const isSubActive = userSub.data()?.status === "active" || userSub.data()?.status === "trial";
        const isPremiumUser = isSubActive && (userTier === "pro_1" || userTier === "pro_3" || userTier === "premium");
        if (!isPremiumUser) {
          return res.status(403).json({ error: "Giveaways require a Pro or Premium subscription." });
        }
      }

      await checkServerAuth((req as any).user?.uid, (req as any).user?.email, serverId, db);

      // Verify channel and role with Discord client
      const botClient = getBotClient();
      if (!botClient || !botClient.isReady()) {
         return res.status(500).json({ error: "Bot is offline." });
      }
      
      const guild = await botClient.guilds.fetch(serverId).catch(() => null);
      if (!guild) {
         return res.status(404).json({ error: "Server not found in bot cache." });
      }

      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.guildId !== serverId || !channel.isTextBased()) {
         return res.status(400).json({ error: "Invalid channel, or channel does not belong to this server." });
      }

      // Verify the bot can ViewChannel, SendMessages, EmbedLinks
      const perms = guild.members.me?.permissionsIn(channel);
      if (!perms || !perms.has("ViewChannel") || !perms.has("SendMessages") || !perms.has("EmbedLinks")) {
         return res.status(400).json({ error: "Bot missing required permissions in this channel (ViewChannel, SendMessages, EmbedLinks)." });
      }

      if (requiredRoleId) {
         const role = await guild.roles.fetch(requiredRoleId).catch(() => null);
         if (!role || role.guild.id !== serverId) {
             return res.status(400).json({ error: "Invalid required role, or role does not belong to this server." });
         }
      }

      const endsAt = new Date(Date.now() + parsedDuration * 60 * 60 * 1000);
      const endsAtUnix = Math.floor(endsAt.getTime() / 1000);

      let desc = "**Click the button below to enter!**\n\n";
      desc += `**Ends:** <t:${endsAtUnix}:R> (<t:${endsAtUnix}:F>)\n`;
      desc += `**Hosted by:** ${hostedByMention}\n`;
      desc += `**Winners:** ${parsedWinners}`;

      if (requiredRoleId) {
        desc += `\n**Requirements:** Must have <@&${requiredRoleId}> role`;
      }

      const msgData = await channel.send({
        content: "🎉 **GIVEAWAY** 🎉",
        embeds: [{
          title: prize,
          description: desc,
          color: 0x5865F2,
          timestamp: new Date().toISOString()
        }],
        components: [{
          type: 1,
          components: [{
             type: 2,
             style: 1,
             label: "Enter Giveaway!",
             emoji: { name: "🎉" },
             customId: "ga_enter"
          }]
        }] as any
      });

      const messageId = msgData.id;

      // Save to Firebase
      await db.collection("servers").doc(serverId).collection("giveaways").doc(messageId).set({
        serverId,
        createdByDiscordId: discordId || null,
        prize,
        winnersCount: parsedWinners,
        durationHours: parsedDuration,
        channelId,
        requiredRoleId: requiredRoleId || null,
        status: "active",
        createdAt: FieldValue.serverTimestamp(),
        endsAt: endsAt.toISOString(),
        participantsCount: 0
      });

      res.json({ success: true, messageId });
    } catch (err: any) {
      logger.error(err);
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/giveaways/:giveawayId/end", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res: any, next: any) => {
    const { serverId, giveawayId } = req.params;

    try {
      const db = getAdminDB();
      const docRef = db.collection("servers").doc(serverId).collection("giveaways").doc(giveawayId);

      let tokenData = process.env.DISCORD_BOT_TOKEN?.trim();
      if (tokenData && tokenData.split(".").length > 3) {
        tokenData = tokenData.split(".").slice(0, 3).join(".");
      }
      const BOT_TOKEN = tokenData ? tokenData.trim() : "";

      const winners = await processGiveaway(db, docRef, BOT_TOKEN);

      res.json({ success: true, winners });
    } catch (err: any) {
      if (err.message.includes("Giveaway not found") || err.message.includes("Giveaway is not active") || err.message.includes("Giveaway already ended")) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });



  app.delete("/api/guilds/:serverId/giveaways/:giveawayId", requireAuth, requireServerAuth, mutationLimiter, async (req: any, res: any, next: any) => {
    const { serverId, giveawayId } = req.params;

    try {
      const db = getAdminDB();
      const docRef = db.collection("servers").doc(serverId).collection("giveaways").doc(giveawayId);
      
      let data: any = null;
      await db.runTransaction(async (t) => {
          const docSnap = await t.get(docRef);
          if (!docSnap.exists) {
              throw new Error("Giveaway not found.");
          }
          data = docSnap.data()!;
          if (data.status === "cancelled" || data.status === "ended") {
              throw new Error(`Giveaway already ${data.status}.`);
          }
          t.update(docRef, { status: "cancelled" });
      });

      const channelId = data.channelId;
      
      let tokenData = process.env.DISCORD_BOT_TOKEN?.trim();
      if (tokenData && tokenData.split(".").length > 3) {
        tokenData = tokenData.split(".").slice(0, 3).join(".");
      }
      const BOT_TOKEN = tokenData ? tokenData.trim() : undefined;

      let disableFailed = false;
      if (BOT_TOKEN && channelId) {
         try {
             const patchReq = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${giveawayId}`, {
               method: 'PATCH',
               headers: {
                 'Authorization': `Bot ${BOT_TOKEN}`,
                 'Content-Type': 'application/json'
               },
               body: JSON.stringify({
                 components: [],
                 embeds: [{
                   title: data.prize || "Giveaway",
                   description: "Giveaway canceled.",
                   color: 0xED4245,
                   timestamp: new Date().toISOString()
                 }]
               })
             });
             
             if (!patchReq.ok && patchReq.status !== 404) {
                 disableFailed = true;
             }
         } catch(e) {
             disableFailed = true;
         }
      }

      if (!disableFailed) {
         // Finalize (could delete, but keeping as tombstone ensures 404 buttons don't fire erroneously).
         await docRef.update({ deleted: true }); // Mark logically deleted
      }

      res.json({ success: true });
    } catch (err: any) {
      if (err.message === "Giveaway not found.") {
        return res.status(404).json({ error: err.message });
      }
      if (err.message.startsWith("Giveaway already")) {
        return res.status(400).json({ error: err.message });
      }
      logger.error(err);
      next(err);
    }
  });

  app.post(
    "/api/guilds/:serverId/reports/:reportId/resolve",
    requireAuth, requireServerAuth,
    async (req, res, next: any) => {
      const { serverId, reportId } = req.params;
      const { action, reason, duration } = req.body;

      try {
        const db = getAdminDB();
        const reportRef = db.collection("servers").doc(serverId).collection("reports").doc(reportId);
        const reportSnap = await reportRef.get();
        if (!reportSnap.exists) {
          return res.status(404).json({ error: "Report not found" });
        }

        const moderator = await getDashboardModeratorIdentity(req, serverId, db);
        const conflictName = getReportAssignmentConflict(reportSnap.data(), (req as any).user.uid, moderator.discordId);
        if (conflictName) {
          return res.status(423).json({
            error: `This report is assigned to ${conflictName}. You can view it, but only the assigned moderator can take action.`,
          });
        }

        const { authorizeModAction } = await import("./src/utils/modAuth.js");
        await authorizeModAction((req as any).user.uid, serverId, action, db, reason, duration, true);

        const result = await resolveUserReport(
          serverId,
          reportId,
          action,
          reason,
          (req as any).user.uid,
          duration,
        );
        res.json(result);
      } catch (e: any) {
        if (e.message?.includes("Forbidden") || e.message?.includes("do not have permission")) {
          return res.status(403).json({ error: e.message });
        }
        if (e.message?.includes("Invalid action") || e.message?.includes("exceeds")) {
          return res.status(400).json({ error: e.message });
        }
        if (
          e.message?.includes("Cannot mute") ||
          e.message?.includes("Cannot warn") ||
          e.message?.includes("not attached to a specific message") ||
          e.message?.includes("reported message") ||
          e.message?.includes("cannot delete this message") ||
          e.message?.includes("role hierarchy") ||
          e.message?.includes("Cannot send messages") ||
          e.message?.includes("Missing Permissions") ||
          e.message?.includes("Unknown Message") ||
          e.message?.includes("Unknown Channel")
        ) {
          return res.status(400).json({ error: e.message });
        }
        logger.error({ err: e }, "Resolve report API error:");
        next(e);
      }
    },
  );

  app.post("/api/create-razorpay-order", requireAuth, mutationLimiter, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const deps = {
        checkServerAuth,
        getAdminDB: () => db,
        razorpayConfigured: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
      };

      const result = await validateCreateOrderRequest(req, deps);
      if (result.error) {
        return res.status(result.status || 400).json({ error: result.error });
      }

      const { serverId, userId } = req.body;
      const plan = result.realPlan;

      const razorpay = new Razorpay({
        key_id: RAZORPAY_KEY_ID as string,
        key_secret: RAZORPAY_KEY_SECRET as string,
      });

      const options = {
        amount: result.amountCents,
        currency: "USD",
        receipt: `receipt_${serverId}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        notes: { serverId, userId, plan },
      };

      const order = await razorpay.orders.create(options);
      res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: RAZORPAY_KEY_ID,
      });
    } catch (error: any) {
      next(error);
    }
  });



  app.post("/api/verify-razorpay-payment", requireAuth, async (req: any, res, next: any) => {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: "Payment system not configured." });
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || typeof razorpay_signature !== "string") {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    try {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      let isValidSig = false;
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(razorpay_signature as string, 'utf8');
      if (expectedBuf.length === signatureBuf.length) {
         isValidSig = crypto.timingSafeEqual(expectedBuf, signatureBuf);
      }

      if (isValidSig) {
        // Payment genuine - let's update DB
        const razorpay = new Razorpay({
          key_id: RAZORPAY_KEY_ID,
          key_secret: RAZORPAY_KEY_SECRET,
        });
        const [order, payment] = await Promise.all([
          razorpay.orders.fetch(razorpay_order_id),
          razorpay.payments.fetch(razorpay_payment_id)
        ]);

        const orderNotes = order.notes as any;
        if (orderNotes?.userId && orderNotes.userId !== (req as any).user.uid) {
          return res.status(403).json({ error: "Forbidden: Payment does not belong to this user." });
        }

        const notes = order.notes || {};
        const serverId = notes.serverId;
        const plan = notes.plan;
        const userId = notes.userId;

        try {
          const isDuplicate = await processIdempotentRazorpayPayment(getAdminDB(), {
            paymentId: payment.id,
            orderId: payment.order_id,
            expectedOrderId: razorpay_order_id,
            userId: userId as string,
            serverId: serverId as string,
            plan: plan as string,
            amount: Number(payment.amount),
            currency: payment.currency as string,
            status: payment.status as string,
            source: "frontend_verify"
          });

          if (isDuplicate) {
            return res.json({ success: true, message: "Payment already processed." });
          }
          return res.json({ success: true });
        } catch (err: any) {
          return res.status(400).json({ success: false, error: err.message || "Invalid payment metadata." });
        }
      } else {
        res.status(400).json({ success: false, error: "Invalid signature" });
      }
    } catch (error: any) {
      logger.error({ err: error }, "verify-razorpay-payment error");
      next(error);
    }
  });

  app.post("/api/start-trial", requireAuth, async (req: any, res: any, next: any) => {
    const { serverId } = req.body;
    const userId = (req as any).user.uid;
    const email = (req as any).user.email;

    if (!serverId) return res.status(400).json({ error: "No server ID provided" });

    try {
      const db = getAdminDB();
      const isAuth = await checkServerAuth(userId, email, serverId, db);
      if (!isAuth) return res.status(403).json({ error: "Unauthorized" });

      const { isServerPremium, startTrial } = await import("./src/utils/entitlements.js");
      const alreadyPremium = await isServerPremium(serverId, db);
      if (alreadyPremium) {
        return res.status(400).json({ error: "This server already has premium features active or is linked to an active subscription." });
      }

      await startTrial(userId, serverId, 14 * 24 * 60 * 60 * 1000, db);

      res.json({ success: true, tier: "pro_1", message: "Trial started successfully. Enjoy your 14 days of Pro features!" });
    } catch (error: any) {
      logger.error({ err: error }, "Error starting trial:");
      res.status(400).json({ error: error.message || "Failed to start trial." });
    }
  });

  app.post("/api/webhooks/razorpay", async (req: any, res, next: any) => {
    if (isPlaceholderSecret(RAZORPAY_WEBHOOK_SECRET, "RAZORPAY_WEBHOOK_SECRET")) {
      logger.error("[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is missing or unsafe. Rejecting all webhook calls.");
      return res.status(503).send("Webhook not configured");
    }
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      logger.error("[Razorpay Webhook] Razorpay API credentials are not set. Rejecting all webhook calls.");
      return res.status(503).send("Webhook not configured");
    }
    try {
      const signature = req.headers["x-razorpay-signature"];
      if (!signature || typeof signature !== "string") {
        return res.status(400).send("No signature found");
      }

      // Check signature
      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
        .update(req.rawBody)
        .digest("hex");

      let isValidSig = false;
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const signatureBuf = Buffer.from(signature as string, 'utf8');
      if (expectedBuf.length === signatureBuf.length) {
         isValidSig = crypto.timingSafeEqual(expectedBuf, signatureBuf);
      }

      if (!isValidSig) {
        logger.warn("[Razorpay Webhook] Invalid signature");
        return res.status(400).send("Invalid signature");
      }

      const event = req.body.event;
      const payload = req.body.payload;
      const db = getAdminDB();

      logger.info(`[Razorpay Webhook] Received Event: ${event}`);

      switch (event) {
        case "subscription.charged":
        case "subscription.renewed":
        case "payment.captured":
        case "order.paid": {
          // Handle successful payment or renewal
          const payment = payload.payment?.entity;
          const order = payload.order?.entity;
          
          if (!payment) {
             logger.info("[Razorpay Webhook] Missing payment entity. Skipping.");
             break;
          }

          const razorpay = new Razorpay({
            key_id: RAZORPAY_KEY_ID,
            key_secret: RAZORPAY_KEY_SECRET,
          });

          const verifiedPayment = await razorpay.payments.fetch(payment.id);
          const verifiedOrder = verifiedPayment?.order_id
            ? await razorpay.orders.fetch(verifiedPayment.order_id).catch(() => null)
            : (order?.id ? await razorpay.orders.fetch(order.id).catch(() => null) : null);

          if (!verifiedPayment || verifiedPayment.status !== "captured") {
            logger.warn("[Razorpay Webhook] Payment was not confirmed as captured by Razorpay API.");
            return res.status(400).send("Payment not captured");
          }
          if (order?.id && verifiedPayment.order_id && order.id !== verifiedPayment.order_id) {
            logger.warn("[Razorpay Webhook] Webhook order does not match verified payment order.");
            return res.status(400).send("Order mismatch");
          }

          let notes = (verifiedPayment as any)?.notes;
          if (!notes || Object.keys(notes).length === 0 || Array.isArray(notes)) {
             notes = (verifiedOrder as any)?.notes || order?.notes || {};
          }

          const idempotencyId = payment?.id || order?.id;
          if (!idempotencyId) {
             logger.error("[Razorpay Webhook] Missing idempotency ID");
             return res.status(400).send("Missing idempotency ID");
          }

          const serverId = notes.serverId;
          const userId = notes.userId;
          const plan = notes.plan;
          
          try {
            const isDuplicate = await processIdempotentRazorpayPayment(db, {
              paymentId: verifiedPayment.id,
              orderId: verifiedPayment.order_id || (verifiedOrder ? verifiedOrder.id : ""),
              userId: userId as string,
              serverId: serverId as string,
              plan: plan as string,
              amount: Number(verifiedPayment.amount),
              currency: verifiedPayment.currency as string,
              status: verifiedPayment.status as string,
              source: "webhook_" + event
            });
            
            if (isDuplicate) {
               logger.info(`[Razorpay Webhook] Ignoring duplicate event for payment: ${verifiedPayment.id}`);
            } else {
               logger.info(`[Razorpay Webhook] Renewed/Activated subscription for server ${serverId}`);
            }
          } catch(err: any) {
             logger.error(`[Razorpay Webhook] Payment processing error: ${err.message}`);
             if (err.message === "Invalid plan metadata." || err.message === "Payment not captured.") {
               return res.status(200).send("Ignored");
             }
             return res.status(400).send(err.message);
          }
          break;
        }

        case "subscription.cancelled":
        case "subscription.halted":
        case "payment.failed": {
          // SentinL uses a 30-day access pass system.
          // An ambiguous failed payment to a new order should NEVER overwrite
          // or downgrade the existing active subscription.
          logger.info(`[Razorpay Webhook] Ignored ${event} - SentinL uses one-time 30-day passes.`);
          break;
        }

        case "refund.processed": {
          // Handle refunds
          const refund = payload.refund?.entity;
          const paymentId = refund?.payment_id || payload.payment?.entity?.id;
          if (!paymentId) return res.status(400).send("Missing payment ID");

          try {
             const { processRazorpayRefund } = await import("./src/services/razorpay.js");
             await processRazorpayRefund(db, paymentId);
             logger.info(`[Razorpay Webhook] Refund processed for payment ${paymentId}`);
          } catch(e) {
             logger.error({err: e}, "[Razorpay Webhook] Refund error");
             if (e.message === "Processed payment not found for refund") {
                return res.status(200).send("Ignored");
             }
             return res.status(500).send("Refund processing failed");
          }
          break;
        }
      }

      res.status(200).send("OK");
    } catch (e: any) {
      logger.error({ err: e }, "[Razorpay Webhook] Error processing event:");
      res.status(500).send("Webhook Error");
    }
  });

  app.post("/api/admin/downgrade/:email", requireAuth, async (req: any, res, next: any) => {
    if (!(await isSuperAdmin((req as any).user?.uid))) {
      return res.status(403).json({ error: "Forbidden: Superadmin only" });
    }
    try {
      const email = req.params.email;
      const db = getAdminDB();
      const modDoc = await db.collection("moderators").doc(email).get();
      if (!modDoc.exists) return res.status(404).send("not found");
      const userId = modDoc.data()?.discordId || "unknown"; // wait, the subscriptions are by UID, let's find the use by email
      
      const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
      let uid = "unknown";
      if (!userSnap.empty) {
        uid = userSnap.docs[0].id;
        await db.collection("subscriptions").doc(uid).set({ status: "canceled", accessTier: "free" }, { merge: true });
      }
      
      await enforceQuotaLimits(uid, email, db);

      res.status(200).json({ success: true, message: "downgraded" });
    } catch (e: any) {
      next(e);
    }
  });

  app.post("/api/user/sync-email", requireAuth, async (req: any, res, next: any) => {
    try {
      const { email, uid } = (req as any).user;
      if (!email || !uid) return res.status(400).json({ error: "Missing user info" });

      const db = getAdminDB();
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const oldEmail = userDoc.data()?.email;
        if (oldEmail && oldEmail !== email) {
          // Email has changed! Migrate the discord moderator document.
          const oldModRef = db.collection("moderators").doc(oldEmail);
          const oldModSnap = await oldModRef.get();
          
          if (oldModSnap.exists) {
            const data = oldModSnap.data();
            if (data) {
              if (data.firebaseUid && data.firebaseUid !== uid) {
                logger.warn({ uid }, "Rejected moderator email sync because firebaseUid did not match.");
                return res.status(403).json({ error: "Forbidden: moderator record does not belong to this account" });
              }
              if (!data.firebaseUid) {
                logger.warn({ uid }, "Rejected moderator email sync because old moderator record has no firebaseUid binding.");
                return res.status(403).json({ error: "Forbidden: moderator record is not safely linked to this account" });
              }
              data.email = email;
              data.firebaseUid = uid;
              await db.collection("moderators").doc(email).set(data, { merge: true });
              
              // Try to delete the old document
              try {
                await oldModRef.delete();
              } catch (e) {
                logger.warn({ err: e }, "Failed to delete old moderator doc:");
              }
              
              // Migrate any servers they were owner of
              const serverIds = data.serverIds || [];
              for (const sid of serverIds) {
                try {
                  const sRef = db.collection("servers").doc(sid);
                  const sSnap = await sRef.get();
                  if (sSnap.exists && sSnap.data()?.ownerEmail === oldEmail) {
                    await sRef.update({ ownerEmail: email });
                  }
                } catch (err) {
                  logger.warn({ err: err }, "Failed to update server ownerEmail:");
                }
              }
            }
          }
          // Update the email in the user doc
          await userRef.update({ email });
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      logger.error({ err: error }, "Sync email error");
      if (isFirestoreQuotaError(error)) {
        return sendFirestoreQuotaResponse(res);
      }
      next(error);
    }
  });

  app.post("/api/claim-server", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const { serverId } = req.body;
      const userId = (req as any).user.uid;
      const userEmail = (req as any).user.email;
      const reqUserId = req.body.userId; 
      
      if (!serverId || !userId) {
        return res.status(400).json({ error: "Missing serverId or userId" });
      }
      
      if (reqUserId && userId !== reqUserId) {
        return res.status(403).json({ error: "Forbidden: Cannot claim for another user" });
      }

      const db = getAdminDB();
      const userIsSuperAdminForMod = await isSuperAdmin(userId);
      const modDoc = await db.collection("moderators").doc(userEmail).get();
      if (!modDoc.exists && !userIsSuperAdminForMod) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to manage any servers. Please link your Discord account or contact the server owner." });
      }

      const modData = modDoc.data();
      const allowedServerIds = modData?.serverIds || [];
      const userIsSuperAdmin = await isSuperAdmin(userId);
      if (!allowedServerIds.includes(serverId) && !userIsSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: You lack permissions to claim this specific server." });
      }
      
      // Make sure ownerEmail is synced first
      await db.collection("servers").doc(serverId).set({ ownerEmail: userEmail }, { merge: true });

      const { claimServer } = await import("./src/utils/entitlements.js");
      await claimServer(userId, serverId, db);
      
      res.json({
         success: true,
         message: "Server successfully claimed and linked!",
         tier: "free" // The UI refetches tier
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error claiming server:");
      res.status(403).json({ error: error.message || "Failed to claim server." });
    }
  });

  app.post("/api/unclaim-server", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const { serverId } = req.body;
      const userId = (req as any).user.uid;
      const email = (req as any).user.email;
      const reqUserId = req.body.userId;
      
      if (reqUserId && userId !== reqUserId) {
        return res.status(403).json({ error: "Forbidden: Cannot unclaim for another user" });
      }

      if (!serverId || !userId) {
        return res.status(400).json({ error: "Missing serverId or userId" });
      }

      const db = getAdminDB();
      const userIsSuperAdminForMod = await isSuperAdmin(userId);

      const modDoc = await db.collection("moderators").doc(email).get();
      if (!modDoc.exists && !userIsSuperAdminForMod) {
        return res.status(403).json({ error: "Forbidden: You are not authorized to manage any servers. Please link your Discord account or contact the server owner." });
      }

      const modData = modDoc.data();
      const allowedServerIds = modData?.serverIds || [];
      const userIsSuperAdmin = await isSuperAdmin(userId);
      if (!allowedServerIds.includes(serverId) && !userIsSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: You lack permissions to manage this specific server." });
      }

      const { unclaimServer } = await import("./src/utils/entitlements.js");
      await unclaimServer(userId, serverId, db);
      
      res.json({
        success: true,
        message: "Server successfully unclaimed.",
        tier: "free"
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error unclaiming server:");
      res.status(500).json({ error: "Failed to unclaim server." });
    }
  });

  app.post("/api/kick-bot", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const { serverId } = req.body;
      const email = (req as any).user.email;
      
      if (!serverId || !email) {
        return res.status(400).json({ error: "Missing serverId or email" });
      }

      const db = getAdminDB();

      // Deactivate bot for this server
      const modRef = db.collection("moderators").doc(email);
      const modSnap = await modRef.get();
      if (modSnap.exists) {
        let activeIds = modSnap.data()?.activeServerIds || [];
        if (activeIds.includes(serverId)) {
          activeIds = activeIds.filter((id: string) => id !== serverId);
          await modRef.set(
            {
              activeServerIds: activeIds,
              activeServerId: activeIds.length > 0 ? activeIds[0] : null,
            },
            { merge: true },
          );

          await db
            .collection("servers")
            .doc(serverId)
            .set({ active: false, botTested: false }, { merge: true });
        }
      }

      // Leave the server
      const client = getBotClient();
      let left = false;
      if (client && client.isReady()) {
        const guild = client.guilds.cache.get(serverId);
        if (guild) {
          await guild.leave();
          left = true;
        }
      }

      return res.json({
        success: true,
        left,
        message: "Bot removed and deactivated.",
      });
    } catch (error: any) {
      logger.error({ err: error }, "Error kicking bot:");
      return next(error);
    }
  });

  app.get("/api/auth/discord/url", requireAuth, (req: any, res) => {
    const clientId = DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "Discord OAuth is not configured on this server." });
    }

    const email = req.user.email;
    const uid = req.user.uid || "";

    // To make this perfectly deployable to production:
    // We check if there's a custom domain set in the environment variables (like when you host on Vercel or AWS).
    // If there is, we use your real deployed domain!
    // In production, APP_URL must be the base of your callback URI.
    const appUrlEnv = process.env.APP_URL;
    let realOrigin = appUrlEnv ? parseAppOrigin(appUrlEnv) : null;
    
    if (!realOrigin) {
      realOrigin = `${req.protocol}://${req.get("host")}`;
      if (process.env.NODE_ENV === "production") {
        logger.warn(`[OAuth] WARNING: APP_URL env var is not set in production. Inferring origin as ${realOrigin}. This may cause OAuth mismatch if behind proxy.`);
      }
    }

    if (!email) return res.status(400).json({ error: "Missing email from authenticated user" });

    const redirectUri = `${realOrigin}/api/auth/discord/callback`;

    // Pack both email and origin into the state
    const hmacSecret = clientSecret;
    const payload = JSON.stringify({ email, origin: realOrigin, uid });
    const signature = crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
    
    const stateObj = { payload, signature };
    const encodedState = Buffer.from(JSON.stringify(stateObj)).toString(
      "base64",
    );

    const discordUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("identify guilds")}&state=${encodeURIComponent(encodedState)}&prompt=consent`;

    res.json({ url: discordUrl });
  });

  // Accept with or without trailing slash
  app.get(
    ["/api/auth/discord/callback", "/api/auth/discord/callback/"],
    async (req, res, next: any) => {
      const clientId = DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(503).json({ error: "Discord OAuth is not configured on this server." });
      }

      const code = req.query.code as string;
      const encodedState = req.query.state as string;

      if (!code || !encodedState) {
        return res.status(400).send("Invalid callback parameters.");
      }

      logger.info(
        `[OAuth Tracker] Reached callback endpoint! Code present: ${!!code}, State present: ${!!encodedState}`,
      );

      let stateObj;
      let payloadObj;
      try {
        stateObj = JSON.parse(
          Buffer.from(encodedState, "base64").toString("utf-8"),
        );
        const { payload, signature } = stateObj;
        
        if (!payload || !signature) {
          throw new Error("Missing payload or signature in state");
        }

        const hmacSecret = clientSecret;
        const expectedSignature = crypto.createHmac("sha256", hmacSecret).update(payload).digest("hex");
        
        let isValidSig = false;
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        const signatureBuf = Buffer.from(signature as string, 'utf8');
        if (expectedBuf.length === signatureBuf.length) {
           isValidSig = crypto.timingSafeEqual(expectedBuf, signatureBuf);
        }

        if (!isValidSig) {
           throw new Error("Invalid state signature");
        }
        
        payloadObj = JSON.parse(payload);
        logger.info(`[OAuth Tracker] Decoded State Origin: ${payloadObj.origin}`);
      } catch (e) {
        logger.error({ err: e }, "[OAuth Tracker] Failed to decode or verify state");
        return res
          .status(400)
          .send(
            "Invalid state parameter. Make sure you are initiating from the app.",
          );
      }

      let origin = payloadObj.origin;
      const appUrlEnv = process.env.APP_URL;
      const envOrigin = appUrlEnv ? parseAppOrigin(appUrlEnv) : null;
      
      const isPreview = process.env.AI_STUDIO_PREVIEW === "true";
      const allowEmbed = process.env.ALLOW_AI_STUDIO_EMBED === "true" || isPreview || (process.env.NODE_ENV !== "production" && process.env.ALLOW_AI_STUDIO_EMBED !== "false");

      const allowedPreviewOrigins: string[] = [];
      if (allowEmbed) {
        allowedPreviewOrigins.push(
          "https://ais-dev-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app",
          "https://ais-pre-nmzleljoidwafqsys6i5tw-831641372898.asia-southeast1.run.app"
        );
      }

      // Validate origin
      let isOriginAllowed = false;
      if (envOrigin && origin === envOrigin) isOriginAllowed = true;
      if (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost:")) isOriginAllowed = true;
      if (allowedPreviewOrigins.includes(origin)) isOriginAllowed = true;

      if (!isOriginAllowed) {
        logger.error(`[OAuth Tracker] Origin ${origin} not in allowlist.`);
        return res.status(400).send("Invalid callback origin.");
      }

      const redirectUri = `${origin}/api/auth/discord/callback`;

      try {
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        const tokenData = await tokenRes.json();
        if (tokenData.error) throw new Error(JSON.stringify(tokenData));

        const userRes = await fetch("https://discord.com/api/users/@me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const discordUser = await userRes.json();

        const guildsRes = await fetch(
          "https://discord.com/api/users/@me/guilds",
          {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          },
        );
        const guilds = await guildsRes.json();

        if (!Array.isArray(guilds)) {
          logger.error({ err: guilds,
           }, "[OAuth Tracker] Discord API returned non-array for guilds:");
          throw new Error(
            "Failed to fetch Discord servers. API responded with: " +
              JSON.stringify(guilds),
          );
        }

        const adminGuilds = guilds.filter((g: any) => {
          const perms = BigInt(g.permissions);
          return (perms & 8n) === 8n || (perms & 32n) === 32n;
        });

        const serverIds = adminGuilds.map((g: any) => g.id);
        const serverNames = adminGuilds.reduce((acc: any, g: any) => {
          acc[g.id] = g.name;
          return acc;
        }, {});

        // Save securely to DB before sending success back to client
        const email = payloadObj.email;
        const uid = payloadObj.uid || "";
        if (email) {
           const db = getAdminDB();
           await db.collection("moderators").doc(email).set({
             discordId: discordUser.id,
             discordUsername: discordUser.username,
             discordAvatar: discordUser.avatar,
             serverIds: serverIds,
             serverNames: serverNames,
             firebaseUid: uid
           }, { merge: true });
        }

        const oauthPayload = {
          id: discordUser.id,
          username: discordUser.username,
          avatar: discordUser.avatar,
          serverIds,
          serverNames,
          completedAt: Date.now(),
        };
        const html = `
        <html>
          <body>
            <script>
              var oauthPayload = ${JSON.stringify(oauthPayload)};
              try {
                localStorage.setItem('sentinl_discord_oauth_success', JSON.stringify(oauthPayload));
              } catch (e) {}
               if (window.opener) {
                 window.opener.postMessage({ 
                   type: 'OAUTH_AUTH_SUCCESS', 
                  payload: oauthPayload
                 }, '${origin}');
                 try {
                   window.opener.postMessage({
                     type: 'OAUTH_AUTH_SUCCESS',
                     payload: oauthPayload
                   }, '*');
                 } catch (e) {}
                 window.close();
               } else {
                 window.location.href = '/?discord=connected';
               }
               setTimeout(function() {
                 if (!window.closed) { window.location.href = '/?discord=connected'; }
               }, 3000);
            </script>
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #222;">
               <h2>Authentication successful!</h2>
               <p>You can close this window now.</p>
               <button onclick="window.close()" style="padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `;
        res.type("html").send(html);
      } catch (e: any) {
        logger.error({ err: e }, "Discord OAuth Error:");
        const safeOrigin = typeof origin === "string" ? origin : "/";
        const quotaExhausted = isFirestoreQuotaError(e);
        const safeMessage = quotaExhausted
          ? "Firebase quota has been reached, so SentinL cannot finish saving your Discord connection right now. Please try again after the Firestore daily quota resets."
          : "Account linking failed. Please try again.";
        const safeCode = quotaExhausted ? "FIRESTORE_QUOTA_EXHAUSTED" : "DISCORD_OAUTH_FAILED";
        const html = `
        <html>
          <body>
            <script>
              var oauthError = ${JSON.stringify({ message: safeMessage, code: safeCode, retryable: true, completedAt: Date.now() })};
              try {
                localStorage.setItem('sentinl_discord_oauth_error', JSON.stringify(oauthError));
              } catch (e) {}
              if (window.opener) {
                try {
                  window.opener.postMessage({
                    type: 'OAUTH_AUTH_ERROR',
                    error: oauthError
                  }, ${JSON.stringify(safeOrigin)});
                } catch (e) {}
                try {
                  window.opener.postMessage({
                    type: 'OAUTH_AUTH_ERROR',
                    error: oauthError
                  }, '*');
                } catch (e) {}
              }
              setTimeout(function() {
                try { window.close(); } catch (e) {}
                if (!window.closed) { window.location.href = '/?discord=error'; }
              }, 800);
            </script>
            <div style="font-family: sans-serif; text-align: center; padding: 40px; color: #222;">
               <h2>Discord connection failed</h2>
               <p>${safeMessage}</p>
               <button onclick="window.close()" style="padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `;
        res.status(quotaExhausted ? 503 : 500).type("html").send(html);
      }
    },
  );

  // Fallback for missing API routes to prevent returning HTML index
  
  // --- Summary Endpoint ---
  app.post("/api/guilds/:serverId/summary", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
  try {
    const { serverId } = req.params;
    const { channelId, date } = req.body; 
    
    if (!channelId || !date) {
      return res.status(400).json({ error: "Missing channelId or date" });
    }

    const result = await generateServerSummary(serverId, channelId, date, (req as any).user.uid);
    res.json({ success: true, summary: result.summaryPayload });
  } catch (e: any) {
     logger.error({ err: e }, "Summary fetch error");
     return res.status(e.status || 400).json({ error: e.message || "An error occurred generating the summary." });
  }
});

  app.delete("/api/guilds/:serverId/summary/:summaryId", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const { serverId, summaryId } = req.params;
      const db = getAdminDB();
      await db.collection("servers").doc(serverId).collection("summaries").doc(summaryId).delete();
      res.json({ success: true });
    } catch (e: any) {
       logger.error({ err: e }, "Summary delete error");
       next(e);
    }
  });

  app.post("/api/guilds/:serverId/force-sync", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const { serverId } = req.params;
      const client = getBotClient();
      if (!client || !client.isReady()) {
         return res.json({ success: false, error: "Bot is offline or restarting." });
      }

      const guild = await client.guilds.fetch(serverId).catch(() => null);
      const db = getAdminDB();
      const serverRef = db.collection("servers").doc(serverId);

      if (!guild) {
         await serverRef.set({ botPresent: false }, { merge: true });
         return res.json({ success: false, error: "Bot is not in this server. Please re-invite." });
      } else {
         const serverDoc = await serverRef.get();
         const data = serverDoc.data() || {};
         // Ensure it's active instead of stuck in inactive botPresent=false state
         const updateData: any = { botPresent: true };
         
         // If claimed by this user but marked inactive, we reactivate it.
         if (data.ownerEmail === (req as any).user.email && data.active === false) {
             updateData.active = true;
         }

         await serverRef.set(updateData, { merge: true });
         return res.json({ success: true, active: updateData.active || data.active });
      }
    } catch(err: any) {
      next(err);
    }
  });

  app.post("/api/guilds/:serverId/activation", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const { active } = req.body;
      const { serverId } = req.params;
      
      if (typeof active !== "boolean") {
        return res.status(400).json({ error: "Invalid parameter: 'active' must be a boolean." });
      }

      const db = getAdminDB();
      const serverRef = db.collection("servers").doc(serverId);
      const email = (req as any).user.email;
      const updateData: any = { active: active };
      if (active) {
        const client = getBotClient();
        if (!client || !client.isReady()) {
          return res.status(503).json({ error: "Bot is offline or restarting. Please try again shortly." });
        }
        const guild = await client.guilds.fetch(serverId).catch(() => null);
        if (!guild) {
          return res.status(400).json({ error: "SentinL is not in this server. Invite the bot before activating moderation." });
        }
        const botMember = await guild.members.fetch(client.user.id).catch(() => null);
        if (!botMember) {
          return res.status(400).json({ error: "SentinL could not verify its member record in this server. Re-invite the bot or try again shortly." });
        }
        const { PermissionFlagsBits } = await import("discord.js");
        const hasAdministrator = botMember.permissions.has(PermissionFlagsBits.Administrator);
        const hasPermission = (permission: bigint) =>
          hasAdministrator || botMember.permissions.has(permission);
        const requiredPermissions = [
          ["View Channels", PermissionFlagsBits.ViewChannel],
          ["Send Messages", PermissionFlagsBits.SendMessages],
          ["Manage Messages", PermissionFlagsBits.ManageMessages],
          ["Timeout Members", PermissionFlagsBits.ModerateMembers],
          ["Read Message History", PermissionFlagsBits.ReadMessageHistory],
          ["Embed Links", PermissionFlagsBits.EmbedLinks],
        ] as const;
        const missing = requiredPermissions
          .filter(([, flag]) => !hasPermission(flag))
          .map(([label]) => label);
        if (missing.length > 0) {
          return res.status(400).json({
            error: `SentinL is missing required Discord permissions: ${missing.join(", ")}.`,
            missingPermissions: missing,
          });
        }
        const serverSnap = await serverRef.get();
        if (!serverSnap.exists || !serverSnap.data()?.ownerEmail) {
          updateData.ownerEmail = email;
        }
        updateData.botPresent = true;
      } else {
        updateData.botTested = false;
      }
      await serverRef.set(updateData, { merge: true });

      if (email) {
        const modRef = db.collection("moderators").doc(email);
        const modSnap = await modRef.get();
        const currentActiveIds = modSnap.exists && Array.isArray(modSnap.data()?.activeServerIds)
          ? modSnap.data()?.activeServerIds
          : [];
        const nextActiveIds = active
          ? Array.from(new Set([...currentActiveIds, serverId]))
          : currentActiveIds.filter((id: string) => id !== serverId);

        await modRef.set({
          activeServerIds: nextActiveIds,
          activeServerId: nextActiveIds[0] || null,
        }, { merge: true });
      }
      
      logger.info(`[Activation] Server ${serverId} activated: ${active} by ${(req as any).user.email}`);
      return res.json({ success: true, active });
    } catch (err: any) {
      logger.error(`[Activation Error] Server ${req.params?.serverId}: ${err.message}`);
      return res.status(500).json({ error: "Failed to update server activation state." });
    }
  });

  app.get("/api/guilds/:serverId/ai-status", requireAuth, requireServerAuth, async (req: any, res, next: any) => {
    try {
      const db = getAdminDB();
      const [groqSnap, cfSnap] = await Promise.all([
        db.collection("system_health").doc("groq_budget").get(),
        db.collection("system_health").doc("cloudflare_ai_budget").get()
      ]);
      const groqData = groqSnap.data() || {};
      const cfData = cfSnap.data() || {};
      
      const groqCooldown = groqData.cooldownUntil || 0;
      const cfCooldown = cfData.cooldownUntil || 0;
      const primaryProvider = (process.env.PRIMARY_AI_PROVIDER || "cloudflare").toLowerCase() === "groq" ? "groq" : "cloudflare";
      const cooldownUntil = primaryProvider === "cloudflare" ? cfCooldown : groqCooldown;
      const isRateLimited = cooldownUntil > Date.now();
      
      return res.json({
        isRateLimited,
        cooldownUntil,
        primaryProvider,
        fallbackCooldownUntil: primaryProvider === "cloudflare" ? groqCooldown : cfCooldown,
        fallbackMode: primaryProvider === "groq" ? (groqData.fallbackMode || false) : false,
        message: isRateLimited ? "The primary AI provider is currently experiencing heavy load. Safe fallback is enabled." : "Primary AI provider is operating normally."
      });
    } catch (err) {
      next(err);
    }
  });

app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API Route Not Found" });
  });

  // Global Error Handler for API routes
  app.use(globalErrorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: the node v22 runner expects dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Listen to client errors
  if (!startupValidation || !startupValidation.disabledFeatures.includes("firebase_admin")) {
    try {
      const db = getAdminDB();
      const serverStartTime = new Date();
      db.collection("error_logs")
        .where("timestamp", ">=", serverStartTime)
        .onSnapshot((snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type === "added") {
              const data = change.doc.data();
              addBotLog(`[Client Auth Error] ${data.error} at path: ${data.path}`);
            }
          });
        }, (e) => {
          logger.error({ err: e }, "Failed to listen to error_logs");
        });
    } catch (e) {
      logger.error({ err: e }, "Could not setup error_logs listener:");
    }
  }

  return app;
}

const isEntry = process.argv.some(arg => {
  const base = arg.split(/[/\\]/).pop();
  return base === 'server.ts' || base === 'server.cjs' || base === 'server.js';
}) || (process.env.NODE_ENV === 'production' && process.argv[1] && process.argv[1].endsWith('server.ts'));

if (isEntry) {
  createApp().then((app) => {
    const PORT = Number(process.env.PORT || 3000);
    if (isNaN(PORT) || PORT <= 0 || PORT > 65535) {
      logger.error(`Invalid PORT specified: ${process.env.PORT}. Falling back to 3000.`);
    }
    const finalPort = isNaN(PORT) || PORT <= 0 || PORT > 65535 ? 3000 : PORT;

    const server = app.listen(finalPort, "0.0.0.0", () => {
      logger.info(`Server running on port ${finalPort}`);
      
      try {
        if (process.env.DISCORD_BOT_ENABLED === "false") {
          logger.warn("[Startup] Skipping Discord bot startup because DISCORD_BOT_ENABLED=false. Dashboard/API mode only.");
        } else if (!startupValidation.disabledFeatures.includes("discord_bot")) {
          startDiscordBot();
        } else {
          logger.warn("[Startup] Skipping Discord bot startup because 'discord_bot' is disabled (missing credentials).");
        }
      } catch (err: any) {
        logger.error("[Anti-Crash] Startup Error from Discord Bot: " + (err.message || err));
      }
    });

    const shutdown = async () => {
      logger.info("Graceful shutdown initiated");
      try {
        await shutdownDiscordBot();
      } catch (e) {
        logger.error({ err: e }, "Error during bot shutdown");
      }
      server.close(async () => {
        logger.info("HTTP Server closed");
        try {
          const adminApp = admin.app();
          if (adminApp) {
            await adminApp.delete();
          }
        } catch (e) {
          // ignore
        }
        process.exit(0);
      });
      
      // Fallback timeout in case close takes too long
      setTimeout(() => {
        logger.error("Forcing exit after timeout");
        process.exit(1);
      }, 10000).unref();
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }).catch((err) => {
    logger.error({ err }, "Failed to create app");
    process.exit(1);
  });
}
