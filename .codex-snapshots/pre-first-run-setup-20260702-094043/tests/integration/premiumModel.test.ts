import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { startDiscordBot, setDbForTest } from '../../src/discordBot';

describe('Premium Model Tracking', () => {
    beforeAll(async () => {
       process.env.GROQ_API_KEY = "dummy";
       await startDiscordBot();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createMockDb = (onFlag: (data: any) => void) => ({
        collection: (name: string) => {
            console.log(">>> DB Collection call:", name);
            return {
            doc: () => {
                console.log(">>> DB Doc called! inside", name);
                return {
                get: async () => { console.log(">>> DB GET"); return { data: () => ({ score: 0 }) }; },
                set: async () => { console.log(">>> DB SET"); },
                create: async (data: any) => { 
                    console.log('>>> DB CREATE ===', name, data);
                    if (name === 'flaggedMessages') {
                        onFlag(data);
                    }
                },
                collection: () => ({ doc: () => ({ set: async () => {} }) })
            }; },
            add: async (data: any) => { 
                console.log('>>> DB ADD', name, data);
            },
            where: () => ({ limit: () => ({ get: async () => {
                 console.log(">>> DB GET WHERE LIMIT -> EMPTY");
                 return { empty: true }; 
            } }) })
        }; },
        batch: () => ({
            set: () => {},
            commit: async () => {}
        })
    } as any);

    it('uses and stores premium_70b when dual model escalates for ambiguous full-pass', async () => {
       let loggedData: any = null;
       setDbForTest(createMockDb((d) => { loggedData = d; }));

       const globalFetchSpy = vi.spyOn(global, 'fetch')
         .mockImplementation(async (url: any, init: any) => {
            const body = JSON.parse(init.body);
            let responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':'+ '"Inappropriate"' + ',' + '"confidence"' + ':90,' + '"flag"' + ':true}]}';
            
            if (body.model.includes('3.3-70b')) {
                responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':' + '"Inappropriate"' + ',' + '"confidence"' + ':95,' + '"flag"' + ':true}]}';
            } else if (body.model.includes('3.1-8b') || body.model.includes('8b')) {
                if (init.body.includes('System Message:')) { 
                   responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':'+ '"Inappropriate"' + ',' + '"confidence"' + ':40,' + '"flag"' + ':true}]}';
                } else { 
                   responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':' + '"Inappropriate"' + ',' + '"confidence"' + ':40,' + '"flag"' + ':true}]}';
                }
            }
            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({
                    choices: [{ message: { content: responseStr } }],
                })
            } as any;
         });

        const executeAIModeration = (global as any).__executeAIModeration;

        const fakeReq = {
            serverId: '123',
            message: { id: 'msg1', content: 'something ambiguous here', createdAt: new Date(), author: { id: '1', username: 'u', displayAvatarURL: () => 'url' }, channelId: 'c1', delete: async () => {} },
            rulesText: 'no toxicity', trainingContextText: '', historyText: '',
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, enableDualModel: true }
        };

        await executeAIModeration(fakeReq);

        expect(globalFetchSpy).toHaveBeenCalled();
        expect(loggedData).not.toBeNull();
        expect(loggedData.model_used).toBe('premium_70b');
        expect(loggedData.detectionMethod).toBe('ai');
    });

    it('does NOT escalate to premium_70b for review-only sarcasm cases and logs ai_review_only', async () => {
       let loggedData: any = null;
       setDbForTest(createMockDb((d) => { loggedData = d; }));

       const globalFetchSpy = vi.spyOn(global, 'fetch')
         .mockImplementation(async (url: any, init: any) => {
            const body = JSON.parse(init.body);
            let responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':'+ '"Inappropriate"' + ',' + '"confidence"' + ':90,' + '"flag"' + ':true}]}';
            
            if (body.model.includes('3.3-70b')) {
                throw new Error('Should not have called 70B!');
            } else if (body.model.includes('3.1-8b') || body.model.includes('8b')) {
                if (init.body.includes('System Message:')) { 
                   responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':'+ '"Inappropriate"' + ',' + '"confidence"' + ':40,' + '"flag"' + ':true}]}';
                } else { 
                   responseStr = '{' + '"results"' + ':[{' + '"index"' + ':1,' + '"level"' + ':' + '"Safe"' + ',' + '"confidence"' + ':40,' + '"flag"' + ':false}]}';
                }
            }
            return {
                ok: true,
                headers: new Headers(),
                json: async () => ({
                    choices: [{ message: { content: responseStr } }],
                })
            } as any;
         });

        const executeAIModeration = (global as any).__executeAIModeration;

        const fakeReq = {
            serverId: '123',
            message: { id: 'msg2', content: 'bless your heart but you are completely clueless', createdAt: new Date(), author: { id: '1', username: 'u', displayAvatarURL: () => 'url' }, channelId: 'c1', delete: async () => {} },
            rulesText: 'no toxicity, no sarcasm', trainingContextText: '', historyText: '',
            isPremium: true, serverData: { primaryConfidenceThreshold: 75, enableDualModel: true }
        };

        await executeAIModeration(fakeReq);

        expect(globalFetchSpy).toHaveBeenCalled();
        expect(loggedData).not.toBeNull();
        expect(loggedData.model_used).toBe('primary_full'); 
        expect(loggedData.detectionMethod).toBe('ai_review_only');
        expect(loggedData.reviewOnly).toBe(true);
        
        let has70B = false;
        for (const call of globalFetchSpy.mock.calls) {
           if (call[1] && call[1].body && typeof call[1].body === 'string' && call[1].body.includes('70b')) has70B = true;
        }
        expect(has70B).toBe(false);
    });
});
