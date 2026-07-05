import { auth, db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { LRUCache } from "./lruCache.js";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  timestamp?: any;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

const ERROR_COOLDOWN_MS = 60000;
const recentErrors = new LRUCache<string, number>(1000, ERROR_COOLDOWN_MS);

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow: boolean = false) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };

  console.error('Firestore Error', { err: error, info: errInfo });

  if (errorMessage.includes("Missing or insufficient permissions")) {
    toast.error("You don't have permission to perform this action or view this data.");
  }

  const errorKey = `${operationType}:${path}:${errorMessage.substring(0, 50)}`;
  const now = Date.now();
  const lastTime = recentErrors.get(errorKey);

  if (!lastTime || now - lastTime > ERROR_COOLDOWN_MS) {
    recentErrors.set(errorKey, now);
    // Async drop into firestore (fire and forget so we don't block)
    addDoc(collection(db, "error_logs"), {
      ...errInfo,
      timestamp: serverTimestamp(),
    }).catch(e => {
      console.error("Failed to post error log:", e);
    });
  }

  if (shouldThrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}
