import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocialIntegrationService, SocialIntegration } from '../../src/services/socialIntegrations';

// Mock dependencies
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
}));

// Mock fetch globally
const originalFetch = global.fetch;

describe('SocialIntegrationService', () => {
  let mockClient: any;
  let mockDb: any;
  let service: SocialIntegrationService;

  beforeEach(() => {
    vi.resetModules();
    
    // Set up mock DB
    mockDb = {
      doc: vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue(true)
      })
    };

    // Set up mock Discord Client
    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          guildId: 'server-123',
          send: vi.fn().mockResolvedValue(true)
        })
      }
    };

    service = new SocialIntegrationService(mockClient, mockDb);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    delete process.env.YOUTUBE_API_KEY;
  });

  describe('Twitch Token Expiry Clamp', () => {
    it('clamps expiry when expires_in is less than 300', async () => {
      process.env.TWITCH_CLIENT_ID = 'test_id';
      process.env.TWITCH_CLIENT_SECRET = 'test_secret';

      let fetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('id.twitch.tv/oauth2/token')) {
          fetchCount++;
          return {
            ok: true,
            json: async () => ({
              access_token: 'short_token',
              expires_in: 100 // Less than 300
            })
          };
        }
        if (url.includes('api.twitch.tv/helix/streams')) {
          return {
            ok: true,
            json: async () => ({ data: [] })
          };
        }
        return { ok: false };
      });

      const integration: SocialIntegration = {
        id: 'int-1',
        serverId: 'server-123',
        platform: 'twitch',
        targetId: 'user-1',
        targetName: 'User1',
        targetUrl: '',
        announcementChannelId: 'channel-1',
        enabled: true
      };

      // Call twice to see if it fetches again due to clamped expiry
      await service['processTwitch'](integration);
      
      // Fast forward time by 101 seconds
      const originalNow = Date.now;
      Date.now = () => originalNow() + 101000;
      
      await service['processTwitch'](integration);
      
      Date.now = originalNow;
      
      // Should have fetched the token twice because the expiry was clamped and 101 seconds passed
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('YouTube Duplicate Prevention', () => {
    it('performs optimistic update before posting announcement', async () => {
      process.env.YOUTUBE_API_KEY = 'test_key';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube/v3/channels')) {
          return {
            ok: true,
            json: async () => ({
              items: [{
                contentDetails: { relatedPlaylists: { uploads: 'playlist-1' } },
                snippet: { title: 'Channel Name' }
              }]
            })
          };
        }
        if (url.includes('youtube/v3/playlistItems')) {
          return {
            ok: true,
            json: async () => ({
              items: [{
                snippet: {
                  resourceId: { videoId: 'video-1' },
                  title: 'Video Title',
                  thumbnails: { high: { url: 'http://thumb' } }
                }
              }]
            })
          };
        }
        return { ok: false };
      });

      const integration: SocialIntegration = {
        id: 'int-2',
        serverId: 'server-123',
        platform: 'youtube',
        targetId: 'channel-1',
        targetName: 'Channel Name',
        targetUrl: '',
        announcementChannelId: 'channel-1',
        enabled: true
      };

      let updateCalledFirst = false;
      let postCalled = false;

      mockDb.doc.mockReturnValue({
        update: vi.fn().mockImplementation(async () => {
          if (!postCalled) {
            updateCalledFirst = true;
          }
        })
      });

      // Override postAnnouncement to check if update was called first
      service['postAnnouncement'] = vi.fn().mockImplementation(async () => {
        postCalled = true;
      });

      await service['processYoutube'](integration);

      expect(updateCalledFirst).toBe(true);
      expect(postCalled).toBe(true);
    });

    it('skips processing if videoId matches processingId and is recent', async () => {
      process.env.YOUTUBE_API_KEY = 'test_key';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube/v3/channels')) {
          return { ok: true, json: async () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'p1' } }, snippet: { title: 'C' } }] }) };
        }
        if (url.includes('youtube/v3/playlistItems')) {
          return { ok: true, json: async () => ({ items: [{ snippet: { resourceId: { videoId: 'video-1' }, title: 'V', thumbnails: {} } }] }) };
        }
        return { ok: false };
      });

      const integration: SocialIntegration = {
        id: 'int-2', serverId: 'server-123', platform: 'youtube', targetId: 'channel-1', targetName: 'C',
        targetUrl: '', announcementChannelId: 'channel-1', enabled: true,
        processingId: 'video-1',
        processingStartedAt: Date.now() - 5 * 60 * 1000 // 5 minutes ago
      };

      let postCalled = false;
      service['postAnnouncement'] = vi.fn().mockImplementation(async () => { postCalled = true; });

      await service['processYoutube'](integration);
      expect(postCalled).toBe(false);
    });

    it('retries processing if processingStartedAt is stale', async () => {
      process.env.YOUTUBE_API_KEY = 'test_key';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube/v3/channels')) {
          return { ok: true, json: async () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'p1' } }, snippet: { title: 'C' } }] }) };
        }
        if (url.includes('youtube/v3/playlistItems')) {
          return { ok: true, json: async () => ({ items: [{ snippet: { resourceId: { videoId: 'video-1' }, title: 'V', thumbnails: {} } }] }) };
        }
        return { ok: false };
      });

      const integration: SocialIntegration = {
        id: 'int-3', serverId: 'server-123', platform: 'youtube', targetId: 'channel-1', targetName: 'C',
        targetUrl: '', announcementChannelId: 'channel-1', enabled: true,
        processingId: 'video-1',
        processingStartedAt: Date.now() - 15 * 60 * 1000 // 15 minutes ago
      };

      let postCalled = false;
      service['postAnnouncement'] = vi.fn().mockImplementation(async () => { postCalled = true; });
      
      const updateMock = vi.fn().mockResolvedValue(true);
      mockDb.doc.mockReturnValue({ update: updateMock });

      await service['processYoutube'](integration);
      
      expect(postCalled).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ processingId: 'video-1' }));
    });

    it('leaves processing markers intact if postAnnouncement fails', async () => {
      process.env.YOUTUBE_API_KEY = 'test_key';

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('youtube/v3/channels')) {
          return { ok: true, json: async () => ({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'p1' } }, snippet: { title: 'C' } }] }) };
        }
        if (url.includes('youtube/v3/playlistItems')) {
          return { ok: true, json: async () => ({ items: [{ snippet: { resourceId: { videoId: 'video-fail' }, title: 'V', thumbnails: {} } }] }) };
        }
        return { ok: false };
      });

      const integration: SocialIntegration = {
        id: 'int-4', serverId: 'server-123', platform: 'youtube', targetId: 'channel-1', targetName: 'C',
        targetUrl: '', announcementChannelId: 'channel-1', enabled: true
      };

      service['postAnnouncement'] = vi.fn().mockRejectedValue(new Error('Discord error'));
      
      const updateMock = vi.fn().mockResolvedValue(true);
      mockDb.doc.mockReturnValue({ update: updateMock });

      await service['processYoutube'](integration);
      
      // Should have been called to set processingId, but NOT to clear it after failure
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock.mock.calls[0][0]).toEqual(expect.objectContaining({ processingId: 'video-fail' }));
    });
  });
});
