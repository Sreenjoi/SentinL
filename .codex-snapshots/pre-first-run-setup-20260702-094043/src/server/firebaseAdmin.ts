import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { validateStartupConfig } from "../utils/startupValidation.js";

let dbIdFallback = "(default)";
if (process.env.NODE_ENV !== "production") {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (parsed.firestoreDatabaseId) dbIdFallback = parsed.firestoreDatabaseId;
    }
  } catch (e) {
    logger.warn("Could not read firebase-applet-config.json, using fallback ID.");
  }
}

function getFirestoreDatabaseId() {
  return process.env.FIRESTORE_DATABASE_ID || dbIdFallback || "(default)";
}

let _startupValidation: any = null;

export function getAdminDB() {
  if (!_startupValidation) {
    // Lazy-load the validation to avoid throwing right on module import,
    // mimicking the server.ts behavior.
    _startupValidation = validateStartupConfig(process.env);
  }

  if (_startupValidation.disabledFeatures.includes("firebase_admin")) {
    throw new Error("Database service is not configured.");
  }
  
  if (admin.apps.length === 0) {
    let { FIREBASE_PRIVATE_KEY, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_SERVICE_ACCOUNT } = process.env;

    if (!FIREBASE_PRIVATE_KEY && FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
        FIREBASE_PRIVATE_KEY = sa.private_key;
        FIREBASE_PROJECT_ID = sa.project_id;
        FIREBASE_CLIENT_EMAIL = sa.client_email;
      } catch(e) {
        logger.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON");
      }
    }

    if (FIREBASE_PRIVATE_KEY && FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    } else {
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    }
  }
  return getFirestore(admin.app(), getFirestoreDatabaseId());
}
