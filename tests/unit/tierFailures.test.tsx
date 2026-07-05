/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { ServerProvider, useServer } from "../../src/context/ServerContext";
import { vi, expect, test, describe, beforeEach, afterEach } from "vitest";
import React from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { onSnapshot, doc } from "firebase/firestore";

// Mock Firebase and hooks
vi.mock("react-firebase-hooks/auth", () => {
  const useAuthStateMock = vi.fn();
  return {
    useAuthState: useAuthStateMock,
  };
});

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  or: vi.fn(),
  and: vi.fn(),
}));

vi.mock("../../src/firebase", () => ({
  db: {},
  auth: { currentUser: null },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { warning: vi.fn(), error: vi.fn() },
}));

const mockGetIdToken = vi.fn().mockResolvedValue("mock-token");
const mockUser = {
  uid: "123",
  email: "test@example.com",
  getIdToken: mockGetIdToken,
};

describe("ServerContext Tier Failure Handling", () => {
  const originalFetch = global.fetch;
  
  beforeEach(() => {
    vi.mocked(useAuthState).mockReturnValue([mockUser as any, false, null] as any);
    
    // Mock onSnapshot to immediately return a selected server in moderators doc
    vi.mocked(onSnapshot).mockImplementation((firstArg: any, callback: any): any => {
      if (firstArg === "mock-doc-moderators/test@example.com") {
        callback({
          exists: () => true,
          data: () => ({
            serverIds: ["server-1"],
            serverNames: { "server-1": "Test Server" },
            discordId: "discord-123",
            discordUsername: "tester"
          }),
        });
      } else {
        // Just call the callback with an empty doc for others like flags/reports/servers
        callback({ exists: () => false, data: () => ({}) });
      }
      return vi.fn();
    });
    
    // Custom mock doc function to differentiate moderators doc
    vi.mocked(doc).mockImplementation((db: any, pathStr: string, ...args: any[]): any => {
      return `mock-doc-${pathStr}${args.length > 0 ? '/' + args.join('/') : ''}`;
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ServerProvider>{children}</ServerProvider>
  );

  test("API timeout sets tier to null", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/health") || urlStr.includes("/api/bot-guilds") || urlStr.includes("/api/discord/user") || urlStr.includes("/api/discord/permissions")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
      }
      if (urlStr.includes("/tier")) {
        return new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.selectedServerId).toBe("server-1");
    });
    
    await act(async () => {
      await result.current.refreshTier();
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/tier"), expect.any(Object));
    expect(result.current.tier).toBeNull();
    expect(result.current.userTier).toBeNull();
  });

  test("401 Unauthorized sets tier to null", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({ ok: false, status: 401 } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBeNull();
  });

  test("403 Forbidden sets tier to null", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({ ok: false, status: 403 } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBeNull();
  });

  test("500 Server Error sets tier to null", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({ ok: false, status: 500 } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBeNull();
  });

  test("Malformed JSON sets tier to null", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.reject(new SyntaxError("Unexpected token")),
          text: () => Promise.resolve("Not JSON")
        } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBeNull();
  });

  test("Temporary loss of connectivity sets tier to null but recovers", async () => {
    let mockFail = true;
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        if (mockFail) {
          return Promise.reject(new TypeError("Failed to fetch"));
        } else {
          return Promise.resolve({
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            json: () => Promise.resolve({ tier: "pro_3", userTier: "premium" })
          } as any);
        }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    
    // First try fails
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.tier).toBeNull();

    // Secondary try succeeds
    mockFail = false;
    await act(async () => { await result.current.refreshTier(); });
    expect(result.current.tier).toBe("pro_3");
  });

  test("Genuine expiry results in free tier", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ tier: "free", userTier: "free" })
        } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBe("free");
  });

  test("Renewal results in premium tier", async () => {
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/tier")) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ tier: "premium", userTier: "premium" })
        } as any);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}), headers: new Headers({'content-type': 'application/json'}) } as any);
    });

    const { result } = renderHook(() => useServer(), { wrapper });
    
    await waitFor(() => expect(result.current.selectedServerId).toBe("server-1"));
    await act(async () => { await result.current.refreshTier(); });

    expect(result.current.tier).toBe("premium");
  });
});
