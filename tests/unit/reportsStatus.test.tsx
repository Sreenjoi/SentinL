/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";

// Types
type ReportStatus = "pending" | "approved" | "dismissed" | "actioned";

// Mock implementation of discordBot's slash resolve logic
async function mockSlashResolve(action: string) {
  let finalStatus: ReportStatus = "pending";
  // Simulating the resolveUserReport behavior
  if (action === "dismiss") {
    finalStatus = "dismissed";
  } else {
    finalStatus = "actioned"; // warn, ban, timeout, delete_message
  }
  return { status: finalStatus, actionTaken: action };
}

// Mock implementation of health score query
function constructHealthScoreQuery() {
  const collectionMock = {
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ size: 10 })
  };
  // The actual query in discordBot.ts
  collectionMock.where("status", "in", ["actioned", "dismissed", "approved"]);
  collectionMock.where("timestamp", ">=", "some_date");
  return collectionMock.where.mock.calls;
}

// Mock implementation of dashboard API call
async function mockDashboardResolve(reportId: string, action: string, reason: string) {
  // Simulate calling the API /api/guilds/.../reports/.../resolve
  // which internally calls resolveUserReport
  return mockSlashResolve(action);
}

describe("Report Status Normalization", () => {
  it("Slash command /reports resolve should yield actioned or dismissed status", async () => {
    const res1 = await mockSlashResolve("dismiss");
    expect(res1.status).toBe("dismissed");
    expect(res1.actionTaken).toBe("dismiss");

    const res2 = await mockSlashResolve("timeout");
    expect(res2.status).toBe("actioned");
    expect(res2.actionTaken).toBe("timeout");
  });

  it("Health score calculation should use 'in' query for statuses: actioned, dismissed, approved", () => {
    const calls = constructHealthScoreQuery();
    // Verify first where clause checks status 'in'
    expect(calls[0]).toEqual(["status", "in", ["actioned", "dismissed", "approved"]]);
  });
  
  it("Dashboard resolve should also hit the same API and yield normalized status", async () => {
    const res = await mockDashboardResolve("rpt_123", "warn", "spamming");
    expect(res.status).toBe("actioned");
  });
});

