import { logger } from "../utils/logger.js";
import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";

// Types for internal integration tracking
export interface SocialIntegration {
  id: string;
  serverId: string;
  platform: "youtube" | "twitch";
  targetId: string;
  targetName: string;
  targetUrl: string;
  announcementChannelId: string;
  enabled: boolean;
  lastProcessedId?: string;
  processingId?: string | null;
  processingStartedAt?: number;
  pingRoleId?: string;
  includeShorts?: boolean;
}

let cachedTwitchToken: string | null = null;
let twitchTokenExpiry: number = 0;

async function getTwitchToken(): Promise<string | null> {
  if (cachedTwitchToken && Date.now() < twitchTokenExpiry) {
    return cachedTwitchToken;
  }
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json() as any;
  cachedTwitchToken = data.access_token;
  const safeExpiresIn = data.expires_in < 300 ? data.expires_in : (data.expires_in - 300);
  twitchTokenExpiry = Date.now() + safeExpiresIn * 1000;
  return cachedTwitchToken;
}

export class SocialIntegrationService {
  private client: Client;
  private db: FirebaseFirestore.Firestore;

  constructor(client: Client, db: FirebaseFirestore.Firestore) {
    this.client = client;
    this.db = db;
  }

  /**
   * Main polling task to be run every X minutes
   */
  async runPollingTasks() {
    logger.info("[Social Integrations] Running polling tasks...");

    try {
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
      let hasMore = true;
      let totalProcessed = 0;

      while (hasMore) {
        let query = this.db
          .collectionGroup("integrations")
          .where("enabled", "==", true)
          .limit(100);

        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];

        const integrations: SocialIntegration[] = [];
        snapshot.forEach((doc) => {
          const pathParts = doc.ref.path.split("/");
          const serverId = pathParts[1];
          integrations.push({
            id: doc.id,
            serverId,
            ...doc.data(),
          } as SocialIntegration);
        });

        logger.info(
          `[Social Integrations] Processing batch of ${integrations.length} enabled integrations.`,
        );

        for (const integration of integrations) {
          // Enforce premium check per integration
          const isPremium = await this.checkPremium(integration.serverId);
          if (!isPremium) {
            logger.warn(
              `[Social Integrations] Skipping ${integration.id} on ${integration.serverId} - Non-premium server.`,
            );
            continue;
          }

          switch (integration.platform) {
            case "youtube":
              await this.processYoutube(integration);
              break;
            case "twitch":
              await this.processTwitch(integration);
              break;
          }
        }
        
        totalProcessed += integrations.length;
      }
      
      logger.info(`[Social Integrations] Finished processing ${totalProcessed} total integrations.`);
    } catch (error: any) {
      logger.error({ err: error }, "Background sync for social integrations array failed");
    }
  }

  private async checkPremium(serverId: string): Promise<boolean> {
    const { isServerPremium } = await import("../utils/entitlements.js");
    return isServerPremium(serverId, this.db);
  }

  private async processYoutube(integration: SocialIntegration) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return;

    try {
      // Get the 'uploads' playlist ID for the channel
      // Step 1: Get channel details to find uploads playlist
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&id=${integration.targetId}&key=${apiKey}`,
      );
      if (!channelRes.ok) return;
      const channelData = (await channelRes.json()) as any;

      if (!channelData.items?.[0]) return;
      const uploadsPlaylistId =
        channelData.items[0].contentDetails.relatedPlaylists.uploads;
      const channelName = channelData.items[0].snippet.title;

      // Step 2: Get latest video from that playlist
      const playlistRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=5&key=${apiKey}`,
      );
      if (!playlistRes.ok) return;
      const playlistData = (await playlistRes.json()) as any;

      if (!playlistData.items?.[0]) return;

      // Find the most recent video (skipping shorts if required)
      const latestItem = playlistData.items[0];
      const videoId = latestItem.snippet.resourceId.videoId;

      if (videoId === integration.lastProcessedId) return;
      
      const now = Date.now();
      if (videoId === integration.processingId) {
        // If it's the same processingId, only skip if it's less than 10 minutes old
        if (integration.processingStartedAt && now - integration.processingStartedAt < 10 * 60 * 1000) {
          return;
        }
      }

      // Update a processing marker to prevent concurrent duplicate processing
      await this.db
        .doc(`servers/${integration.serverId}/integrations/${integration.id}`)
        .update({
          processingId: videoId,
          processingStartedAt: now,
        });

      // For MVP, we just announce the very latest one
      // In a real app, you might iterate and post all new ones since lastProcessedId

      try {
        await this.postAnnouncement(integration, {
          title: latestItem.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail:
            latestItem.snippet.thumbnails.high?.url ||
            latestItem.snippet.thumbnails.default?.url,
          authorName: channelName,
          platformName: "YouTube",
        });

        // Finalize lastProcessedId after successful post
        await this.db
          .doc(`servers/${integration.serverId}/integrations/${integration.id}`)
          .update({
            lastProcessedId: videoId,
            targetName: channelName,
            processingId: null, // Clear the marker
            processingStartedAt: null,
          });
      } catch (postError) {
        logger.error({ err: postError }, `[Social Integrations] Failed to post YouTube announcement for ${integration.id}`);
        // Allow it to expire by leaving processingId and processingStartedAt as is
      }
    } catch (error: any) {
      logger.error({ err: error }, `[Social Integrations] YouTube processing error (${integration.id})`);
    }
  }

  private async processTwitch(integration: SocialIntegration) {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) return;

    try {
      // 1. Get Access Token
      const accessToken = await getTwitchToken();
      if (!accessToken) return;

      // 2. Check stream status
      const streamRes = await fetch(
        `https://api.twitch.tv/helix/streams?user_id=${integration.targetId}`,
        {
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (!streamRes.ok) return;
      const streamData = (await streamRes.json()) as any;

      if (streamData.data?.[0]) {
        const stream = streamData.data[0];
        const streamId = stream.id;

        // If 'lastProcessedId' is the stream ID, it means we already announced THIS specific stream session
        if (streamId === integration.lastProcessedId) return;

        const now = Date.now();
        if (streamId === integration.processingId) {
          // If it's the same processingId, only skip if it's less than 10 minutes old
          if (integration.processingStartedAt && now - integration.processingStartedAt < 10 * 60 * 1000) {
            return;
          }
        }

        // Update processing marker
        await this.db
          .doc(`servers/${integration.serverId}/integrations/${integration.id}`)
          .update({
            processingId: streamId,
            processingStartedAt: now,
          });

        try {
          await this.postAnnouncement(integration, {
            title: stream.title,
            url: `https://twitch.tv/${stream.user_login}`,
            thumbnail: stream.thumbnail_url
              .replace("{width}", "1280")
              .replace("{height}", "720"),
            authorName: stream.user_name,
            platformName: "Twitch",
            gameName: stream.game_name,
          });

          await this.db
            .doc(`servers/${integration.serverId}/integrations/${integration.id}`)
            .update({
              lastProcessedId: streamId,
              targetName: stream.user_name,
              processingId: null,
              processingStartedAt: null,
            });
        } catch (postError) {
          logger.error({ err: postError }, `[Social Integrations] Failed to post Twitch announcement for ${integration.id}`);
          // Allow it to expire by leaving processingId and processingStartedAt as is
        }
      } else {
        // Stream potentially offline, clear lastProcessedId if we want to re-announce next time they go live
        // Actually, if we keep lastProcessedId as the stream ID, it won't re-post until a NEW stream session starts.
      }
    } catch (error: any) {
      logger.error({ err: error }, `[Social Integrations] Twitch processing error (${integration.id})`);
    }
  }

  private async postAnnouncement(
    integration: SocialIntegration,
    data: {
      title: string;
      url: string;
      thumbnail?: string;
      authorName: string;
      platformName: string;
      gameName?: string;
    },
  ) {
    const channel = (await this.client.channels.fetch(
      integration.announcementChannelId,
    ).catch(() => null)) as TextChannel;
    if (!channel || !channel.isTextBased() || channel.guildId !== integration.serverId) return;

    const embed = new EmbedBuilder()
      .setTitle(data.title)
      .setURL(data.url)
      .setAuthor({ name: `${data.authorName} is on ${data.platformName}` })
      .setColor(this.getPlatformColor(integration.platform))
      .setTimestamp();

    if (data.thumbnail) {
      embed.setImage(data.thumbnail);
    }

    if (data.gameName) {
      embed.addFields({ name: "Playing", value: data.gameName, inline: true });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(`Watch on ${data.platformName}`)
        .setURL(data.url)
        .setStyle(ButtonStyle.Link),
    );

    const content = integration.pingRoleId
      ? `<@&${integration.pingRoleId}>`
      : undefined;

    await channel.send({
      content,
      embeds: [embed],
      components: [row],
      allowedMentions: integration.pingRoleId ? { roles: [integration.pingRoleId] } : { parse: [] },
    }).catch(e => logger.error({ err: e }, "Failed to send social integration announcement"));
  }

  private getPlatformColor(platform: string): number {
    switch (platform) {
      case "youtube":
        return 0xff0000;
      case "twitch":
        return 0x9146ff;
      default:
        return 0x5865f2;
    }
  }

  /**
   * Helper to resolve a YouTube URL or handle to a Channel ID
   */
  static async resolveYoutubeChannelId(
    input: string,
  ): Promise<{ id: string; name: string } | null> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey)
      throw new Error("YOUTUBE_API_KEY is not configured on the backend");

    // Handle @handle
    if (input.includes("@")) {
      const handle = input.split("@")[1].split("/")[0];
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=@${handle}&key=${apiKey}`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.items?.[0])
          return { id: data.items[0].id, name: data.items[0].snippet.title };
      }
    }

    // Handle /channel/ID
    const idMatch = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    if (idMatch) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&id=${idMatch[1]}&key=${apiKey}`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.items?.[0])
          return { id: data.items[0].id, name: data.items[0].snippet.title };
      }
    }

    return null;
  }

  /**
   * Helper to resolve Twitch name to ID
   */
  static async resolveTwitchUserId(
    login: string,
  ): Promise<{ id: string; name: string } | null> {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId)
      throw new Error(
        "TWITCH_CLIENT_ID is not configured on the backend",
      );

    const accessToken = await getTwitchToken();
    if (!accessToken) return null;

    const res = await fetch(
      `https://api.twitch.tv/helix/users?login=${login}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data.data?.[0])
      return { id: data.data[0].id, name: data.data[0].display_name };

    return null;
  }
}
