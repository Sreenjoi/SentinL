import { describe, it, expect, vi } from "vitest";
import { validateCreateOrderRequest } from "../../src/services/razorpay";

describe("Razorpay Order Creation Authorization Tests", () => {
  const getAdminDBMock = () => {
    return {
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) })
        })
      })
    } as any;
  };

  it("should allow an authorized server admin to create an order", async () => {
    const req = {
      user: { uid: "user123", email: "user@test.com" },
      body: { userId: "user123", serverId: "server123", plan: "pro_1" }
    };
    const deps = {
      checkServerAuth: async () => true, // Authorized
      getAdminDB: getAdminDBMock,
      razorpayConfigured: true
    };

    const result = await validateCreateOrderRequest(req, deps);
    expect(result.isValid).toBe(true);
    expect(result.status).toBeUndefined();
  });

  it("should block a random user trying to create an order for another server", async () => {
    const req = {
      user: { uid: "random_user", email: "random@test.com" },
      body: { userId: "random_user", serverId: "server123", plan: "pro_1" }
    };
    const deps = {
      checkServerAuth: async () => false, // Not authorized for this server
      getAdminDB: getAdminDBMock,
      razorpayConfigured: true
    };

    const result = await validateCreateOrderRequest(req, deps);
    expect(result.isValid).toBeUndefined();
    expect(result.status).toBe(403);
    expect(result.error).toContain("Forbidden: Not authorized");
  });

  it("should reject mismatching userId in body and req.user", async () => {
    const req = {
      user: { uid: "user_a", email: "a@test.com" },
      body: { userId: "user_b", serverId: "server123", plan: "pro_1" }
    };
    const deps = {
      checkServerAuth: async () => true, 
      getAdminDB: getAdminDBMock,
      razorpayConfigured: true
    };

    const result = await validateCreateOrderRequest(req, deps);
    expect(result.isValid).toBeUndefined();
    expect(result.status).toBe(403);
    expect(result.error).toContain("user ID mismatch");
  });

  it("should reject an invalid plan", async () => {
    const req = {
      user: { uid: "user123", email: "a@test.com" },
      body: { userId: "user123", serverId: "server123", plan: "fake_plan" }
    };
    const deps = {
      checkServerAuth: async () => true, 
      getAdminDB: getAdminDBMock,
      razorpayConfigured: true
    };

    const result = await validateCreateOrderRequest(req, deps);
    expect(result.isValid).toBeUndefined();
    expect(result.status).toBe(400);
    expect(result.error).toContain("Invalid plan selected");
  });

  it("should reject if razorpay is not configured", async () => {
    const req = {
      user: { uid: "user123" },
      body: { userId: "user123", serverId: "server123", plan: "pro_1" }
    };
    const deps = {
      checkServerAuth: async () => true, 
      getAdminDB: getAdminDBMock,
      razorpayConfigured: false
    };

    const result = await validateCreateOrderRequest(req, deps);
    expect(result.isValid).toBeUndefined();
    expect(result.status).toBe(503);
  });
});
