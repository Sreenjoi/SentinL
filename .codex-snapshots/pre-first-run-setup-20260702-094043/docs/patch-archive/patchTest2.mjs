import fs from 'fs';

const content = `import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processIdempotentRazorpayPayment, processRazorpayRefund } from '../../src/services/razorpay';
import * as admin from 'firebase-admin';

vi.mock('firebase-admin', () => {
  return {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP')
      },
      Timestamp: {
         fromMillis: vi.fn((ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) }))
      }
    }
  };
});

// Mock invalidateServerTierCache
vi.mock('../../src/utils/entitlements.js', () => ({
  invalidateServerTierCache: vi.fn()
}));

describe('Razorpay Shared Idempotency & Refunds', () => {
  let db: any;
  let tMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tMock = {
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn()
    };
    db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockImplementation((path) => ({ path, collection: vi.fn() }))
      }),
      runTransaction: vi.fn(async (cb) => {
        await cb(tMock);
      })
    };
  });

  const getValidPaymentData = (overrides = {}) => ({
    paymentId: 'pay_123',
    orderId: 'order_123',
    expectedOrderId: 'order_123',
    userId: 'user_1',
    serverId: 'server_1',
    plan: 'pro_1',
    amount: 799,
    currency: 'USD',
    status: 'captured',
    source: 'test',
    ...overrides
  });

  it('rejects wrong order_id (from frontend)', async () => {
     await expect(processIdempotentRazorpayPayment(db, getValidPaymentData({
        expectedOrderId: 'wrong_order_expected'
     }))).rejects.toThrow("Order ID mismatch.");
  });

  it('New Payment - extends subscription when neither payment nor order exist', async () => {
     // pDoc, oDoc, uDoc, sDoc, linkDoc missing
     tMock.getAll.mockResolvedValue([{ exists: false }, { exists: false }, { exists: false }, { exists: false }]);

     const isDuplicate = await processIdempotentRazorpayPayment(db, getValidPaymentData());

     expect(isDuplicate).toBe(false);
     
     // 1 for processed_payments, 1 for processed_orders, 1 for servers, 1 for subscriptions(server), 1 for subscriptions(user) = 5 sets
     expect(tMock.set).toHaveBeenCalled();
  });

  it('Duplicate Webhook - returns true when paymentId exists', async () => {
     tMock.getAll.mockResolvedValue([{ exists: true }, { exists: false }]);

     const isDuplicate = await processIdempotentRazorpayPayment(db, getValidPaymentData());

     expect(isDuplicate).toBe(true);
     expect(tMock.set).not.toHaveBeenCalled();
  });
  
  it('Concurrent Webhook - returns true when orderId exists', async () => {
     tMock.getAll.mockResolvedValue([{ exists: false }, { exists: true }]);

     const isDuplicate = await processIdempotentRazorpayPayment(db, getValidPaymentData());

     expect(isDuplicate).toBe(true);
     expect(tMock.set).not.toHaveBeenCalled();
  });

  it('Renewal - adds time to current expiry', async () => {
     const now = Date.now();
     const futureMs = now + 100000;
     tMock.getAll.mockResolvedValue([
        { exists: false }, // pDoc
        { exists: false }, // oDoc
        { exists: true, data: () => ({ status: 'active', expiresAt: { toDate: () => new Date(futureMs) }, linkedServerIds: ['server_1'] }) }, // uDoc
        { exists: true } // linkDoc
     ]);

     await processIdempotentRazorpayPayment(db, getValidPaymentData());

     // Should set the expiry to futureMs + 30 days
     const setCalls = tMock.set.mock.calls;
     const userSubSet = setCalls.find(c => c[0].path === 'user_1');
     expect(userSubSet).toBeDefined();
     expect(userSubSet[1].expiresAt.toMillis()).toBeGreaterThan(futureMs + 29 * 24 * 60 * 60 * 1000); 
  });
  
  it('Downgrade - conflict when linked servers exceed maxServers of new plan', async () => {
     tMock.getAll.mockResolvedValue([
        { exists: false }, // pDoc
        { exists: false }, // oDoc
        { exists: true, data: () => ({ status: 'active', linkedServerIds: ['server_2', 'server_3'] }) }, // uDoc
     ]);

     await expect(processIdempotentRazorpayPayment(db, getValidPaymentData({ plan: 'pro_1' }))).rejects.toThrow("Conflict: Linked servers exceed maximum");
  });

  it('Refund Processed - downgrades to free when refund matches current payment', async () => {
     tMock.get.mockResolvedValue({ exists: true, data: () => ({ serverId: 'server_1', userId: 'user_1' }) });
     tMock.getAll.mockResolvedValue([
        { exists: true, data: () => ({ lastPaymentIntent: 'pay_123', linkedServerIds: ['server_1'] }) }, // uDoc
        { exists: true, data: () => ({ ownerId: 'user_1' }) } // linkDoc
     ]);

     await processRazorpayRefund(db, 'pay_123');

     // Should update user sub to 'free' / 'refunded'
     expect(tMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'user_1' }),
        expect.objectContaining({ status: 'refunded', accessTier: 'free' })
     );
     // Should delete linked server
     expect(tMock.delete).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'server_1' })
     );
  });

  it('Stale Refund - does NOT downgrade to free if current payment differs', async () => {
     tMock.get.mockResolvedValue({ exists: true, data: () => ({ serverId: 'server_1', userId: 'user_1' }) });
     tMock.getAll.mockResolvedValue([
        { exists: true, data: () => ({ lastPaymentIntent: 'pay_999' }) } // current payment is different
     ]);

     await processRazorpayRefund(db, 'pay_123');

     // It should only update the payment doc to refunded
     expect(tMock.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'pay_123' }),
        expect.objectContaining({ refunded: true })
     );
     // Should NOT update user subscription
     const userSubUpdate = tMock.update.mock.calls.find(c => c[0].path === 'user_1');
     expect(userSubUpdate).toBeUndefined();
  });

});
`;

fs.writeFileSync('tests/unit/razorpayIdempotency.test.ts', content);
