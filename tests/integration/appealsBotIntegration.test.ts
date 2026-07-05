import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAppealCommand, handleAppealButton, openAppealModal, handleAppealModalSubmit } from "../../src/appealsBotLogic";
import * as discordBot from "../../src/discordBot";
import { FieldValue } from "firebase-admin/firestore";

describe("Appeals Bot Integration Security", () => {
    let mockDb: any;
    let mockInteraction: any;
    let dbState: any;
    let sentMessages: any[];

    beforeEach(() => {
        dbState = {
            "servers/S1/moderationCases/C1": {
                caseId: "C1", userId: "U1", appealStatus: "none", actionTaken: "timeout", reason: "spam", serverId: "S1",
                expiresAt: { toDate: () => new Date(Date.now() + 1000000) }
            },
            "servers/S1/moderationCases/C2_EXPIRED": {
                caseId: "C2_EXPIRED", userId: "U1", appealStatus: "none", actionTaken: "warn", reason: "spam", serverId: "S1",
                expiresAt: { toDate: () => new Date(Date.now() - 1000000) }
            },
            "servers/S1/moderationCases/C3_DUPE": {
                caseId: "C3_DUPE", userId: "U1", appealStatus: "submitted", actionTaken: "warn", reason: "spam", serverId: "S1",
                expiresAt: { toDate: () => new Date(Date.now() + 1000000) }
            },
            "servers/S1": { logChannelId: "CH1" }
        };
        sentMessages = [];

        mockDb = {
            collection: (colPath: string) => ({
                doc: (docId?: string) => {
                    const fullPath = docId ? `${colPath}/${docId}` : colPath;
                    return {
                        get: async () => {
                            const data = dbState[fullPath];
                            return { exists: !!data, data: () => data };
                        },
                        set: async (val: any) => { dbState[fullPath] = val; },
                        id: docId || "NEW_DOC"
                    };
                }
            }),
            runTransaction: async (cb: any) => {
                const t = {
                    get: async (ref: any) => ref.get(),
                    update: (ref: any, data: any) => {
                       const path = ref.id ? `servers/S1/moderationCases/${ref.id}` : "unknown";
                       if (dbState[path]) Object.assign(dbState[path], data);
                    }
                };
                await cb(t);
            }
        };

        vi.spyOn(discordBot, 'getBotClient').mockReturnValue({
            users: {
                fetch: async () => ({
                    send: async (msg: any) => { sentMessages.push({ type: 'dm', msg }); }
                })
            },
            channels: {
                fetch: async (id: string) => {
                    if (id === "CH1_WRONG_GUILD") {
                        return { isTextBased: () => true, isDMBased: () => false, guild: { id: "S2" }, send: async (msg: any) => { sentMessages.push({ type: 'channel', msg }); } };
                    }
                    if (id === "CH1") {
                        return { isTextBased: () => true, isDMBased: () => false, guild: { id: "S1" }, send: async (msg: any) => { sentMessages.push({ type: 'channel', msg }); } };
                    }
                    return null;
                }
            }
        } as any);

        discordBot.setDbForTest(mockDb);

        mockInteraction = {
            user: { id: "U1" },
            reply: vi.fn().mockResolvedValue(true),
            showModal: vi.fn().mockResolvedValue(true),
            fields: { getTextInputValue: () => "My appeal reason" }
        };
    });

    it("rejects wrong-user", async () => {
        mockInteraction.user.id = "U2_WRONG";
        console.log("TEST: calling handleAppealModalSubmit");
        try {
            await handleAppealModalSubmit(mockInteraction as any, "S1", "C1");
        } catch (e: any) {
            console.log("TEST CAUGHT UNEXPECTED ERROR:", e.message);
        }
        console.log("TEST: CALLS TO REPLY:", mockInteraction.reply.mock.calls);
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("another user's case") }));
    });

    it("rejects expired-case", async () => {
        mockInteraction.user.id = "U1";
        await handleAppealModalSubmit(mockInteraction as any, "S1", "C2_EXPIRED");
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("expired") }));
    });

    it("rejects duplicate-submit", async () => {
        mockInteraction.user.id = "U1";
        await handleAppealModalSubmit(mockInteraction as any, "S1", "C3_DUPE");
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("already been appealed") }));
    });

    it("verifies wrong-guild-channel prevention", async () => {
        dbState["servers/S1"].logChannelId = "CH1_WRONG_GUILD";
        await handleAppealModalSubmit(mockInteraction as any, "S1", "C1");
        // Ensure success for user but no log sent because guild ID mismatch
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("successfully submitted") }));
        expect(sentMessages.find(m => m.type === 'channel')).toBeUndefined();
    });

    it("mass-mention test: checks that ping parsing is disabled", async () => {
        await handleAppealModalSubmit(mockInteraction as any, "S1", "C1");
        const logMsg = sentMessages.find(m => m.type === 'channel');
        expect(logMsg).toBeDefined();
        // Mentions are disabled except the specific user array
        expect(logMsg.msg.allowedMentions).toEqual({ parse: [], users: ["U1"] });
        
        // Modal success reply has no pings
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }));
    });

    it("collision test: should safely handle concurrent execution in transaction", async () => {
        // Run two submits simultaneously. Firestore runTransaction will serialize or throw, here we just verify 
        // the logic protects subsequent calls if state changed.
        const originalTx = mockDb.runTransaction;
        let executions = 0;
        mockDb.runTransaction = async (cb: any) => {
            executions++;
            if (executions === 2) {
                // Simulate state change by the first
                dbState["servers/S1/moderationCases/C1"].appealStatus = "submitted"; 
            }
            return originalTx(cb);
        };

        await handleAppealModalSubmit(mockInteraction as any, "S1", "C1");
        const dupRes = await handleAppealModalSubmit(mockInteraction as any, "S1", "C1");
        // Second should be rejected
        expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("already been appealed") }));
    });
});
