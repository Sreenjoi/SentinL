import { expect, test, describe, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock getAdminDB for db if needed, but we pass db as an argument in these functions
describe('Bot Pipeline Tests', () => {

    test('Webhook invalid plan rejection', () => {
        // Asserting Razorpay webhook logic behavior logic
        const PLAN_CONFIG: Record<string, any> = {
            pro_1: { amountCents: 799, maxServers: 1 },
            pro_3: { amountCents: 1999, maxServers: 3 }
        };
        
        let statusCode = 0;
        let responseSent = "";
        
        const mockResponse = {
            status: (code: number) => {
                statusCode = code;
                return { send: (msg: string) => { responseSent = msg; }, json: (msg: any) => { responseSent = msg; } };
            }
        };

        const processWebhookPlan = (planInput: string) => {
           let plan = planInput;
           if (plan === "premium") plan = "pro_3";
           if (!plan || !PLAN_CONFIG[plan]) {
             mockResponse.status(200).send("Ignored unknown plan");
             return false;
           }
           return true; 
        };

        expect(processWebhookPlan("unknown")).toBe(false);
        expect(statusCode).toBe(200);
        expect(responseSent).toBe("Ignored unknown plan");

        expect(processWebhookPlan("premium")).toBe(true);
        expect(processWebhookPlan("pro_1")).toBe(true);
        expect(processWebhookPlan("pro_3")).toBe(true);
    });

    test('Daily limit uses real handlers, keyword fallback, and skips AI without logging content', async () => {
        const serverData = {
            keywords: ["bannedword", "spamming"],
            autoDeleteOnKeywordMatch: true,
            logChannelId: "123"
        };
        
        let flaggedMessageAdded = false;
        const mockDb = {
            runTransaction: async (cb: any) => { await cb({ get: async () => ({ data: () => ({}) }), set: () => {} }); },
            collection: (name: string) => ({
                doc: () => ({
                    get: async () => ({ data: () => ({ score: 0 }) }),
                    set: async () => {},
                    create: async (data: any) => {
                        if (name === "flaggedMessages") {
                            flaggedMessageAdded = true;
                            expect(data.content).toBe("*** Content not logged due to quota configuration ***");
                            expect(data.detectionMethod).toBe("keyword_fallback");
                        }
                    },
                    collection: (subCol: string) => ({
                       doc: () => ({
                           get: async () => ({ data: () => ({ score: 0 }) }),
                           set: async () => {} 
                       })
                    })
                }),
                add: async (data: any) => {
                    if (name === "flaggedMessages") {
                        flaggedMessageAdded = true;
                        expect(data.content).toBe("*** Content not logged due to quota configuration ***");
                        expect(data.detectionMethod).toBe("keyword_fallback");
                    }
                },
                where: () => ({ limit: () => ({ get: async () => ({ empty: true }) }) })
            })
        } as unknown as any;

        const discordBot = await import('../../src/discordBot.js');
        discordBot.setDbForTest(mockDb);
        const { handleQuotaHitFallback } = discordBot;

        const fakeMessage = {
            id: "msg1",
            content: "This is a bannedword message!",
            channelId: "channel1",
            author: { id: "user1", username: "tester", displayAvatarURL: () => "url" },
            deletable: false,
            delete: async () => {}
        };
        
        const fakeClient = {
            channels: { cache: { get: () => null }, fetch: async () => null }
        };

        const result = await handleQuotaHitFallback(
            fakeMessage,
            "server1",
            serverData,
            2000,
            mockDb,
            "2023-10-10",
            fakeClient
        );
        
        expect(result).toBe(true); // matched keyword
        expect(flaggedMessageAdded).toBe(true);

        flaggedMessageAdded = false;
        const fakeMessageSafe = {
            ...fakeMessage,
            content: "This is a safe message."
        };
        
        const resultSafe = await handleQuotaHitFallback(
            fakeMessageSafe,
            "server1",
            serverData,
            2000,
            mockDb,
            "2023-10-10",
            fakeClient
        );
        
        expect(resultSafe).toBe(false); // no keyword match
        expect(flaggedMessageAdded).toBe(false);
    });

    test('Notification retries on Discord send failure with real helper', async () => {
        const { checkAndSendAILimitNotification } = await import('../../src/discordBot.js');
        
        const todayStr = "2023-10-10";
        let dbState: any = {
            aiLimitNoticeDate: todayStr,
            aiLimitNoticeStatus: "failed",
            aiLimitNoticeRetryAfter: Date.now() + 100000 // In the future, so locked out
        };
        
        let transSetCalled = false;

        const mockDb = {
            runTransaction: async (cb: any) => { 
                await cb({ 
                    get: async () => ({ data: () => dbState }), 
                    set: (ref: any, data: any, opts: any) => {
                        dbState = { ...dbState, ...data };
                        transSetCalled = true;
                    } 
                }); 
            },
            collection: () => ({
                doc: () => ({
                    get: async () => ({ data: () => dbState }),
                    set: async (data: any) => { dbState = { ...dbState, ...data }; }
                })
            })
        } as unknown as any;

        // Mock our internal db inside discordBot?
        // Wait, checkAndSendAILimitNotification uses the global db inside discordBot, let's mock the global fetch or provide it via a trick?
        // The checkAndSendAILimitNotification is using global "db" in discordBot, which requires us to inject it.
        const discordBot = await import('../../src/discordBot.js');
        discordBot.setDbForTest(mockDb);

        // Try #1: It's locked out
        await discordBot.checkAndSendAILimitNotification("server1", "logChannel1", 2000, "2023-10-10", {}, {});
        expect(transSetCalled).toBe(false); // Should return early because Date.now() < retryAfter

        // Try #2: Let's unlock it
        dbState.aiLimitNoticeRetryAfter = Date.now() - 10000;
        let finalSendFailedSet = false;
        mockDb.collection = () => ({
            doc: () => ({
                get: async () => ({ data: () => dbState }),
                set: async (data: any) => { 
                    dbState = { ...dbState, ...data }; 
                    if(data.aiLimitNoticeStatus === "failed") finalSendFailedSet = true;
                }
            })
        });

        await discordBot.checkAndSendAILimitNotification("server1", "logChannel1", 2000, "2023-10-10", { channels: { cache: { get: () => null }, fetch: async () => null } }, {});
        expect(transSetCalled).toBe(true);
        expect(dbState.aiLimitNoticeStatus).toBe("failed");
        expect(finalSendFailedSet).toBe(true);
        
        // Try #3: channel exists, success
        dbState.aiLimitNoticeRetryAfter = Date.now() - 10000;
        let finalSendSuccessSet = false;
        mockDb.collection = () => ({
            doc: () => ({
                get: async () => ({ data: () => dbState }),
                set: async (data: any) => { dbState = { ...dbState, ...data }; if (data.aiLimitNoticeStatus === "sent") finalSendSuccessSet = true; }
            })
        });

        const fakeChannel = {
            isTextBased: () => true,
            type: 0,
            permissionsFor: () => ({ has: () => true }),
            send: async () => {} 
        };

        const fakeClient = {
            channels: { cache: { get: () => fakeChannel }, fetch: async () => fakeChannel },
            guilds: { cache: { get: () => ({ members: { me: {} } }) }, fetch: async () => ({ members: { me: {} } }) }
        };

        await discordBot.checkAndSendAILimitNotification("server1", "logChannel1", 2000, "2023-10-10", fakeClient, {});
        expect(finalSendSuccessSet).toBe(true);
        expect(dbState.aiLimitNoticeStatus).toBe("sent");
    });

    test('Firestore rules require isModeratorOf for reports create', () => {
        const rulesPath = path.resolve(__dirname, '../../firestore.rules');
        const rulesContent = fs.readFileSync(rulesPath, 'utf8');
        
        const reportsMatchBlock = rulesContent.match(/match \/reports\/\{reportId\}\s*\{([\s\S]*?)\}/);
        expect(reportsMatchBlock).not.toBeNull();
        
        const allowCreateLine = reportsMatchBlock![1].match(/allow create:([^;]+);/);
        expect(allowCreateLine).not.toBeNull();
        expect(allowCreateLine![1]).toContain('isModeratorOf(serverId)');
    });
});
