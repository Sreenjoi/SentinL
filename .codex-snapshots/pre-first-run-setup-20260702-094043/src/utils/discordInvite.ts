import { PermissionFlagsBits } from 'discord-api-types/v10';

export const DISCORD_BOT_PERMISSIONS = (
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.UseApplicationCommands |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers
).toString();

export function getDiscordInviteUrl(): string | null {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || clientId === "CLIENT_ID_PENDING") {
    return null;
  }
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${DISCORD_BOT_PERMISSIONS}&scope=bot%20applications.commands`;
}

