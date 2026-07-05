/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { onSnapshot } from 'firebase/firestore';
import { MemoryRouter } from 'react-router-dom';
import ModQueue from '../../src/components/ModQueue';

vi.mock('motion/react', () => ({
  __esModule: true,
  // Drop Motion-only props so React DOM does not warn during unit rendering.
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <span {...props}>{children}</span>,
    tr: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <tr {...props}>{children}</tr>,
    td: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <td {...props}>{children}</td>,
    tbody: ({ children, layout, initial, animate, exit, transition, whileHover, whileTap, ...props }: any) => <tbody {...props}>{children}</tbody>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('sonner', () => ({
  __esModule: true,
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  }
}));

vi.mock('../../src/components/ProGate', () => ({
  __esModule: true,
  ProGate: ({ children }: any) => <>{children}</>,
  default: ({ children }: any) => <>{children}</>
}));

vi.mock('../../src/components/PermissionsModal', () => ({
  PermissionsModal: () => <div data-testid="permissions-modal" />
}));

vi.mock('../../src/components/CustomPermissionsModal', () => ({
  __esModule: true,
  default: () => <div data-testid="custom-permissions-modal" />
}));

vi.mock('../../src/components/ActionModal', () => ({
  __esModule: true,
  default: () => <div data-testid="action-modal" />
}));

vi.mock('../../src/components/UserModal', () => ({
  __esModule: true,
  default: () => <div data-testid="user-modal" />
}));

vi.mock('../../src/components/EmptyState', () => ({
  __esModule: true,
  EmptyState: () => <div data-testid="empty-state" />
}));

vi.mock('../../src/components/Select', () => ({
  __esModule: true,
  Select: () => <div data-testid="select" />
}));

vi.mock('../../src/components/CopyableId', () => ({
  __esModule: true,
  CopyableId: () => <div data-testid="copyable-id" />
}));

vi.mock('../../src/components/Logo', () => ({
  __esModule: true,
  Logo: () => <div data-testid="logo" />
}));

vi.mock('../../src/components/PermissionGateModal', () => ({
  __esModule: true,
  PermissionGateModal: () => <div data-testid="permission-gate-modal" />
}));

vi.mock('../../src/components/RecentBotActions', () => ({
  __esModule: true,
  RecentBotActions: () => <div data-testid="recent-bot-actions" />
}));

vi.mock('../../src/utils/firestoreErrorHandler', () => ({
  handleFirestoreError: vi.fn(),
  OperationType: {}
}));

// Mock the external deps
vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(),
    initializeFirestore: vi.fn(() => ({})),
    collection: vi.fn((db, coll) => ({ coll })),
    doc: vi.fn((db, coll, id) => ({ type: 'doc', coll, id })),
    onSnapshot: vi.fn(),
    query: vi.fn((collOrQuery, ...filters) => ({ type: 'query', parent: collOrQuery })),
    orderBy: vi.fn(),
    limit: vi.fn(),
    where: vi.fn(),
    and: vi.fn(),
    or: vi.fn(),
    updateDoc: vi.fn(),
    setDoc: vi.fn(),
    increment: vi.fn((value: number) => value)
  };
});
vi.mock('../../src/firebase', () => ({
  db: {},
  auth: {}
}));
const mockUser = { uid: "123" };
vi.mock('react-firebase-hooks/auth', () => ({
  useAuthState: () => [mockUser, false, null],
}));
vi.mock('../../src/context/ServerContext', () => ({
  useServer: () => ({
    server: { id: "test" },
    selectedServerId: "test",
    tier: "free",
    isTrial: false,
    isBetaTester: false,
    loading: false,
    intentsWarning: null,
    isPro: false,
    botPermissions: []
  }),
}));
vi.mock('lucide-react', () => ({
  __esModule: true,
  ShieldAlert: () => <div data-testid="shield-alert" />,
  Loader2: () => <div data-testid="loader2" />,
  UserCore: () => <div />,
  CheckCircle2: () => <div />,
  CheckCircle: () => <div />,
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
  Search: () => <div />,
  MessageSquare: () => <div />,
  Trash2: () => <div />,
  Link: () => <div />,
  Clock3: () => <div />,
  MonitorPause: () => <div />,
  HelpCircle: () => <div />,
  User: () => <div />,
  Filter: () => <div />,
  MoreVertical: () => <div />,
  ExternalLink: () => <div />,
  ChevronDown: () => <div />,
  ChevronUp: () => <div />,
  Copy: () => <div />,
  Check: () => <div />
}));

describe('ModQueue UI', () => {
  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  const getUnsub = () => vi.fn();

  it('displays both AI pending flags and manual review-only flags directly using status="pending"', async () => {
    (onSnapshot as any).mockImplementation((refOrQuery: any, callback: any) => {
      if (typeof callback === 'function') {
        if (refOrQuery?.type === 'query') { 
          // Likely query for flaggedMessages
          const fakeDocs = [
            {
              id: 'ai-flag-1',
              data: () => ({
                id: 'ai-flag-1',
                status: 'pending',
                serverId: 'test',
                authorId: 'bad-user-id',
                authorUsername: 'BadUser',
                channelId: 'channel-1',
                content: 'bad content',
                level: 'Extreme',
                confidence: 95,
                reason: 'test reason',
                timestamp: { seconds: Math.floor(Date.now() / 1000) }
              })
            },
            {
              id: 'review-only-1',
              data: () => ({
                id: 'review-only-1',
                status: 'pending',
                reviewStatus: 'needs_review',
                reviewOnly: true,
                serverId: 'test',
                authorId: 'suspicious-user-id',
                authorUsername: 'SuspiciousUser',
                channelId: 'channel-1',
                content: 'weird message',
                level: 'Moderate',
                confidence: 0,
                reason: 'review reason',
                timestamp: { seconds: Math.floor(Date.now() / 1000) }
              })
            }
          ];
          callback({
            forEach: (cb: any) => fakeDocs.forEach(cb)
          });
        } else {
          // Server doc query
          callback({
            exists: () => true,
            data: () => ({ name: "test server" })
          });
        }
      } else if (typeof refOrQuery === 'function') {
           // fallback just in case
           refOrQuery({ exists: () => false });
      }
      return getUnsub();
    });

    render(<MemoryRouter><ModQueue /></MemoryRouter>);
    
    // Check that both users rendered from the queue
    expect((await screen.findAllByText(/BadUser/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/SuspiciousUser/i)).length).toBeGreaterThan(0);
    
    // Check for content
    expect(screen.queryAllByText(/bad content/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/weird message/i).length).toBeGreaterThan(0);
  });
});
