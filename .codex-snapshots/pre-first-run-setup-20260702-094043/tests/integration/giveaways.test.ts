import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { processGiveaway } from "../../src/services/giveaway.ts";
import { FieldValue } from "firebase-admin/firestore";

// Statically analyze the implementation logic
describe("Giveaways Manager", () => {
    let serverCode: string;
    let botCode: string;

    beforeAll(() => {
        serverCode = fs.readFileSync(path.resolve(__dirname, "../../server.ts"), "utf-8");
        botCode = fs.readFileSync(path.resolve(__dirname, "../../src/discordBot.ts"), "utf-8");
    });

    it("verifies channel and role belong to serverId on creation", () => {
        expect(serverCode).toContain("if (!channel || channel.guildId !== serverId || !channel.isTextBased())");
        expect(serverCode).toContain("if (!role || role.guild.id !== serverId)");
    });

    it("uses backend cancel/delete endpoint instead of direct Firestore deletion", () => {
        expect(serverCode).toContain("app.delete(\"/api/guilds/:serverId/giveaways/:giveawayId\"");
    });
});

describe("Giveaway Side-Effects Retry-Safe", () => {
    let mockRef: any;
    let docData: any;
    
    beforeAll(() => {
        docData = {
           id: "G1",
           channelId: "C1",
           status: "active",
           prize: "Test Prize",
           winnersCount: 1,
           participantsCount: 0
        };
        mockRef = {
           id: "G1",
           get: async () => ({ exists: true, data: () => docData }),
           update: async (d: any) => { Object.keys(d).forEach(k => docData[k] = d[k] || "ts"); },
           collection: () => ({ get: async () => ({ docs: [{ id: "U1" }, { id: "U2" }] }) })
        };
    });

    it("processes a happy path giveaway", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as any);
        
        const mockDb = {
            runTransaction: async (cb: any) => {
                await cb({
                    get: async (r: any) => r.get(),
                    update: (r: any, d: any) => { Object.keys(d).forEach(k => docData[k] = d[k] || "ts"); }
                });
            }
        };

        const winners = await processGiveaway(mockDb, mockRef, "token123");
        expect(winners.length).toBe(1);
        expect(docData.status).toBe("ended");
        expect(docData.deliveryStatus).toBe("delivered");
        expect(docData.messageDisabledAt).toBeDefined();
        expect(docData.announcementSentAt).toBeDefined();
        
        fetchSpy.mockRestore();
    });

    it("fails cleanly on 403 for discord API calls and sets deliveryStatus = 'failed'", async () => {
        docData.status = "active";
        docData.deliveryStatus = undefined;
        docData.messageDisabledAt = undefined;
        docData.announcementSentAt = undefined;
        docData.winners = undefined;
        docData.lastDeliveryError = undefined;

        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 403, json: async () => ({}) } as any);
        
        const mockDb = {
            runTransaction: async (cb: any) => {
                await cb({
                    get: async (r: any) => r.get(),
                    update: (r: any, d: any) => { Object.keys(d).forEach(k => docData[k] = d[k] || "ts"); }
                });
            }
        };

        await expect(processGiveaway(mockDb, mockRef, "token123")).rejects.toThrow("403");
        
        expect(docData.status).toBe("ending"); // stuck in ending
        expect(docData.deliveryStatus).toBe("failed");
        expect(docData.lastDeliveryError).toContain("403");
        
        fetchSpy.mockRestore();
    });

    it("retries skipped completed steps and reuses stored winners on subsequent calls", async () => {
        docData.status = "ending";
        docData.messageDisabledAt = "already-disabled-timestamp";
        docData.announcementSentAt = undefined;
        docData.winners = ["U2"];

        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as any);
        
        const mockDb = {
            runTransaction: async (cb: any) => {
                await cb({
                    get: async (r: any) => r.get(),
                    update: (r: any, d: any) => { Object.keys(d).forEach(k => docData[k] = d[k] || "ts"); }
                });
            }
        };

        const winners = await processGiveaway(mockDb, mockRef, "token123");
        
        expect(winners).toEqual(["U2"]); // reuses
        
        expect(fetchSpy).toHaveBeenCalledTimes(1); // Only 1 call because message was already disabled, it should only send the announcement

        expect(docData.status).toBe("ended");
        expect(docData.announcementSentAt).toBeDefined();
        
        fetchSpy.mockRestore();
    });
    
    it("handles 404 cleanly by fallback to posting a new message", async () => {
        docData.status = "active";
        docData.messageDisabledAt = undefined;
        docData.announcementSentAt = undefined;
        docData.winners = undefined;

        let callCount = 0;
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
           callCount++;
           if (callCount === 1) return { ok: false, status: 404 } as any; // The original PATCH fails
           return { ok: true, status: 200 } as any; // Everything else succeeds
        });
        
        const mockDb = {
            runTransaction: async (cb: any) => {
                await cb({
                    get: async (r: any) => r.get(),
                    update: (r: any, d: any) => { Object.keys(d).forEach(k => docData[k] = d[k] || "ts"); }
                });
            }
        };

        const winners = await processGiveaway(mockDb, mockRef, "token123");
        expect(docData.status).toBe("ended");
        expect(callCount).toBe(3); // 1 = PATCH (404), 2 = POST fallback, 3 = POST announcement
        fetchSpy.mockRestore();
    });
});
