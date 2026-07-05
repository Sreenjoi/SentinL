import React, { useState, useEffect } from "react";
import { EmptyState, CompactEmptyState } from "./EmptyState";
import { useLocation } from "react-router-dom";
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { ProGate } from "./ProGate";
import {
  Youtube,
  Twitch,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  Hash,
  Bell,
  ShieldAlert,
  Loader2,
  Shield,
  Save,
  Check,
} from "lucide-react";
import { useSaveState } from "../hooks/useSaveState";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";
import { motion, AnimatePresence } from "motion/react";

interface Integration {
  id: string;
  platform: "youtube" | "twitch";
  targetId: string;
  targetName: string;
  targetUrl: string;
  announcementChannelId: string;
  enabled: boolean;
  pingRoleId?: string;
  lastProcessedId?: string;
}

const ProfileIcon = ({ integration }: { integration: Integration }) => {
  const [error, setError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

    if (error) {
    return (
      <div
        className={`p-3.5 rounded-2xl shadow-inner shrink-0 ${
          integration.platform === "youtube"
            ? "bg-red-500/10 text-red-500"
            : "bg-purple-500/10 text-purple-500"
        }`}
      >
        {integration.platform === "youtube" && (
          <Youtube className="w-6 h-6 fill-current" />
        )}
        {integration.platform === "twitch" && (
          <Twitch className="w-6 h-6 fill-current" />
        )}
      </div>
    );
  }

  const getAvatarUrl = () => {
    if (integration.platform === "youtube")
      return `https://unavatar.io/youtube/${integration.targetName}?fallback=false`;
    if (integration.platform === "twitch")
      return `https://unavatar.io/twitch/${integration.targetName}?fallback=false`;
    return `https://unavatar.io/${integration.targetUrl}?fallback=false`;
  };

  return (
    <div className="relative w-14 h-14 shrink-0">
      <img
        src={getAvatarUrl()}
        alt={integration.targetName}
        onLoad={() => setImgLoading(false)}
        onError={() => setError(true)}
        className={`w-full h-full rounded-2xl object-cover shadow-inner bg-surface-container transition-opacity duration-300 ease-out ${imgLoading ? "opacity-0" : "opacity-100"}`}
        referrerPolicy="no-referrer"
      />
      {imgLoading && (
        <div className="absolute inset-0 bg-surface-container animate-pulse rounded-2xl" />
      )}
      <div
        className={`absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full flex items-center justify-center border-2 border-white shadow-sm ${
          integration.platform === "youtube"
            ? "bg-red-500 text-white"
            : "bg-purple-500 text-white"
        }`}
      >
        {integration.platform === "youtube" && (
          <Youtube className="w-3 h-3 fill-current" />
        )}
        {integration.platform === "twitch" && (
          <Twitch className="w-3 h-3 fill-current" />
        )}
      </div>
    </div>
  );
};

export default function Integrations() {
  const { selectedServerId, tier, user, isBetaTester, isTrial , isPro} = useServer();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [discordChannels, setDiscordChannels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"youtube" | "twitch">(() => {
    const hash = location.hash.replace("#", "");
    if (hash === "youtube" || hash === "twitch") {
      return hash;
    }
    return "youtube";
  });

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash === "youtube" || hash === "twitch") {
      setActiveTab(hash);
    }
  }, [location.hash]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [newIntegration, setNewIntegration] = useState({
    target: "",
    channelId: "",
    pingRoleId: "",
  });

  const [editingIntegration, setEditingIntegration] =
    useState<Integration | null>(null);
  const [editTargetInput, setEditTargetInput] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const { isSaved, setIsSaved, hasChanges, resetSaveState } = useSaveState(editingIntegration);

  useEffect(() => {
    resetSaveState(editingIntegration);
  }, [editingIntegration?.id]);

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

    const q = collection(db, `servers/${selectedServerId}/integrations`);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Integration[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Integration);
      });
      setIntegrations(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/integrations`));

    return () => unsubscribe();
  }, [selectedServerId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId || !user) return;

    const limit = isPro ? 10 : 3;
    if (integrations.length >= limit) {
      setErrorMsg(`You have reached the limit of ${limit} integrations for your plan.`);
      return;
    }
    
    if (!newIntegration.channelId) {
       setErrorMsg("Please select an announcement channel.");
       return;
    }

    setAdding(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/integrations/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          platform: activeTab,
          target: newIntegration.target,
          announcementChannelId: newIntegration.channelId,
          pingRoleId: newIntegration.pingRoleId || null,
          enabled: true,
          action: "add"
        }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to resolve target");
      }

      setShowAddModal(false);
      setNewIntegration({ target: "", channelId: "", pingRoleId: "" });
      setErrorMsg("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to add integration");
    } finally {
      setAdding(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId || !editingIntegration || !user) return;

    if (!editingIntegration.announcementChannelId) {
      setErrorMsg("Announcement channel ID is required.");
      return;
    }

    setEditing(true);
    setErrorMsg("");

    try {
      const isNewTarget =
        editTargetInput &&
        editTargetInput !== editingIntegration.targetUrl &&
        editTargetInput !== editingIntegration.targetName;

      const payloadTarget = isNewTarget ? editTargetInput : editingIntegration.targetUrl;

      const token = await user.getIdToken();
      const res = await fetch("/api/integrations/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          platform: editingIntegration.platform,
          target: payloadTarget,
          oldId: editingIntegration.id,
          announcementChannelId: editingIntegration.announcementChannelId,
          pingRoleId: editingIntegration.pingRoleId || null,
          enabled: editingIntegration.enabled,
          action: "edit",
          isNewTarget
        }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to update integration");
      }

      setIsSaved(true);
      setTimeout(() => {
        setEditingIntegration(null);
      }, 1000);
      setErrorMsg("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to update integration");
    } finally {
      setEditing(false);
    }
  };

  const toggleEnabled = async (integration: Integration) => {
    if (!selectedServerId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/integrations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serverId: selectedServerId,
          action: "toggle",
          oldId: integration.id,
          enabled: !integration.enabled
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to toggle integration");
      }
    } catch (e: any) {
      console.error("Toggle error", e);
      setErrorMsg(e.message || "Failed to toggle integration");
    }
  };

  const handleDelete = async (id: string) => {
    if (!selectedServerId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/integrations/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          serverId: selectedServerId,
          action: "delete",
          oldId: id
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "Failed to delete integration");
      }
    } catch (e: any) {
      console.error("Delete error", e);
      setErrorMsg(e.message || "Failed to delete integration");
    }
  };

  const filtered = integrations.filter((i) => i.platform === activeTab);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-8"
    >
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
              Social Integrations
            </h1>
            {(!isPro) && (
              <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-bold uppercase tracking-widest">
                PRO
              </span>
            )}
          </div>
          <p className="text-text-secondary font-medium max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed">
            Automatically announce new YouTube videos and Twitch streams.
          </p>
        </div>

        <ProGate isPro={isPro} featureName="Social Integrations" featureDescription="Add YouTube or Twitch listeners to your server" className="inline-block relative">
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!isPro}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-lg shrink-0 ${!isPro ? "bg-surface-variant text-text-secondary shadow-none border border-outline-variant/30" : "bg-primary text-white hover:bg-primary/90 shadow-primary/20 active:scale-95"}`}
          >
            <Plus className="w-4 h-4" />
            Deploy Listener
          </button>
        </ProGate>
      </header>

      {errorMsg && !showAddModal && (
        <div className="bg-danger/10 text-danger text-sm font-bold p-4 rounded-2xl border border-danger/20 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg("")}
            className="px-3 py-1 bg-white/20 rounded-lg hover:bg-white/40"
          >
            Clear
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-surface-container/50 p-1.5 rounded-2xl w-fit border border-outline-variant/10">
        {(["youtube", "twitch"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              relative flex-1 flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl text-[11px] font-black tracking-widest uppercase transition-all duration-300 ease-out
              ${
                activeTab === tab
                  ? "text-white"
                  : (!isPro)
                    ? "text-text-secondary/60 hover:text-text-secondary/80 hover:bg-surface-container/40"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }
            `}
          >
            {activeTab === tab && (
              <motion.div
                layoutId="integrations-tab"
                className="absolute inset-0 bg-primary rounded-xl shadow-md shadow-primary/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2.5">
            {tab === "youtube" && <Youtube className="w-4 h-4" />}
            {tab === "twitch" && <Twitch className="w-4 h-4" />}
            {tab}
            {(!isPro) && (
              <span
                className={`ml-1 text-[8px] px-1.5 py-0.5 rounded font-bold ${
                  activeTab === tab
                    ? "bg-white/20 text-white"
                    : "bg-surface-variant/50 text-text-secondary/80"
                }`}
              >
                {isBetaTester ? 'PRO (Beta Test Server)' : 'PRO'}
              </span>
            )}
            </span>
          </button>
        ))}
      </div>

      <ProGate
        isPro={isPro}
        featureName="Social Integrations"
        featureDescription="View and manage automated alerts for YouTube and Twitch streams in your server."
        className="w-full relative block transition-all duration-300 ease-in-out"
      >
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/40 backdrop-blur-md border border-white/60 rounded-[2rem] p-6 sm:p-8 flex flex-col gap-6 shadow-xl shadow-primary/5 min-h-[16rem]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-surface-container rounded-2xl"></div>
                    <div className="space-y-2">
                       <div className="h-4 w-24 bg-surface-container rounded-md"></div>
                       <div className="h-3 w-16 bg-surface-container rounded-md"></div>
                    </div>
                  </div>
                  <div className="w-8 h-8 bg-surface-container rounded-full"></div>
                </div>
                <div className="mt-auto pt-6 border-t border-outline-variant/20 space-y-3">
                   <div className="h-3 w-32 bg-surface-container rounded-md"></div>
                   <div className="h-3 w-40 bg-surface-container rounded-md"></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="col-span-full py-10 sm:py-20 text-center bg-white/40 backdrop-blur-md border border-white/40 rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-primary/5 cursor-default"
                >
                  <EmptyState 
                    title="No Integrations"
                    description={`You haven't added any ${activeTab} listeners yet.`}
                  >
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="px-8 py-3 rounded-full bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all duration-300 ease-out shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95"
                    >
                      Add Integration
                    </button>
                  </EmptyState>
                </motion.div>
              ) : (
                filtered.map((integration, idx) => (
                  <motion.div
                    key={integration.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white/80 backdrop-blur-md border border-white/40 rounded-3xl p-5 hover:border-primary/40 transition-all duration-300 ease-out group shadow-xl shadow-primary/5 flex flex-col h-full"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
                      <div className="flex items-center gap-3 min-w-0">
                        <ProfileIcon integration={integration} />
                        <div className="min-w-0">
                          <h3 className="font-extrabold text-on-surface text-base leading-tight tracking-tight truncate max-w-[140px] md:max-w-[120px] 2xl:max-w-[160px]">
                            {integration.targetName}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <div
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${integration.enabled ? ((integration as any).lastError ? "bg-error" : "bg-success animate-pulse") : "bg-text-secondary"}`}
                            />
                            {(integration as any).lastError ? (
                               <p className="text-[9px] font-bold text-error uppercase tracking-widest break-all line-clamp-1" title={(integration as any).lastError}>
                                  ERR: {(integration as any).lastError}
                               </p>
                            ) : (
                               <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest break-all line-clamp-1">
                                 {integration.lastProcessedId
                                   ? `LID: ${integration.lastProcessedId}`
                                   : "AWAITING ACTIVITY"}
                               </p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 mt-2 sm:mt-0">
                        <button
                          onClick={() => toggleEnabled(integration)}
                          className={`relative p-2 rounded-xl transition-all duration-300 ease-out shadow-sm group ${
                            integration.enabled
                              ? "bg-primary/10 text-primary hover:bg-primary/20"
                              : "bg-surface-container text-text-secondary hover:text-on-surface hover:bg-surface-variant"
                          }`}
                          title={
                            integration.enabled
                              ? "Disable Announcements"
                              : "Enable Announcements"
                          }
                        >
                          <Bell
                            className={`w-4 h-4 ${integration.enabled ? "fill-current" : ""}`}
                          />
                          {!integration.enabled && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-xl">
                              <div className="w-8 h-[1.5px] bg-current -rotate-45" />
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setEditingIntegration(integration);
                            setEditTargetInput(integration.targetUrl);
                          }}
                          className="p-2 text-text-secondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-300 ease-out shadow-sm bg-surface-container hover:shadow-primary/10 relative group"
                          title="Edit Integration"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(integration.id)}
                          className="p-2 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-xl transition-all duration-300 ease-out shadow-sm bg-surface-container hover:shadow-danger/10 relative group"
                          title="Delete Integration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 mb-5 mt-auto">
                      <div className="bg-surface-container/50 rounded-xl p-3.5 border border-outline-variant/30 flex justify-between items-center gap-2">
                        <p className="text-[9px] uppercase font-black text-text-secondary tracking-widest shrink-0">
                          Channel
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-on-surface font-extrabold min-w-0">
                          <Hash className="w-3 h-3 text-primary shrink-0" />
                          <span className="truncate">
                            {discordChannels?.find(c => c.id === integration.announcementChannelId)?.name || integration.announcementChannelId}
                          </span>
                        </div>
                      </div>
                      <div className="bg-surface-container/50 rounded-xl p-3.5 border border-outline-variant/30 flex justify-between items-center gap-2">
                        <p className="text-[9px] uppercase font-black text-text-secondary tracking-widest shrink-0">
                          Ping Role
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-on-surface font-extrabold min-w-0">
                          <Bell className="w-3 h-3 text-secondary shrink-0" />
                          <span className="truncate font-mono">
                            {integration.pingRoleId
                              ? integration.pingRoleId
                              : "None"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <a
                      href={integration.targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl bg-surface-container text-primary font-black text-[10px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-300 ease-out shadow-sm active:scale-95"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View Channel
                    </a>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        )}
      </ProGate>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white border border-white/40 rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl z-10"
            >
              <div className="p-8 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary border border-primary/10">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-extrabold text-on-surface tracking-tight capitalize">
                    Deploy {activeTab} Listener
                  </h2>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-10 h-10 flex items-center justify-center text-text-secondary hover:text-danger transition-colors duration-300 ease-out bg-surface-container/50 rounded-full"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAdd} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    {activeTab === "youtube"
                      ? "YouTube Channel URL / Handle"
                      : "Twitch Username"}
                  </label>
                  <input
                    type="text"
                    required
                    value={newIntegration.target}
                    onChange={(e) =>
                      setNewIntegration((s) => ({
                        ...s,
                        target: e.target.value,
                      }))
                    }
                    placeholder={
                      activeTab === "youtube"
                        ? "https://youtube.com/@GeneralBot"
                        : "streamer_name"
                    }
                    className="w-full bg-surface-container/50 border border-outline-variant/30 rounded-2xl px-5 py-4 text-sm text-on-surface placeholder:text-text-secondary/40 focus:outline-none focus:border-primary/50 focus:bg-white transition-all duration-300 ease-out shadow-inner font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    Announcement Channel
                  </label>
                  <ChannelSelector
                    channels={discordChannels}
                    value={newIntegration.channelId}
                    onChange={(channelId) =>
                      setNewIntegration((s) => ({
                        ...s,
                        channelId,
                      }))
                    }
                    placeholder="Select a channel..."
                  />
                  <p className="text-[10px] text-text-secondary mt-3 font-bold px-1 italic">
                    Bot will start announcing new content from this account.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    Ping Role (Optional)
                  </label>
                  <RoleSelector
                    roles={discordRoles}
                    disablePositionCheck={true}
                    value={newIntegration.pingRoleId || ""}
                    onChange={(roleId) =>
                      setNewIntegration((s) => ({
                        ...s,
                        pingRoleId: roleId,
                      }))
                    }
                    placeholder="Role to ping..."
                  />
                  <p className="text-[10px] text-text-secondary mt-3 font-bold px-1 italic">
                    The bot will optionally mention this role when announcing.
                  </p>
                </div>

                {errorMsg && (
                  <div className="bg-danger/10 text-danger text-sm font-bold p-3 rounded-xl border border-danger/20 text-center">
                    {errorMsg}
                  </div>
                )}

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-4 rounded-2xl border border-outline-variant/50 text-on-surface font-black text-xs uppercase tracking-widest hover:bg-surface-container transition-all duration-300 ease-out active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="flex-1 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all duration-300 ease-out shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95"
                  >
                    {adding ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                    Initialize
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingIntegration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingIntegration(null)}
              className="absolute inset-0 bg-on-surface/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white border border-white/40 rounded-[3rem] w-full max-w-md overflow-hidden shadow-2xl z-10"
            >
              <div className="p-8 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary border border-primary/10">
                    <Edit2 className="w-6 h-6" />
                  </div>
                  <h2 className="text-xl font-extrabold text-on-surface tracking-tight capitalize">
                    Edit Integrator
                  </h2>
                </div>
                <button
                  onClick={() => setEditingIntegration(null)}
                  className="w-10 h-10 flex items-center justify-center text-text-secondary hover:text-danger transition-colors duration-300 ease-out bg-surface-container/50 rounded-full"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleEdit} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    {editingIntegration.platform === "youtube"
                      ? "YouTube Channel URL / Handle"
                      : "Twitch Username"}
                  </label>
                  <input
                    type="text"
                    required
                    value={editTargetInput}
                    onChange={(e) => setEditTargetInput(e.target.value)}
                    placeholder={
                      editingIntegration.platform === "youtube"
                        ? "https://youtube.com/@mrbeast"
                        : "username"
                    }
                    className="w-full bg-surface-container/50 border border-outline-variant/30 rounded-2xl px-5 py-4 text-sm text-on-surface placeholder:text-text-secondary/40 focus:outline-none focus:border-primary/50 focus:bg-white transition-all duration-300 ease-out shadow-inner font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    Announcement Channel
                  </label>
                  <ChannelSelector
                    channels={discordChannels}
                    value={editingIntegration.announcementChannelId}
                    onChange={(channelId) =>
                      setEditingIntegration({
                        ...editingIntegration,
                        announcementChannelId: channelId,
                      })
                    }
                    placeholder="Select a channel..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                    Ping Role (Optional)
                  </label>
                  <RoleSelector
                    roles={discordRoles}
                    disablePositionCheck={true}
                    value={editingIntegration.pingRoleId || ""}
                    onChange={(roleId) =>
                      setEditingIntegration({
                        ...editingIntegration,
                        pingRoleId: roleId,
                      })
                    }
                    placeholder="Role to ping..."
                  />
                  <p className="text-[10px] text-text-secondary mt-3 font-bold px-1 italic">
                    The bot will optionally mention this role when announcing.
                  </p>
                </div>

                {errorMsg && (
                  <div className="bg-danger/10 text-danger text-sm font-bold p-3 rounded-xl border border-danger/20 text-center">
                    {errorMsg}
                  </div>
                )}

                <div className="pt-4 flex gap-4">
                  <button
                    type="button"
                    onClick={() => setEditingIntegration(null)}
                    className="flex-1 py-4 rounded-2xl border border-outline-variant/50 text-on-surface font-black text-xs uppercase tracking-widest hover:bg-surface-container transition-all duration-300 ease-out active:scale-95"
                  >
                    Cancel
                  </button>
                  <motion.button animate={isSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={{ scale: hasChanges ? 0.95 : 1 }}
                    type="submit"
                    disabled={editing || (!hasChanges && !isSaved)}
                    className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-lg flex items-center justify-center gap-2 ${
                      isSaved
                        ? "bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-600"
                        : !hasChanges
                          ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30"
                          : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
                    } ${editing ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {editing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isSaved ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    {editing ? "Saving..." : isSaved ? "Saved" : "Save Changes"}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
