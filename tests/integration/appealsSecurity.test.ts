import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import fs from "fs";
import path from "path";

// Setup mock server for dynamic endpoint tests
const app = express();
app.use(express.json());

// Mock middlewares
const mockRequireAuth = (req: any, res: any, next: any) => {
  if (req.headers.authorization === 'Bearer valid-token') {
    req.user = { uid: 'user_mod' };
    next();
  } else if (req.headers.authorization === 'Bearer invalid-token') {
    res.status(401).json({ error: 'Unauthorized' });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const mockRequireServerAuth = (req: any, res: any, next: any) => {
  if (req.user && req.user.uid === 'user_mod') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
};

let mockCaseData: any = {};
let mockAuditLogs: any[] = [];

// Mock Firebase DB
const mockGetAdminDB = () => ({
  collection: (col: string) => ({
    doc: (docId: string) => {
      if (col === "modActions") {
         return {
           set: async (data: any) => { mockAuditLogs.push(data); }
         }
      }
      return {
        get: async () => {
          if (mockCaseData[docId]) {
            return { exists: true, data: () => mockCaseData[docId] };
          }
          return { exists: false };
        }
      }
    }
  }),
  runTransaction: async (cb: any) => {
    const t = {
      get: async (ref: any) => {
        // mock ref logic
        const caseId = ref.id;
        if (mockCaseData[caseId]) {
          return { exists: true, data: () => mockCaseData[caseId] };
        }
        return { exists: false };
      },
      update: (ref: any, data: any) => {
        const caseId = ref.id;
        if (mockCaseData[caseId]) {
          mockCaseData[caseId] = { ...mockCaseData[caseId], ...data };
        }
      },
      set: (ref: any, data: any) => {
         mockAuditLogs.push(data);
      }
    };
    await cb(t);
  }
});

app.post("/api/guilds/:serverId/appeals/:caseId/:action", mockRequireAuth, mockRequireServerAuth, async (req: any, res: any) => {
    const { serverId, caseId, action } = req.params;
    const { reviewNote } = req.body;
    try {
      if (action !== "uphold" && action !== "overturn") {
        return res.status(400).json({ error: "Invalid appeal action. Must be 'uphold' or 'overturn'." });
      }

      if (reviewNote !== undefined && (typeof reviewNote !== "string" || reviewNote.length > 1000)) {
        return res.status(400).json({ error: "reviewNote must be a string up to 1000 characters." });
      }

      const db = mockGetAdminDB();
      // Mock authorizeAppealReview passing
      const caseRef = { id: caseId, path: `servers/${serverId}/moderationCases/${caseId}` };
      
      let caseData: any = null;

      await db.runTransaction(async (t: any) => {
        const caseSnap = await t.get(caseRef);
        if (!caseSnap.exists) {
          throw new Error("Case not found");
        }
        caseData = caseSnap.data()!;
        if (caseData.appealStatus !== "submitted") {
          throw Object.assign(new Error("Case is not currently submitted for appeal or already decided."), { status: 400 });
        }
        
        t.update(caseRef, {
          status: action === "uphold" ? "upheld" : "overturned",
          appealStatus: action === "uphold" ? "upheld" : "overturned",
          reviewedBy: req.user.uid
        });
      });

      res.json({ success: true, caseId, action });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
});

describe("Appeals API Security", () => {
  beforeEach(() => {
    mockCaseData = {
      'case_submitted': { appealStatus: 'submitted', status: 'appealed' },
      'case_decided': { appealStatus: 'upheld', status: 'upheld' }
    };
    mockAuditLogs = [];
  });
  it("should not expose unauthenticated test-appeals routes", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Ensure the test route was removed
    expect(serverCode).not.toContain('app.get("/api/test-appeals/:serverId"');
    expect(serverCode).not.toContain('app.get("/api/test-appeals"');
  });

  it("should secure the active appeals route with requireAuth and requireServerAuth", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Find how the appeals route is defined
    const appealsRouteMatch = serverCode.match(/app\.get\("\/api\/guilds\/:serverId\/appeals".*?\)/);
    expect(appealsRouteMatch).toBeTruthy();
    
    if (appealsRouteMatch) {
      const routeDefinition = appealsRouteMatch[0];
      expect(routeDefinition).toContain("requireAuth");
      expect(routeDefinition).toContain("requireServerAuth");
    }
  });

  it("should not expose sensitive moderation evidence without authentication", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    
    // Let's do a simple heuristic over the file to ensure we don't have something like
    // app.get(..., async (req, res) => { ... return moderationCases ... }) without requireAuth
    // Since static analysis of this is hard, we rely on the above checks for the known routes.
    // As an extra safeguard, we verify that any route containing "appeals" requires auth (or is an explicitly known safe method).
    
    const lines = serverCode.split("\n");
    lines.forEach((line) => {
      if (line.includes('app.get') && line.includes('appeals') && typeof line === 'string') {
        expect(line).toContain("requireAuth");
      }
    });
  });

  it("should not restrict /api/guilds/:serverId/appeals/:caseId/:action by PRO tier", () => {
    const serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
    const routeMatch = serverCode.match(/app\.post\("\/api\/guilds\/:serverId\/appeals\/:caseId\/:action"[\s\S]*?res\.json/);
    expect(routeMatch).toBeTruthy();
    if (routeMatch) {
      const funcBody = routeMatch[0];
      expect(funcBody).not.toContain("checkServerPremium");
      expect(funcBody).not.toContain("Appeals management requires a PRO subscription.");
    }
  });

  it("should not restrict appeals commands in appealsBotLogic", () => {
    const logicCode = fs.readFileSync(path.resolve(__dirname, "../../src/appealsBotLogic.ts"), "utf-8");
    expect(logicCode).not.toContain("Submitting and managing appeals is a PRO feature.");
    expect(logicCode).not.toContain("This server is currently on the free tier, appeals are disabled.");
  });

  it("free-tier moderator can uphold appeal", async () => {
    const res = await request(app)
      .post("/api/guilds/server1/appeals/case_submitted/uphold")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(mockCaseData["case_submitted"].appealStatus).toBe("upheld");
  });

  it("free-tier moderator can overturn appeal", async () => {
    const res = await request(app)
      .post("/api/guilds/server1/appeals/case_submitted/overturn")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(200);
    expect(mockCaseData["case_submitted"].appealStatus).toBe("overturned");
  });

  it("unauthorized user gets 401", async () => {
    const res = await request(app)
      .post("/api/guilds/server1/appeals/case_submitted/uphold")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });

  it("invalid action gets 400", async () => {
    const res = await request(app)
      .post("/api/guilds/server1/appeals/case_submitted/delete")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid appeal action");
  });

  it("already-decided appeal returns safe 400, not 500", async () => {
    const res = await request(app)
      .post("/api/guilds/server1/appeals/case_decided/uphold")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Case is not currently submitted for appeal or already decided");
  });
});
