import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as appealsBotLogic from '../../src/appealsBotLogic.js';
import { parseAppealInteractionId } from '../../src/utils/discordCommands.js';
import { routeAppealInteraction } from '../../src/appealsBotLogic.js';
import { db } from '../../src/discordBot.js';

// Mock dependencies
vi.mock('../../src/discordBot.js', async () => {
  const original = await vi.importActual('../../src/discordBot.js') as any;
  return {
    ...original,
    db: {
      collection: vi.fn(),
      runTransaction: vi.fn(),
      collectionGroup: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ empty: true })
              })
            })
          })
        })
      }),
    },
    getBotClient: vi.fn().mockReturnValue(null),
    getServerLanguage: vi.fn().mockResolvedValue('en'),
  };
});

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  }
}));

describe('Appeal Interaction Router & Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('routeAppealInteraction (Dispatcher)', () => {
    beforeEach(() => {
    });

    afterEach(() => {
    });

    it('handles old customId === "appeal" with a migration message', async () => {
      const interaction: any = {
        type: 3, // MESSAGE_COMPONENT
        isButton: () => true,
        isRepliable: () => true,
        reply: vi.fn().mockResolvedValue(undefined),
        customId: 'appeal'
      };

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(true);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: "This older appeal button could not be matched to a case. Use `/appeal` in DMs or `/appeal case_id:<case id>` with the case ID shown in this message.",
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    });

    it('routes appeal:{serverId}:{caseId} button in DM without guild guard', async () => {
      const interaction: any = {
        type: 3,
        isButton: () => true,
        isRepliable: () => true,
        isModalSubmit: () => false,
        isChatInputCommand: () => false,
        customId: 'appeal:server1:case1',
        guildId: null, // DM
        showModal: vi.fn().mockResolvedValue(undefined),
      };

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(true);
    });

    it('routes appeal:{serverId}:{caseId} button in Guild without guild guard', async () => {
      const interaction: any = {
        type: 3,
        isButton: () => true,
        isRepliable: () => true,
        isModalSubmit: () => false,
        isChatInputCommand: () => false,
        customId: 'appeal:server1:case1',
        guildId: 'server1',
        showModal: vi.fn().mockResolvedValue(undefined),
      };

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(true);
    });

    it('routes submit_appeal:{serverId}:{caseId} modal', async () => {
      const interaction: any = {
        type: 5, // MODAL_SUBMIT
        isButton: () => false,
        isModalSubmit: () => true,
        isChatInputCommand: () => false,
        isRepliable: () => true,
        customId: 'submit_appeal:server1:case1',
        guildId: 'server1',
        fields: { getTextInputValue: vi.fn().mockReturnValue('test') },
        user: { id: '123' },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      // We mock db collection for this specific test so it doesn't crash the real db
      (db.collection as any).mockReturnValue({ doc: vi.fn().mockReturnValue({}) });
      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ userId: '123', appealStatus: 'none', actionTaken: 'warn' }) }), update: vi.fn() });
      });

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(true);
    });

    it('routes /appeal in DMs without hitting guild guard', async () => {
      const interaction: any = {
        type: 2, // APPLICATION_COMMAND
        isButton: () => false,
        isModalSubmit: () => false,
        isChatInputCommand: () => true,
        isRepliable: () => true,
        commandName: 'appeal',
        guildId: null, // DM
        options: { getString: vi.fn().mockReturnValue('case1') },
        user: { id: '123' },
        reply: vi.fn().mockResolvedValue(undefined),
      };

      (db.collection as any).mockReturnValue({ doc: vi.fn().mockReturnValue({}) });
      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ userId: '123', appealStatus: 'none', actionTaken: 'warn' }) }), update: vi.fn() });
      });

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(true);
    });

    it('blocks other actions if no guildId', async () => {
      const interaction: any = {
        type: 2,
        isButton: () => false,
        isModalSubmit: () => false,
        isChatInputCommand: () => true,
        isRepliable: () => true,
        commandName: 'settings', // Some random command
        guildId: null // DM
      };

      const result = await routeAppealInteraction(interaction);
      expect(result).toBe(false); // Returns false, meaning it is not an appeal interaction!
    });
  });

  describe('parseAppealInteractionId', () => {
    it('accepts valid open IDs', () => {
      expect(parseAppealInteractionId('appeal:123:456')).toEqual({ type: 'open', serverId: '123', caseId: '456' });
    });

    it('accepts valid submit IDs', () => {
      expect(parseAppealInteractionId('submit_appeal:123:abc')).toEqual({ type: 'submit', serverId: '123', caseId: 'abc' });
    });

    it('rejects malformed IDs safely', () => {
      expect(parseAppealInteractionId('appeal')).toBeNull();
      expect(parseAppealInteractionId('submit_appeal')).toBeNull();
      expect(parseAppealInteractionId('appeal:123')).toBeNull();
      expect(parseAppealInteractionId('appeal:123:456:789')).toBeNull();
      expect(parseAppealInteractionId('appeal:123/../../:456')).toBeNull();
      expect(parseAppealInteractionId('random:123:456')).toBeNull();
      expect(parseAppealInteractionId('')).toBeNull();
    });
  });

  describe('openAppealModal', () => {
    it('immediately calls showModal without network requests', async () => {
      const interaction: any = {
        showModal: vi.fn().mockResolvedValue(undefined),
      };
      await appealsBotLogic.openAppealModal(interaction, 'server1', 'case1');
      
      expect(interaction.showModal).toHaveBeenCalledTimes(1);
      expect(interaction.showModal.mock.calls[0][0].data.custom_id).toBe('submit_appeal:server1:case1');
      expect((db.collection as any)).not.toHaveBeenCalled();
    });
  });

  describe('handleAppealModalSubmit', () => {
    it('creates appeal for valid submission', async () => {
      const interaction: any = {
        user: { id: 'user1' },
        fields: { getTextInputValue: () => 'I did nothing wrong' },
        reply: vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
      };

      const mockData = {
        userId: 'user1',
        appealStatus: 'none',
        serverId: 'server1',
        expiresAt: { toDate: () => new Date(Date.now() + 100000) },
        actionTaken: 'warn'
      };

      const mockSnap = { exists: true, data: () => mockData };
      const mockRef = {};

      (db.collection as any).mockReturnValue({
        doc: vi.fn().mockReturnValue(mockRef)
      });

      let transactionCallback: any;
      (db.runTransaction as any).mockImplementation((cb: any) => {
        transactionCallback = cb;
        return cb({
          get: vi.fn().mockResolvedValue(mockSnap),
          update: vi.fn()
        });
      });

      await appealsBotLogic.handleAppealModalSubmit(interaction, 'server1', 'case1');

      expect(db.runTransaction).toHaveBeenCalledTimes(1);
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('successfully submitted'),
        ephemeral: true
      }));
    });

    it('rejects another user submitting', async () => {
      const interaction: any = {
        user: { id: 'user2' },
        fields: { getTextInputValue: () => 'I did nothing wrong' },
        reply: vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
      };

      const mockData = {
        userId: 'user1',
        appealStatus: 'none',
        actionTaken: 'warn'
      };

      (db.collection as any).mockReturnValue({
        doc: vi.fn().mockReturnValue({})
      });

      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({
          get: vi.fn().mockResolvedValue({ exists: true, data: () => mockData }),
          update: vi.fn()
        });
      });

      await appealsBotLogic.handleAppealModalSubmit(interaction, 'server1', 'case1');

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: "Cannot submit appeal for another user's case.",
        ephemeral: true
      }));
    });

    it('rejects expired case', async () => {
      const interaction: any = {
        user: { id: 'user1' },
        fields: { getTextInputValue: () => 'I did nothing wrong' },
        reply: vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
      };

      const mockData = {
        userId: 'user1',
        appealStatus: 'none',
        expiresAt: { toDate: () => new Date(Date.now() - 100000) },
        actionTaken: 'warn'
      };

      (db.collection as any).mockReturnValue({ doc: vi.fn().mockReturnValue({}) });
      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({ get: vi.fn().mockResolvedValue({ exists: true, data: () => mockData }), update: vi.fn() });
      });

      await appealsBotLogic.handleAppealModalSubmit(interaction, 'server1', 'case1');

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: "This appeal window has expired."
      }));
    });

    it('rejects already appealed case', async () => {
      const interaction: any = {
        user: { id: 'user1' },
        fields: { getTextInputValue: () => 'I did nothing wrong' },
        reply: vi.fn().mockResolvedValue(undefined),
        replied: false,
        deferred: false,
      };

      const mockData = {
        userId: 'user1',
        appealStatus: 'submitted',
        actionTaken: 'warn'
      };

      (db.collection as any).mockReturnValue({ doc: vi.fn().mockReturnValue({}) });
      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({ get: vi.fn().mockResolvedValue({ exists: true, data: () => mockData }), update: vi.fn() });
      });

      await appealsBotLogic.handleAppealModalSubmit(interaction, 'server1', 'case1');

      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
        content: "This case has already been appealed."
      }));
    });

    it('uses safe response helper when already acknowledged', async () => {
      const interaction: any = {
        user: { id: 'user1' },
        fields: { getTextInputValue: () => 'Test' },
        reply: vi.fn().mockResolvedValue(undefined),
        followUp: vi.fn().mockResolvedValue(undefined),
        replied: true,
        deferred: false,
      };

      const mockData = { userId: 'user2', appealStatus: 'none', actionTaken: 'warn' };
      (db.collection as any).mockReturnValue({ doc: vi.fn().mockReturnValue({}) });
      (db.runTransaction as any).mockImplementation((cb: any) => {
        return cb({ get: vi.fn().mockResolvedValue({ exists: true, data: () => mockData }), update: vi.fn() });
      });

      await appealsBotLogic.handleAppealModalSubmit(interaction, 'server1', 'case1');

      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({
        content: "Cannot submit appeal for another user's case."
      }));
    });
  });
});
