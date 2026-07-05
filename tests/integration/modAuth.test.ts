import { describe, it, expect, vi, beforeEach } from "vitest";
import { authorizeAppealReview } from "../../src/utils/modAuth.js";
import { PermissionFlagsBits } from "discord.js";
import * as discordBot from "../../src/discordBot.js";

describe("authorizeAppealReview", () => {
  let mockDb: any;
  let mockAdmins: any;
  let mockModerators: any;
  let mockServers: any;
  let mockBotClient: any;
  let mockGuild: any;
  let mockMember: any;

  beforeEach(() => {
    mockAdmins = {};
    mockModerators = {};
    mockServers = {};
    
    mockDb = {
      collection: (col: string) => ({
        doc: (id: string) => ({
          get: async () => {
            if (col === "admins" && mockAdmins[id]) return { exists: true, data: () => mockAdmins[id] };
            if (col === "moderators" && mockModerators[id]) return { exists: true, data: () => mockModerators[id] };
            if (col === "servers" && mockServers[id]) return { exists: true, data: () => mockServers[id] };
            return { exists: false, data: () => undefined };
          }
        })
      })
    };

    mockMember = {
      permissions: { has: vi.fn().mockReturnValue(false) },
      roles: { cache: { has: vi.fn().mockReturnValue(false) } }
    };

    mockGuild = {
      members: { fetch: vi.fn().mockResolvedValue(mockMember) }
    };

    mockBotClient = {
      isReady: () => true,
      guilds: { fetch: vi.fn().mockResolvedValue(mockGuild) }
    };

    vi.spyOn(discordBot, "getBotClient").mockReturnValue(mockBotClient);
  });

  it("allows super admins regardless of discord status", async () => {
    mockAdmins["admin1"] = true;
    mockBotClient.isReady = () => false; // offline bot
    await expect(authorizeAppealReview("admin1", undefined, "server1", mockDb)).resolves.toBe(true);
  });

  it("fails closed when bot is offline and not trusted mod", async () => {
    mockBotClient.isReady = () => false;
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).rejects.toThrow(/Forbidden.*offline/);
  });

  it("allows trusted stored mod when bot is offline", async () => {
    mockBotClient.isReady = () => false;
    mockModerators["mod@test.com"] = { serverIds: ["server1"] };
    await expect(authorizeAppealReview("user1", "mod@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("denies if bot cannot fetch guild and user is not stored mod", async () => {
    mockBotClient.guilds.fetch.mockRejectedValue(new Error("Unknown guild"));
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).rejects.toThrow(/cannot access the server/);
  });

  it("allows trusted stored mod if bot cannot fetch guild", async () => {
    mockBotClient.guilds.fetch.mockRejectedValue(new Error("Unknown guild"));
    mockModerators["mod@test.com"] = { serverIds: ["server1"] };
    await expect(authorizeAppealReview("user1", "mod@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("denies if user is not member of guild", async () => {
    mockGuild.members.fetch.mockRejectedValue(new Error("Unknown member"));
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).rejects.toThrow(/not a member/);
  });

  it("allows user with Administrator permission", async () => {
    mockMember.permissions.has.mockImplementation((p: bigint) => p === PermissionFlagsBits.Administrator);
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("allows user with ManageMessages permission", async () => {
    mockMember.permissions.has.mockImplementation((p: bigint) => p === PermissionFlagsBits.ManageMessages);
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("allows user with ModerateMembers permission", async () => {
    mockMember.permissions.has.mockImplementation((p: bigint) => p === PermissionFlagsBits.ModerateMembers);
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("allows user with custom mod role", async () => {
    mockServers["server1"] = { modRoleId: "modRole123" };
    mockMember.roles.cache.has.mockImplementation((id: string) => id === "modRole123");
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).resolves.toBe(true);
  });

  it("denies user without permissions or custom role", async () => {
    mockServers["server1"] = { modRoleId: "modRole123" };
    await expect(authorizeAppealReview("user1", "user@test.com", "server1", mockDb)).rejects.toThrow(/do not have the required Discord permissions/);
  });

  it("denies unrelated linked user (i.e. stored mod for different server)", async () => {
    mockModerators["mod@test.com"] = { serverIds: ["server2"] };
    await expect(authorizeAppealReview("user1", "mod@test.com", "server1", mockDb)).rejects.toThrow(/do not have the required Discord permissions/);
  });
});
