import admin from "firebase-admin";
import { logger } from "../utils/logger.js";
export async function cleanupModerationEvidence(db: FirebaseFirestore.Firestore) {
  if (!db) return;

  const retentionDays = parseInt(process.env.EVIDENCE_RETENTION_DAYS || "30", 10);
  const summaryRetentionDays = parseInt(process.env.SUMMARY_RETENTION_DAYS || "90", 10);
  if (isNaN(retentionDays) || retentionDays < 1) {
    logger.warn("[Evidence Cleanup] Invalid EVIDENCE_RETENTION_DAYS, must be at least 1");
    return;
  }
  if (isNaN(summaryRetentionDays) || summaryRetentionDays < 1) {
    logger.warn("[Evidence Cleanup] Invalid SUMMARY_RETENTION_DAYS, must be at least 1");
    return;
  }

  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - retentionDays);
  const fsRetentionDate = admin.firestore.Timestamp.fromDate(retentionDate);
  const summaryRetentionDate = new Date();
  summaryRetentionDate.setDate(summaryRetentionDate.getDate() - summaryRetentionDays);
  const fsSummaryRetentionDate = admin.firestore.Timestamp.fromDate(summaryRetentionDate);

  logger.info(`[Evidence Cleanup] Starting cleanup for evidence older than ${retentionDays} days (${retentionDate.toISOString()})`);

  let totalRedacted = 0;

  try {
    // 1. Cleanup flaggedMessages
    const flaggedSnap = await db.collection("flaggedMessages")
      .where("timestamp", "<", fsRetentionDate)
      .limit(500)
      .get();

    if (!flaggedSnap.empty) {
      const batch = db.batch();
      flaggedSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.status !== "pending" && (data.content !== "[REDACTED]" || data.contextConsidered !== "[REDACTED]")) {
          batch.update(doc.ref, {
            content: "[REDACTED]",
            contextConsidered: data.contextConsidered ? "[REDACTED]" : null
          });
          totalRedacted++;
        }
      });
      if (totalRedacted > 0) {
        await batch.commit();
      }
    }
    
    // 2. Cleanup moderationCases (Subcollection group query)
    const casesSnap = await db.collectionGroup("moderationCases")
      .where("createdAt", "<", fsRetentionDate)
      .limit(500)
      .get();

    if (!casesSnap.empty) {
      const batch = db.batch();
      let casesRedacted = 0;
      casesSnap.docs.forEach(doc => {
        const data = doc.data();
        // Do not redact if there's an active appeal (appealStatus == "submitted")
        if (data.appealStatus !== "submitted" && data.evidenceSnippet && data.evidenceSnippet !== "[REDACTED]") {
          batch.update(doc.ref, {
            evidenceSnippet: "[REDACTED]"
          });
          casesRedacted++;
          totalRedacted++;
        }
      });
      if (casesRedacted > 0) {
        await batch.commit();
      }
    }

    // 3. Cleanup reports (Subcollection group query)
    const reportsSnap = await db.collectionGroup("reports")
      .where("timestamp", "<", fsRetentionDate)
      .limit(500)
      .get();

    if (!reportsSnap.empty) {
      const batch = db.batch();
      let reportsRedacted = 0;
      reportsSnap.docs.forEach(doc => {
        const data = doc.data();
        // Do not redact if report is unresolved (status == "pending")
        if (data.status !== "pending" && data.reportedMessageContent && data.reportedMessageContent !== "[REDACTED]") {
          batch.update(doc.ref, {
            reportedMessageContent: "[REDACTED]"
          });
          reportsRedacted++;
          totalRedacted++;
        }
      });
      if (reportsRedacted > 0) {
        await batch.commit();
      }
    }

    // 4. Training feedback is a moderation calibration record. Keep it by default
    // so the Training Analytics log can show the exact reviewed text. Deployments
    // that need stricter retention can opt in with REDACT_TRAINING_FEEDBACK_CONTENT=true.
    if (process.env.REDACT_TRAINING_FEEDBACK_CONTENT === "true") {
      const trainingSnap = await db.collection("trainingFeedback")
        .where("timestamp", "<", fsRetentionDate)
        .limit(500)
        .get();

      if (!trainingSnap.empty) {
        const batch = db.batch();
        let trainingRedacted = 0;
        trainingSnap.docs.forEach(doc => {
          const data = doc.data();
          const updates: Record<string, unknown> = {};
          if (data.originalContent && data.originalContent !== "[REDACTED]") {
            updates.originalContent = "[REDACTED]";
          }
          if (data.originalReasoning && data.originalReasoning !== "[REDACTED]") {
            updates.originalReasoning = "[REDACTED]";
          }
          if (Object.keys(updates).length > 0) {
            batch.update(doc.ref, updates);
            trainingRedacted++;
            totalRedacted++;
          }
        });
        if (trainingRedacted > 0) {
          await batch.commit();
        }
      }
    }

    // 5. Cleanup saved summaries. Keep metadata so history pages do not break.
    const summariesSnap = await db.collectionGroup("summaries")
      .where("createdAt", "<", fsSummaryRetentionDate)
      .limit(500)
      .get();

    if (!summariesSnap.empty) {
      const batch = db.batch();
      let summariesRedacted = 0;
      summariesSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.summaryText && data.summaryText !== "[REDACTED]") {
          batch.update(doc.ref, {
            summaryText: "[REDACTED]",
            redactedAt: admin.firestore.FieldValue.serverTimestamp(),
            redactionReason: "retention_policy"
          });
          summariesRedacted++;
          totalRedacted++;
        }
      });
      if (summariesRedacted > 0) {
        await batch.commit();
      }
    }

    logger.info(`[Evidence Cleanup] Completed cleanup. Redacted ${totalRedacted} old records.`);
  } catch (error) {
    logger.error({ err: error }, "[Evidence Cleanup] Failed to run cleanup job");
  }
}
