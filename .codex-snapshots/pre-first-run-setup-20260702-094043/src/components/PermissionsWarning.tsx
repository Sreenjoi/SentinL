import React, { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { auth } from "../firebase";

export type PermissionType = 
  | "SendMessages"
  | "ManageRoles"
  | "KickMembers"
  | "BanMembers"
  | "ManageMessages"
  | "ModerateMembers"
  | "ReadMessageHistory"
  | "AddReactions"
  | "AttachFiles"
  | "EmbedLinks";

const PERMISSION_LABELS: Record<PermissionType, string> = {
  SendMessages: "Send Messages",
  ManageRoles: "Manage Roles",
  KickMembers: "Kick Members",
  BanMembers: "Ban Members",
  ManageMessages: "Manage Messages",
  ModerateMembers: "Moderate Members / Timeout",
  ReadMessageHistory: "Read Message History",
  AddReactions: "Add Reactions",
  AttachFiles: "Attach Files",
  EmbedLinks: "Embed Links",
};

export const DOWNSTREAM_EFFECTS: Record<PermissionType, string> = {
  SendMessages: "Warnings & replies disabled",
  ManageRoles: "Reaction roles & leveling rewards disabled",
  KickMembers: "Kick actions disabled",
  BanMembers: "Ban actions disabled",
  ManageMessages: "Auto-delete disabled",
  ModerateMembers: "Timeout disabled",
  ReadMessageHistory: "Context/history scanning disabled",
  AddReactions: "Giveaways styling disabled",
  AttachFiles: "Image generation disabled",
  EmbedLinks: "Rich message embeds disabled",
};

interface Props {
  serverId: string;
  required: PermissionType[];
}

export function PermissionsWarning({ serverId, required }: Props) {
  const [checking, setChecking] = useState(true);
  const [missing, setMissing] = useState<PermissionType[]>([]);

  useEffect(() => {
    if (!serverId) return;
    setChecking(true);
    auth.currentUser?.getIdToken().then(token => {
      fetch(`/api/discord/permissions/${serverId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(async (res) => {
          if (!res.ok) {
            if (res.status === 404 || res.status === 503) {
              return null; // Ignore missing bot/server
            }
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            return res.json();
          } else {
            throw new Error("Response was not JSON");
          }
        })
        .then(data => {
          if (data && data.permissions) {
            const m = required.filter(p => !data.permissions[p]);
            setMissing(m as PermissionType[]);
          }
        })
        .catch(err => console.debug("Permissions check conditionally failed:", err))
        .finally(() => setChecking(false));
    });
  }, [serverId, required.join(",")]);

  if (checking) {
    return (
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center mb-8 mx-auto w-full animate-pulse">
        <div className="bg-surface-container w-12 h-12 rounded-full shrink-0"></div>
        <div className="flex-1 space-y-2">
           <div className="h-5 w-48 bg-surface-container rounded-md"></div>
           <div className="h-4 w-full max-w-xl bg-surface-container rounded-md"></div>
        </div>
      </div>
    );
  }

  if (missing.length > 0) {
    return (
      <div className="bg-warning/10 border-[4px] border-warning shadow-[0_0_15px_rgba(251,146,60,0.5)] animate-pulse rounded-2xl p-6 flex flex-col md:flex-row gap-4 items-start md:items-center mb-8 mx-auto w-full">
        <div className="bg-warning/20 p-3 rounded-full shrink-0">
          <AlertCircle className="w-6 h-6 text-warning" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-warning mb-1">
            Missing Discord Permissions
          </h3>
          <p className="text-sm text-text-secondary mb-3">
            SentinL needs the following permissions to fully operate this feature. Please update the bot's permissions in your Discord Server Settings to prevent errors.
          </p>
          <p className="text-xs text-text-secondary mb-3">
            If normal message moderation still does not work after permissions are fixed, check Message Content Intent in the Discord Developer Portal. Discord blocks bots from reading message text unless this is enabled.
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.map((perm) => (
              <span key={perm} className="bg-warning/10 text-warning px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <span>{PERMISSION_LABELS[perm] || perm}</span>
                <span className="opacity-50 font-normal lowercase bg-warning/20 px-2 py-0.5 rounded-md">({DOWNSTREAM_EFFECTS[perm]})</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
