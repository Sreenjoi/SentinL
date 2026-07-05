import React from "react";
import { AlertTriangle } from "lucide-react";
import { getDiscordInviteUrl } from "../utils/discordInvite";

export function PermissionGateModal({ missing, onClose }: { missing: string | null, onClose: () => void }) {
  if (!missing) return null;
  
  const inviteUrl = getDiscordInviteUrl();

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-outline/20 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mb-6 text-danger">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-on-surface mb-2">Missing Permission</h3>
        <p className="text-text-secondary leading-relaxed mb-6">
          The dashboard cannot execute this action because the bot lacks the <strong>{missing}</strong> permission in your server. Please update the bot's permissions.
        </p>
        <div className="flex gap-3 justify-end mt-4">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl font-medium text-text-secondary hover:text-on-surface hover:bg-surface-variant transition-colors"
          >
            Cancel
          </button>
          {inviteUrl && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold bg-primary text-on-primary hover:opacity-90 transition-opacity"
            >
              Update Permissions
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
