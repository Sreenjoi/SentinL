import React, { useState, useEffect } from "react";
import { EmptyState, CompactEmptyState } from "./EmptyState";
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { ProGate } from "./ProGate";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { Gift, Plus, Trash2, Calendar, Users, Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { PermissionsWarning } from "./PermissionsWarning";
import { PermissionGateModal } from "./PermissionGateModal";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";

export default function GiveawaysManager() {
  const { selectedServerId, tier, botPermissions, isBetaTester, isTrial , isPro} = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [activeGiveaways, setActiveGiveaways] = useState<any[]>([]);
  const [recentEndedGiveaways, setRecentEndedGiveaways] = useState<any[]>([]);
  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [discordChannels, setDiscordChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Form state
  const [prize, setPrize] = useState("");
  const [winners, setWinners] = useState(1);
  const [durationHours, setDurationHours] = useState(24);
  const [channelId, setChannelId] = useState("");
  const [requirements, setRequirements] = useState("");

  useEffect(() => {
    if (!selectedServerId) return;

    if (discordRoles.length === 0) {
      auth.currentUser?.getIdToken().then(token => {
        fetch(`/api/discord/roles/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.roles) setDiscordRoles(data.roles);
          })
          .catch((err) => console.error("Failed to fetch roles", err));
          
        fetch(`/api/discord/channels/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.channels) setDiscordChannels(data.channels);
          })
          .catch((err) => console.error("Failed to fetch channels", err));
      });
    }

    const activeQ = query(
      collection(db, `servers/${selectedServerId}/giveaways`),
      where("status", "==", "active")
    );
    const unsubActive = onSnapshot(activeQ, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setActiveGiveaways(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/giveaways`));

    const endedQ = query(
      collection(db, `servers/${selectedServerId}/giveaways`),
      where("status", "==", "ended"),
      orderBy("endsAt", "desc"),
      limit(10)
    );
    const unsubEnded = onSnapshot(endedQ, (snap) => {
      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setRecentEndedGiveaways(data);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/giveaways`));

    return () => {
      unsubActive();
      unsubEnded();
    };
  }, [selectedServerId]);

  const handleCreate = async () => {
    if (!prize || !channelId) {
      toast.error("Please fill in prize and channel ID");
      return;
    }

    if (botPermissions && !botPermissions.SendMessages) {
      setMissingPermModal("Send Messages");
      return;
    }
    if (botPermissions && !botPermissions.EmbedLinks) {
      setMissingPermModal("Embed Links");
      return;
    }

    setCreating(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Auth token missing");

      const res = await fetch(`/api/guilds/${selectedServerId}/giveaways/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prize,
          winnersCount: winners,
          durationHours,
          channelId,
          requirements
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to create giveaway");
      }
      
      toast.success("Giveaway created!");
      setPrize("");
      setWinners(1);
      setDurationHours(24);
      setChannelId("");
      setRequirements("");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to create giveaway");
    } finally {
      setCreating(false);
    }
  };

  const handleEnd = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Auth token missing");

      const res = await fetch(`/api/guilds/${selectedServerId}/giveaways/${id}/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to end giveaway");
      }

      toast.success("Giveaway ended manually.");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to end giveaway");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Auth token missing");
      const res = await fetch(`/api/guilds/${selectedServerId}/giveaways/${id}`, {
         method: "DELETE",
         headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.error || "Failed to delete giveaway");
      }
      toast.success("Giveaway deleted/canceled");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to delete giveaway record");
    }
  };

  if (loading) {
    return (
      <div className="space-y-10 animate-pulse">
        <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] border border-white/60 p-6 sm:p-10 shadow-xl shadow-primary/5 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-surface-container rounded-xl"></div>
            <div className="h-5 w-40 bg-surface-container rounded-md"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-3 w-20 bg-surface-container rounded-md ml-1"></div>
              <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 bg-surface-container rounded-md ml-1"></div>
              <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="h-3 w-24 bg-surface-container rounded-md ml-1"></div>
                <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-24 bg-surface-container rounded-md ml-1"></div>
                <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-32 bg-surface-container rounded-md ml-1"></div>
              <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <div className="h-12 w-40 bg-surface-container rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      {selectedServerId && (
        <PermissionsWarning 
          serverId={selectedServerId} 
          required={["SendMessages", "ReadMessageHistory"]} 
        />
      )}
      {/* Creation Form */}
      <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] border border-white/60 p-6 sm:p-10 shadow-xl shadow-primary/5 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary">
              <Gift className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-extrabold text-on-surface">Create Giveaway</h2>
          </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Prize</label>
            <input
              type="text"
              placeholder="e.g. 1 Month Discord Nitro"
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Channel ID</label>
            <ChannelSelector
              channels={discordChannels}
              value={channelId}
              onChange={setChannelId}
              placeholder="Select giveaway channel"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Winners Count</label>
              <input
                type="number"
                min="1"
                value={winners}
                onChange={(e) => setWinners(Number(e.target.value))}
                className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Duration (Hours)</label>
              <input
                type="number"
                min="1"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 transition-all outline-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">Role Requirement (Optional)</label>
            <RoleSelector
              roles={discordRoles}
              disablePositionCheck={true}
              value={requirements}
              onChange={setRequirements}
              placeholder="Leave blank for everyone..."
            />
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <ProGate isPro={isPro} featureName="Giveaways" featureDescription="Host server giveaways natively" className="cursor-pointer">
          <button
            onClick={creating || !prize || !channelId ? undefined : handleCreate}
            disabled={creating || !prize || !channelId}
            className="px-8 py-4 bg-primary text-white font-black uppercase tracking-widest rounded-2xl text-[11px] hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Launch Giveaway
          </button>
          </ProGate>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Active Giveaways */}
        <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] border border-white/60 p-6 sm:p-10 shadow-xl shadow-primary/5 space-y-6">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-extrabold text-on-surface">Active Giveaways</h2>
            <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(52,168,83,0.5)] animate-pulse" />
          </div>
          <div className="space-y-4">
            {activeGiveaways.length === 0 ? (
              <CompactEmptyState 
                title="No active giveaways."
                description="Start one to engage your community."
              />
            ) : (
              <AnimatePresence>
              {activeGiveaways.map((giveaway, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05, type: "spring", stiffness: 300, damping: 24 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={giveaway.id} className="bg-white p-5 rounded-2xl flex items-center justify-between border border-outline-variant/10 shadow-sm relative overflow-hidden group"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-success" />
                  <div className="pl-2">
                    <h3 className="font-bold text-on-surface text-base pr-4 line-clamp-1">{giveaway.prize}</h3>
                    <div className="flex items-center gap-4 text-[9px] uppercase font-black tracking-widest text-text-secondary mt-2 flex-wrap">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {giveaway.winnersCount} Winner{giveaway.winnersCount !== 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1" title="Participants"><Gift className="w-3 h-3" /> {giveaway.participantsCount || 0} Entries</span>
                      <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {discordChannels.find(c => c.id === giveaway.channelId)?.name || giveaway.channelId}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(giveaway.endsAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <button
                      onClick={() => handleEnd(giveaway.id)}
                      className="px-3 py-1 bg-yellow-500/10 text-yellow-600 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-yellow-500 hover:text-white transition-all"
                      title="End Giveaway Early"
                    >
                      End
                    </button>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            )}
          </div>
        </div>
        
        {/* Ended Giveaways */}
        <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] border border-white/60 p-6 sm:p-10 shadow-xl shadow-primary/5 space-y-6">
          <h2 className="text-lg font-extrabold text-on-surface opacity-70">Ended Giveaways</h2>
          <div className="space-y-4">
            {recentEndedGiveaways.length === 0 ? (
              <CompactEmptyState 
                title="No ended giveaways."
                description="Past giveaways will appear here."
              />
            ) : (
              <AnimatePresence>
              {recentEndedGiveaways.map((giveaway, idx) => (
                <motion.div 
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0, transition: { delay: idx * 0.05, type: "spring", stiffness: 300, damping: 24 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={giveaway.id} className="bg-white/50 opacity-60 p-5 rounded-2xl flex items-center justify-between border border-outline-variant/10 group"
                >
                  <div className="pl-2 min-w-0 pr-4">
                    <h3 className="font-bold text-on-surface line-through truncate">{giveaway.prize}</h3>
                    <div className="text-[9px] uppercase font-black tracking-widest text-text-secondary mt-1">
                      Ended on {new Date(giveaway.endsAt).toLocaleString()}
                      {giveaway.winners?.length > 0 && (
                        <div className="mt-1 flex items-center gap-1.5 text-primary">
                           <Gift className="w-3 h-3" /> Winners: {giveaway.winners.length}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}