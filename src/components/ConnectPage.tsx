import React from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebase";
import { DiscordConnect, ServerSelector } from "./DiscordConnect";

import { motion } from "motion/react";

export default function ConnectPage() {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="max-w-2xl mx-auto space-y-6 pt-10 px-4"
    >
      <div>
        <h1 className="text-2xl font-black text-on-surface mb-2">Connect Discord</h1>
        <p className="text-sm text-text-secondary">
          To get started with SentinL, link your Discord account. 
          This lets you manage servers where you hold admin or moderator permissions.
        </p>
      </div>
      
      <div className="p-6 rounded-2xl bg-surface-container border border-outline-variant/30 space-y-6">
        <DiscordConnect userEmail={user?.email || ""} />
        
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-widest text-text-secondary mb-3">
            Select a Server
          </h2>
          <ServerSelector />
        </div>
      </div>
    </motion.div>
  );
}
