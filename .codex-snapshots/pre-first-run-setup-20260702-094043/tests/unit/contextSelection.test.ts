import { describe, it, expect, vi } from 'vitest';
import { shouldIncludeContext, buildRelevantContext } from '../../src/utils/moderationHelpers.js';

describe('Context Selection Logic', () => {
    it('context disabled for free servers', () => {
        expect(shouldIncludeContext(false, true)).toBe(false);
    });

    it('context disabled when useContext false', () => {
        expect(shouldIncludeContext(true, false)).toBe(false);
    });

    it('context included for ambiguous paid messages', () => {
        expect(shouldIncludeContext(true, true)).toBe(true);
    });

    it('buildRelevantContext selects only relevant messages and maps users', async () => {
        const mockMessages = new Map([
            ['1', { id: '1', author: { id: 'A', bot: false }, content: "Hello", createdTimestamp: 1000, mentions: { users: new Map() }, reference: null }],
            ['2', { id: '2', author: { id: 'B', bot: false }, content: "Not relevant", createdTimestamp: 2000, mentions: { users: new Map() }, reference: null }],
            ['3', { id: '3', author: { id: 'C', bot: false }, content: "I am responding to A", createdTimestamp: 3000, mentions: { users: new Map([['A', {}]]) }, reference: null }],
            ['4', { id: '4', author: { id: 'A', bot: false }, content: "Target message", createdTimestamp: 4000, mentions: { users: new Map() }, reference: { messageId: '3' } }],
        ]);
        
        const messagesNeedingFullPass = [
            {
               msg: {
                   id: '4',
                   author: { id: 'A' },
                   content: "Target message",
                   createdTimestamp: 4000,
                   mentions: { users: [] },
                   reference: { messageId: '3' },
                   channel: {
                       messages: {
                           fetch: async () => mockMessages
                       }
                   }
               }
            }
        ];

        const context = await buildRelevantContext(messagesNeedingFullPass as any);
        expect(context).toContain('User1: Hello');
        expect(context).not.toContain('Not relevant');
        expect(context).toContain('User2: I am responding to A');
        expect(context).toContain('User1: Target message');
        expect(context.split('\n').length).toBeLessThanOrEqual(5); // Max length enforced
    });

    it('irrelevant old context excluded', async () => {
        const mockMessages = new Map([
            ['1', { id: '1', author: { id: 'A', bot: false }, content: "Very old msg", createdTimestamp: 1000, mentions: { users: [] }, reference: null }],
            ['2', { id: '2', author: { id: 'B', bot: false }, content: "Target message", createdTimestamp: 300000, mentions: { users: [] }, reference: null }],
        ]);
        
        const messagesNeedingFullPass = [
            {
               msg: {
                   id: '2',
                   author: { id: 'B' },
                   content: "Target message",
                   createdTimestamp: 300000,
                   mentions: { users: [] },
                   channel: { messages: { fetch: async () => mockMessages } }
               }
            }
        ];
        const context = await buildRelevantContext(messagesNeedingFullPass as any);
        expect(context).toContain('User1: Target message');
        expect(context).not.toContain('Very old');
    });
});

