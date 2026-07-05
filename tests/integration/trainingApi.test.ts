import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock middleware
const mockRequireAuth = (req: any, res: any, next: any) => {
  if (req.headers.authorization === "Bearer valid-token") {
    req.user = { uid: "user_mod" };
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const mockRequireServerAuth = (req: any, res: any, next: any) => {
  if (req.user && req.user.uid === "user_mod") {
    next();
  } else {
    res.status(403).json({ error: "Forbidden" });
  }
};

const mockMutationLimiter = (req: any, res: any, next: any) => next();

let isPremiumMock = false;
let mockTrainingDb: any[] = [];

vi.mock("../../src/utils/billing.js", () => ({
  isServerPremium: async () => isPremiumMock
}));

const mockDb = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      set: async (data: any) => {
        mockTrainingDb.push({ id, ...data });
      }
    })
  })
};

vi.mock("../../src/utils/firebaseAdmin.js", () => ({
  getAdminDB: () => mockDb,
  FieldValue: {
    serverTimestamp: () => "mock_timestamp"
  }
}));

vi.mock("../../src/utils/cache.js", () => ({
  invalidateTrainingCache: () => {}
}));

const app = express();
app.use(express.json());

// Import handler logic directly or inject it
app.post("/api/train", mockRequireAuth, mockRequireServerAuth, mockMutationLimiter, async (req: any, res: any, next: any) => {
  try {
    if (!isPremiumMock) {
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

    const autoId = "mock_uuid";
    await mockDb
      .collection("trainingFeedback")
      .doc(autoId)
      .set({
        originalMessageId: body.messageId,
        originalContent: body.originalContent || "",
        originalVerdict: body.originalVerdict || "Unknown",
        originalReasoning: body.originalReasoning || "",
        correctedSeverity: body.correctSeverity,
        moderatorReason: body.reason,
        moderatorId: req.user.uid,
        serverId: body.serverId,
        timestamp: "mock_timestamp",
        source: "dashboard",
        processed: false,
      });

    res.json({ success: true });
  } catch (e: any) {
    next(e);
  }
});

describe("Training API Validation", () => {
  beforeEach(() => {
    isPremiumMock = true;
    mockTrainingDb = [];
  });

  it("accepts valid input", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        messageId: "msg123",
        serverId: "srv123",
        correctSeverity: "Moderate",
        reason: "This is a valid 15 char reason",
        originalContent: "test",
        originalReasoning: "reason"
      });
    expect(res.status).toBe(200);
    expect(mockTrainingDb.length).toBe(1);
    expect(mockTrainingDb[0].correctedSeverity).toBe("Moderate");
  });

  it("rejects invalid severity", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        messageId: "msg123",
        serverId: "srv123",
        correctSeverity: "BadSeverity",
        reason: "Valid reason here",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("correctSeverity must be exactly one of");
  });

  it("rejects missing messageId", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        serverId: "srv123",
        correctSeverity: "Spam",
        reason: "Valid reason here",
      });
    expect(res.status).toBe(400);
  });

  it("rejects missing serverId", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        messageId: "msg123",
        correctSeverity: "Spam",
        reason: "Valid reason here",
      });
    expect(res.status).toBe(400);
  });

  it("rejects short reason", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        messageId: "msg123",
        serverId: "srv123",
        correctSeverity: "Spam",
        reason: "Short",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reason must be between 10 and 500 characters");
  });

  it("rejects too long reason", async () => {
    const res = await request(app)
      .post("/api/train")
      .set("Authorization", "Bearer valid-token")
      .send({
        messageId: "msg123",
        serverId: "srv123",
        correctSeverity: "Spam",
        reason: "A".repeat(501),
      });
    expect(res.status).toBe(400);
  });
});
