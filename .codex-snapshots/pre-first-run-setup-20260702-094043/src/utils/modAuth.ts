import { isServerPremium } from "./entitlements.js";
import { getBotClient, db } from "../discordBot.js"; 
import { PermissionFlagsBits } from "discord.js";

const FREE_ACTIONS = ["dismiss", "dismiss_report", "submit_report", "submit_appeal", "uphold", "overturn", "remove", "approved"];
const PAID_ACTIONS = ["delete", "deleted", "delete_message", "delete_record", "warn", "warned", "timeout", "timedout", "ban", "kick", "kicked"];

const DESTRUCTIVE_ACTIONS = ["delete", "deleted", "delete_message", "warn", "warned", "timeout", "timedout", "ban", "kick", "kicked"];

export async function authorizeAppealReview(
  userId: string,
  email: string | undefined,
  serverId: string,
  adminDb: any
) {
  // 1. Check Super Admin
  const adminDoc = await adminDb.collection("admins").doc(userId).get();
  if (adminDoc.exists) return true;

  // 2. Check stored trusted moderator via moderators collection
  let isStoredMod = false;
  if (email) {
    const modDoc = await adminDb.collection("moderators").doc(email).get();
    if (modDoc.exists && (modDoc.data()?.serverIds || []).includes(serverId)) {
      isStoredMod = true;
    }
  }

  // 3. Discord Bot online check
  const client = getBotClient();
  if (!client || !client.isReady()) {
    // Bot is offline: fail closed unless stored trusted moderator
    if (isStoredMod) return true;
    throw Object.assign(new Error("Forbidden: Cannot verify Discord permissions because the bot is offline."), { status: 403 });
  }

  const guild = await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) {
    if (isStoredMod) return true;
    throw Object.assign(new Error("Forbidden: Cannot verify Discord permissions because the bot cannot access the server."), { status: 403 });
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw Object.assign(new Error("Forbidden: You are not a member of this server."), { status: 403 });
  }

  if (member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return true;
  }

  // Check custom mod role
  const serverDoc = await adminDb.collection("servers").doc(serverId).get();
  const modRoleId = serverDoc.data()?.modRoleId;
  if (modRoleId && member.roles.cache.has(modRoleId)) {
    return true;
  }

  throw Object.assign(new Error("Forbidden: You do not have the required Discord permissions to review appeals."), { status: 403 });
}

export async function authorizeModAction(
  userId: string, 
  serverId: string, 
  action: string, 
  adminDb: any,
  reason?: string,
  duration?: number,
  fromDashboard: boolean = false
) {
  if (!FREE_ACTIONS.includes(action) && !PAID_ACTIONS.includes(action)) {
    throw new Error(`Invalid action: ${action}`);
  }

  if (reason && reason.length > 500) {
    throw new Error("Reason exceeds maximum length of 500 characters.");
  }

  if (PAID_ACTIONS.includes(action)) {
    const isPro = await isServerPremium(serverId, adminDb);
    if (!isPro) {
      throw new Error("Forbidden: Feature only available for PRO tier users.");
    }
  }

  const isDestructive = DESTRUCTIVE_ACTIONS.includes(action);

  if (fromDashboard && !isDestructive) {
    return true; // Web dashboard calls already verify permissions via requireServerAuth
  }

  // Verify moderator permission
  const client = getBotClient();
  if (!client || !client.isReady()) {
    if (isDestructive) {
      throw new Error("Cannot verify Discord permissions right now. Please try again shortly.");
    }
  } else {
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) {
      if (isDestructive) {
        throw new Error("Cannot verify Discord permissions right now. Please try again shortly.");
      }
    } else {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        throw new Error("You are not a member of this server.");
      }

      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
      }

      if (isDestructive) {
        // Require specific permissions for destructive actions
        let requiredPerm: bigint | null = null;
        let requiredPermName = "";
        
        if (["delete", "deleted", "delete_message", "warn", "warned"].includes(action)) {
          requiredPerm = PermissionFlagsBits.ManageMessages;
          requiredPermName = "Manage Messages";
        } else if (["timeout", "timedout"].includes(action)) {
          requiredPerm = PermissionFlagsBits.ModerateMembers;
          requiredPermName = "Timeout Members";
        } else if (["kick", "kicked"].includes(action)) {
          requiredPerm = PermissionFlagsBits.KickMembers;
          requiredPermName = "Kick Members";
        } else if (action === "ban") {
          requiredPerm = PermissionFlagsBits.BanMembers;
          requiredPermName = "Ban Members";
        }

        if (requiredPerm && !member.permissions.has(requiredPerm)) {
          throw new Error(`You do not have the required Discord permissions (${requiredPermName}) for this action.`);
        }
      } else if (!fromDashboard) {
        // Non-destructive action from Discord interaction (fromDashboard=false)
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
           // Check custom role
           const serverDoc = await adminDb.collection("servers").doc(serverId).get();
           const modRoleId = serverDoc.data()?.modRoleId;
           if (!modRoleId || !member.roles.cache.has(modRoleId)) {
             throw new Error("You do not have permission to perform this action.");
           }
        }
      }
    }
  }

  return true;
}
