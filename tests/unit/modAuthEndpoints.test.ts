import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { PermissionFlagsBits } from "discord.js";

// We'll statically analyze server.ts instead of full e2e,
// or we can test authorizeModAction behavior.
import { authorizeModAction } from "../../src/utils/modAuth.js";

vi.mock("../../src/utils/entitlements.js", () => ({
  isServerPremium: vi.fn().mockImplementation(async (serverId) => serverId === "pro-server")
}));

vi.mock("../../src/discordBot.js", () => ({
  getBotClient: () => ({
    isReady: () => true,
    guilds: {
      fetch: async () => ({
        members: {
          fetch: async (userId: string) => {
            if (userId === "no-perms-user") return { permissions: { has: () => false }, roles: { cache: new Map() } };
            if (userId === "admin-user") return { permissions: { has: (p: string | bigint) => p === "Administrator" || p === PermissionFlagsBits.Administrator } };
            return null;
          }
        }
      })
    }
  }),
  db: {}
}));

describe("Mod Action Authorization", () => {
    it("allows free users to dismiss", async () => {
       await expect(authorizeModAction("admin-user", "free-server", "dismiss", null as any)).resolves.toBe(true);
    });

    it("rejects free users from paid actions", async () => {
       await expect(authorizeModAction("admin-user", "free-server", "delete_message", null as any))
          .rejects.toThrow("Forbidden: Feature only available for PRO tier users.");
    });

    it("requires mod roles on pro servers", async () => {
       const mockDb = {
           collection: () => ({
              doc: () => ({
                 get: async () => ({ data: () => ({ modRoleId: "modrole123" }) })
              })
           })
       };

       await expect(authorizeModAction("no-perms-user", "pro-server", "warn", mockDb as any))
          .rejects.toThrow("You do not have the required Discord permissions (Manage Messages) for this action.");
    });

    it("validates reasoning length", async () => {
       const longReason = "a".repeat(501);
       await expect(authorizeModAction("admin-user", "pro-server", "warn", null as any, longReason))
          .rejects.toThrow("Reason exceeds maximum length");
    });
});
