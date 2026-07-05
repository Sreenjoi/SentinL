import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server.js";

vi.mock("../../src/firebaseAdmin", () => ({
  getAdminDB: () => ({}),
  getFirebaseAuth: () => ({}),
}));

describe("API 404 Handler", () => {
  it("should return JSON 404 for unknown /api/* routes", async () => {
    const app = await createApp();
    const response = await request(app).get("/api/this-route-does-not-exist");
    expect(response.status).toBe(404);
    expect(response.type).toMatch(/json/);
    expect(response.body).toEqual({ error: "API Route Not Found" });
  });
});
