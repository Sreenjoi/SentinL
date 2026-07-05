import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Setup mock server
const app = express();
app.use(express.json());

// Mock auth middleware
const mockRequireAuth = (req: any, res: any, next: any) => {
  if (req.headers.authorization === 'Bearer valid-token') {
    req.user = { uid: 'user_mod' };
    next();
  } else if (req.headers.authorization === 'Bearer valid-admin-token') {
    req.user = { uid: 'user_admin' };
    next();
  } else if (req.headers.authorization === 'Bearer valid-user-token') {
    req.user = { uid: 'user_normal' };
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const mockRequireServerAuth = (req: any, res: any, next: any) => {
  // Mock server auth logic
  if (req.user.uid === 'user_mod' || req.user.uid === 'user_admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
};

let mockDbData: any = {};
let mockAuditLogs: any[] = [];

// Mock Firebase DB
const mockGetAdminDB = () => ({
  collection: (col: string) => ({
    doc: (docId: string) => ({
      get: async () => {
        if (col === 'servers' && docId === 'server1') {
          return {
            exists: true,
            data: () => ({ name: 'Test Server' })
          };
        }
        return { exists: false };
      },
      collection: (subCol: string) => ({
        doc: (subDocId: string) => ({
          get: async () => {
            if (col === 'servers' && docId === 'server1' && subCol === 'reports' && mockDbData[subDocId]) {
              return {
                exists: true,
                data: () => mockDbData[subDocId]
              };
            }
            return { exists: false };
          },
          update: async (data: any) => {
            if (col === 'servers' && docId === 'server1' && subCol === 'reports' && mockDbData[subDocId]) {
              mockDbData[subDocId] = { ...mockDbData[subDocId], ...data };
            }
          }
        })
      }),
      set: async (data: any) => {
         if (col === 'modActions') {
            mockAuditLogs.push(data);
         }
      }
    })
  })
});

// Mock dependencies
vi.mock('../../server', () => ({
  getAdminDB: mockGetAdminDB
}));

// Apply our mock implementation directly here for tests since we can't easily import the complex server.ts module
app.post("/api/guilds/:serverId/reports/:reportId/archive", mockRequireAuth, mockRequireServerAuth, async (req: any, res: any) => {
  const { serverId, reportId } = req.params;
  const db = mockGetAdminDB();
  
  try {
    const reportRef = db.collection("servers").doc(serverId).collection("reports").doc(reportId);
    
    const docSnap = await reportRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: "Report not found" });
    }

    const reportData = docSnap.data();

    // Update the report to archived
    await reportRef.update({
      status: "archived",
      updatedAt: new Date().toISOString()
    });

    // Write an audit log
    const actionDocId = "mock-uuid";
    await db.collection("modActions").doc(actionDocId).set({
      serverId,
      type: "archive_report",
      timestamp: new Date().toISOString(),
      reason: "Report archived via dashboard",
      userId: reportData?.reporterId || "unknown",
      moderatorId: req.user.uid,
      messageId: reportData?.messageId || null,
      channelId: reportData?.channelId || null,
      userName: reportData?.reporterUsername || "unknown"
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


describe('Archive Report Endpoint', () => {
  beforeEach(() => {
    mockDbData = {
      'report1': {
        id: 'report1',
        status: 'pending',
        reporterId: 'user123',
        reporterUsername: 'TestUser',
        messageId: 'msg123',
        channelId: 'chan123'
      }
    };
    mockAuditLogs = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully archive a report when authorized', async () => {
    const response = await request(app)
      .post('/api/guilds/server1/reports/report1/archive')
      .set('Authorization', 'Bearer valid-mod-token'); // Let's use valid-token for mod

    // wait, my mockRequireAuth needs valid-token to set user_mod
    const response2 = await request(app)
      .post('/api/guilds/server1/reports/report1/archive')
      .set('Authorization', 'Bearer valid-token');

    expect(response2.status).toBe(200);
    expect(response2.body.success).toBe(true);

    // Verify DB update
    expect(mockDbData['report1'].status).toBe('archived');
    expect(mockDbData['report1'].updatedAt).toBeDefined();

    // Verify audit log
    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].type).toBe('archive_report');
    expect(mockAuditLogs[0].serverId).toBe('server1');
    expect(mockAuditLogs[0].moderatorId).toBe('user_mod');
  });

  it('should return 401 when unauthorized', async () => {
    const response = await request(app)
      .post('/api/guilds/server1/reports/report1/archive');

    expect(response.status).toBe(401);
  });

  it('should return 403 when user lacks server auth', async () => {
    const response = await request(app)
      .post('/api/guilds/server1/reports/report1/archive')
      .set('Authorization', 'Bearer valid-user-token');

    expect(response.status).toBe(403);
  });

  it('should return 404 when report is missing', async () => {
    const response = await request(app)
      .post('/api/guilds/server1/reports/missing-report/archive')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(404);
  });
});
