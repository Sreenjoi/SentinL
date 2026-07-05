/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { onSnapshot } from 'firebase/firestore';
import { MemoryRouter } from 'react-router-dom';
import ContentModeration from '../../src/components/ContentModeration';

// Mock the external deps
vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(),
    initializeFirestore: vi.fn(() => ({})),
    collection: vi.fn(),
    doc: vi.fn((db, coll, id) => ({ coll, id })),
    onSnapshot: vi.fn(() => vi.fn()),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    where: vi.fn()
  };
});
vi.mock('../../src/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue("mock-token")
    }
  }
}));
vi.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [{ uid: "123" }, false, null],
}));
vi.mock('../../src/context/ServerContext', () => ({
  useServer: () => ({ selectedServerId: "test", server: { id: "test" } }),
}));
vi.mock('lucide-react', () => ({
  ShieldAlert: () => <div data-testid="shield-alert" />,
  Loader2: () => <div data-testid="loader2" />,
  UserCore: () => <div />,
  CheckCircle2: () => <div />,
  AlertTriangle: () => <div />,
  Calendar: () => <div />,
  Activity: () => <div />,
  Clock: () => <div />,
  Sparkles: () => <div />,
  LineChart: () => <div />,
  RefreshCw: () => <div />,
  Bot: () => <div />,
  X: () => <div />,
  Zap: () => <div />,
  Shield: () => <div />,
  Heart: () => <div />,
  SlidersHorizontal: () => <div />,
  Inbox: () => <div />,
  FileText: () => <div />,
  Gavel: () => <div />,
  UsersRound: () => <div />
}));

describe('ContentModeration Rate Limit Banner', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  const mockFetchWithAiStatus = (aiStatus: Record<string, unknown>) => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl.includes('/permissions/')) {
        return {
          ok: true,
          headers: { get: vi.fn(() => 'application/json') },
          json: async () => ({ ok: true, missing: [] })
        } as any;
      }
      if (requestUrl.includes('/ai-status')) {
        return {
          ok: true,
          headers: { get: vi.fn(() => 'application/json') },
          json: async () => aiStatus
        } as any;
      }
      return {
        ok: true,
        headers: { get: vi.fn(() => 'application/json') },
        json: async () => ({})
      } as any;
    });
  };

  it('does not show banner when isRateLimited=true but cooldownUntil is missing', async () => {
    mockFetchWithAiStatus({ isRateLimited: true });

    render(<MemoryRouter><ContentModeration /></MemoryRouter>);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });
    expect(screen.queryByText(/AI checks are temporarily slowed/i)).toBeNull();
  });

  it('shows banner when cooldownUntil is in the future', async () => {
    mockFetchWithAiStatus({ isRateLimited: true, cooldownUntil: Date.now() + 50000 });

    render(<MemoryRouter><ContentModeration /></MemoryRouter>);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });
    expect(screen.queryAllByText(/AI checks are temporarily slowed/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/SentinL will continue using safe fallback protection/i)).not.toBeNull();
  });

  it('hides banner when cooldownUntil is expired', async () => {
    mockFetchWithAiStatus({ isRateLimited: true, cooldownUntil: Date.now() - 5000 });

    render(<MemoryRouter><ContentModeration /></MemoryRouter>);
    await act(async () => {
      await new Promise(r => setTimeout(r, 50));
    });
    expect(screen.queryByText(/AI checks are temporarily slowed/i)).toBeNull();
  });
});
