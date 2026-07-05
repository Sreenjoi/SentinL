import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence, inMemoryPersistence, browserLocalPersistence, browserPopupRedirectResolver } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";

let appletConfig: any = {};
declare const __AI_STUDIO_PREVIEW__: boolean;
declare const __FALLBACK_APP_ID__: string | undefined;
declare const __APPLET_CONFIG__: any;

const isPreview = typeof __AI_STUDIO_PREVIEW__ !== 'undefined' && __AI_STUDIO_PREVIEW__;
const isLocalDev = import.meta.env.DEV;

// In production hosting (not preview, not local dev), do NOT fallback to the local json file
// The build script will enforce these env vars are present.
const useFallback = isPreview || isLocalDev;

if (useFallback) {
  try {
    if (typeof __APPLET_CONFIG__ !== 'undefined' && Object.keys(__APPLET_CONFIG__).length > 0) {
      appletConfig = __APPLET_CONFIG__;
    } else {
      const configs = import.meta.glob('../firebase-applet-config.json', { eager: true });
      if (configs['../firebase-applet-config.json']) {
        appletConfig = (configs['../firebase-applet-config.json'] as any).default || configs['../firebase-applet-config.json'];
      }
    }
  } catch (e) {
    console.warn('Could not load firebase-applet-config.json', e);
  }
}

let envAppId = import.meta.env.VITE_FIREBASE_APP_ID;
if (envAppId && !/^1:\d+:web:[a-zA-Z0-9]+$/.test(envAppId)) {
  console.warn(`Invalid VITE_FIREBASE_APP_ID format: ${envAppId}. Ignoring and falling back to alternative config if available.`);
  envAppId = undefined;
}
if (!envAppId && typeof __FALLBACK_APP_ID__ !== 'undefined') {
  envAppId = __FALLBACK_APP_ID__;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useFallback ? appletConfig.apiKey : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (useFallback ? appletConfig.authDomain : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (useFallback ? appletConfig.projectId : undefined),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (useFallback ? appletConfig.storageBucket : undefined),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (useFallback ? appletConfig.messagingSenderId : undefined),
  appId: envAppId || (useFallback ? appletConfig.appId : undefined),
  firestoreDatabaseId: import.meta.env.VITE_FIRESTORE_DATABASE_ID || (useFallback ? appletConfig.firestoreDatabaseId : "(default)") || "(default)"
};

// Diagnostic log for config source
const configSource = !!import.meta.env.VITE_FIREBASE_API_KEY ? 'VITE_FIREBASE_* env vars' : 'firebase-applet-config.json';
if (!import.meta.env.PROD) {
  console.log(`[Firebase] Initializing using config from: ${configSource} (Environment: ${isPreview ? 'AI Studio Preview' : (isLocalDev ? 'Local Dev' : 'Production')})`);
}

const placeholders = ['YOUR_VALUE_HERE', 'dummy', 'test', 'undefined', 'null', ''];
const isValid = (val: string | undefined) => val && !placeholders.includes(val.trim());

let app;
let firebaseAuth;
let firestoreDb;
export let firebaseInitError: Error | null = null;
export let firebaseReady = false;

try {
  if (!isValid(firebaseConfig.apiKey)) {
    if (useFallback) {
      throw new Error("Firebase preview config missing. Add firebase-applet-config.json or VITE_FIREBASE_* env vars.");
    } else {
      throw new Error("Invalid Firebase frontend config: VITE_FIREBASE_API_KEY is required.");
    }
  }
  if (!firebaseConfig.apiKey?.startsWith('AIza')) {
    throw new Error("Invalid Firebase frontend config: VITE_FIREBASE_API_KEY must be a valid Firebase API key starting with AIza.");
  }
  if (!isValid(firebaseConfig.authDomain) || firebaseConfig.authDomain?.includes('http') || (!firebaseConfig.authDomain?.endsWith('.firebaseapp.com') && !firebaseConfig.authDomain?.endsWith('.web.app'))) {
    throw new Error("Invalid Firebase frontend config: VITE_FIREBASE_AUTH_DOMAIN must be project.firebaseapp.com without https://");
  }
  if (!isValid(firebaseConfig.projectId)) {
    throw new Error("Invalid Firebase frontend config: VITE_FIREBASE_PROJECT_ID is required.");
  }
  if (!isValid(firebaseConfig.appId) || !/^1:\d+:web:[a-zA-Z0-9]+$/.test(firebaseConfig.appId!)) {
    console.error("Invalid appId:", firebaseConfig.appId);
    throw new Error("Invalid Firebase frontend config: VITE_FIREBASE_APP_ID must match Firebase web app format like 1:...:web:...");
  }

  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    try {
      firebaseAuth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
        popupRedirectResolver: browserPopupRedirectResolver
      });
    } catch (e) {
      console.warn("Failed to initialize Firebase Auth with default persistence, falling back to inMemory:", e);
      try {
        firebaseAuth = initializeAuth(app, { 
          persistence: [inMemoryPersistence],
          popupRedirectResolver: browserPopupRedirectResolver
        });
      } catch(e2) {
        console.warn("Falling back to getAuth:", e2);
        firebaseAuth = getAuth(app);
      }
    }
  } else {
    app = getApp();
    firebaseAuth = getAuth(app);
  }

  try {
    firestoreDb = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
  } catch (e) {
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
  firebaseReady = true;

} catch (error) {
  console.error("Firebase initialization failed:", error);
  firebaseInitError = error instanceof Error ? error : new Error(String(error));
}

export const auth = firebaseAuth;
export const db = firestoreDb;
