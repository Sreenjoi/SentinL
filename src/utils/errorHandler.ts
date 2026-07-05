import { logger } from './logger.js';

export const globalErrorHandler = (err: any, req: any, res: any, next: any) => {
  logger.error({ err: err }, "[Global Error Handler]");
  if (!res.headersSent) {
    const message = String(err?.message || err?.details || "").toLowerCase();
    const isFirestoreQuotaError =
      err?.code === 8 ||
      message.includes("resource_exhausted") ||
      message.includes("quota limit exceeded") ||
      message.includes("free daily read units");
    if (isFirestoreQuotaError) {
      return res.status(503).json({
        error: "Firebase quota has been reached. SentinL is temporarily unable to read or update dashboard data. Please try again after the Firestore daily quota resets.",
        code: "FIRESTORE_QUOTA_EXHAUSTED",
        retryable: true,
      });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message || "An error occurred" });
    }
    if (err.message === "Database service is not configured.") {
      return res.status(503).json({ error: "Database service is not configured." });
    }
    const isProdMode = process.env.NODE_ENV === "production" && process.env.TEST_MODE !== "true";
    if (isProdMode) {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.status(500).json({ error: "Internal server error", details: err.message });
    }
  }
};
