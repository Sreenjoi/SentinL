import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
const GiveawaysManager = lazy(() => import("./GiveawaysManager"));
import { EmptyState, CompactEmptyState } from "./EmptyState";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  onSnapshot,
  deleteDoc,
  getDocs,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import {
  Save,
  Trophy,
  Users as UsersIcon,
  Settings2,
  Hash,
  ShieldOff,
  Zap,
  RotateCcw,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Check,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSaveState } from "../hooks/useSaveState";
import { toast } from "sonner";
import { SentinLLoading } from "./SentinLLoading";

import { useLocation } from "react-router-dom";
import { PermissionsWarning } from "./PermissionsWarning";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";

interface RoleReward {
  level: string;
  roleId: string;
}

interface LevelingSettings {
  enabled: boolean;
  xpMultiplier: number;
  cooldownSeconds: number;
  xpMin: number;
  xpMax: number;
  levelDivisor: number;
  ignoredChannels: string[];
  ignoredRoles: string[];
}

import { PermissionGateModal } from "./PermissionGateModal";
import { ProGate } from "./ProGate";

export default function LevelingManager() {
  const { selectedServerId, tier, botGuilds, isBetaTester, botPermissions, isTrial , isPro, intentsWarning} = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<LevelingSettings>({
    enabled: false,
    xpMultiplier: 1.0,
    cooldownSeconds: 60,
    xpMin: 15,
    xpMax: 25,
    levelDivisor: 50,
    ignoredChannels: [],
    ignoredRoles: [],
  });

  const [roleRewards, setRoleRewards] = useState<RoleReward[]>([]);
  const [newReward, setNewReward] = useState({ level: "", roleId: "" });
  const [newIgnoreChannel, setNewIgnoreChannel] = useState("");
  const [newIgnoreRole, setNewIgnoreRole] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [activeTab, setActiveTab] = useState<"leveling" | "giveaways">(() => {
    return window.location.hash === "#giveaways" ? "giveaways" : "leveling";
  });
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash === "giveaways") {
      setActiveTab("giveaways");
    } else {
      setActiveTab("leveling");
    }
  }, [location.hash]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "giveaways") {
        setActiveTab("giveaways");
      } else {
        setActiveTab("leveling");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [discordChannels, setDiscordChannels] = useState<any[]>([]);
  const [botRolePosition, setBotRolePosition] = useState<number>(0);

  const { isSaved: isLevelingSaved, setIsSaved: setIsLevelingSaved, hasChanges: levelingHasChanges, hasChangesRef, resetSaveState, updateBaseline } =
    useSaveState([settings, roleRewards]);

  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  useEffect(() => {
    if (initialDataLoaded) return;
    if (!loading) { // Wait for first load
      const t = setTimeout(() => {
        resetSaveState([settings, roleRewards]);
        setInitialDataLoaded(true);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [loading, settings, roleRewards, initialDataLoaded]);

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
            if (data.botHighestRolePosition !== undefined) setBotRolePosition(data.botHighestRolePosition);
          })
          .catch((err) => console.error("Failed to fetch roles", err));
      });
    }

    if (discordChannels.length === 0) {
      auth.currentUser?.getIdToken().then(token => {
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

    // Fetch Settings
    const settingsRef = doc(
      db,
      `servers/${selectedServerId}/leveling/settings`,
    );
    const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const serverSettings = {
          enabled: isPro ? (data.enabled ?? false) : false,
          xpMultiplier: data.xpMultiplier ?? 1.0,
          cooldownSeconds: data.cooldownSeconds ?? 60,
          xpMin: data.xpMin ?? 15,
          xpMax: data.xpMax ?? 25,
          levelDivisor: data.levelDivisor ?? 50,
          ignoredChannels: data.ignoredChannels ?? [],
          ignoredRoles: data.ignoredRoles ?? [],
        };
        if (hasChangesRef.current) {
          updateBaseline((old: any[]) => [serverSettings, old[1]]);
        } else {
          setSettings(serverSettings);
          updateBaseline((old: any[]) => [serverSettings, old[1]]);
        }
      }
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/leveling/settings`));

    // Fetch Role Rewards
    const rewardsRef = collection(
      db,
      `servers/${selectedServerId}/roleRewards`,
    );
    const unsubscribeRewards = onSnapshot(rewardsRef, (snapshot) => {
      const rewards = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          // Support old format where doc.id = level, data.roleId = roleId
          // Support new format where data.roleId = roleId, data.requiredLevel = level
          return {
            level: data.requiredLevel !== undefined ? String(data.requiredLevel) : doc.id,
            roleId: data.roleId || doc.id,
          };
        })
        .sort((a, b) => parseInt(a.level) - parseInt(b.level));
      if (hasChangesRef.current) {
        updateBaseline((old: any[]) => [old[0], rewards]);
      } else {
        setRoleRewards(rewards);
        updateBaseline((old: any[]) => [old[0], rewards]);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/roleRewards`));

    // Fetch Leaderboard
    const leaderboardRef = query(
      collection(db, `servers/${selectedServerId}/leveling_users`),
      orderBy("xp", "desc"),
      limit(10),
    );
    const unsubscribeLeaderboard = onSnapshot(leaderboardRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setLeaderboard(data);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/leveling_users`));

    return () => {
      unsubscribeSettings();
      unsubscribeRewards();
      unsubscribeLeaderboard();
    };
  }, [selectedServerId, isPro]);
  const toggleLevelingSetting = async (field: Extract<keyof typeof settings, string>, value: boolean) => {
    if (!selectedServerId) return;

    if (field === "enabled" && value && botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }

    setSettings(prev => ({ ...prev, [field]: value }));
    updateBaseline((old: any[]) => {
      const s = { ...old[0], [field]: value };
      return [s, old[1]];
    });

    try {
      const newSettings = { ...settings, [field]: value };
      await setDoc(doc(db, `servers/${selectedServerId}/leveling/settings`), newSettings, { merge: true });
      if (field === "enabled") {
        const token = await auth.currentUser?.getIdToken();
        await fetch("/api/bot/notify-setting", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": token ? `Bearer ${token}` : ""
          },
          body: JSON.stringify({
            serverId: selectedServerId,
            type: "leveling_toggle",
            enabled: value,
          }),
        }).catch(err => console.error("Error notifying bot about setting:", err));
      }
      toast.success("Setting updated.", { id: `${field}-toast`, duration: 2000 });
    } catch (err: any) {
      console.error(`Error toggling ${field}:`, err);
      toast.error("Failed to update setting.", { id: `${field}-toast` });
      setSettings(prev => ({ ...prev, [field]: !value }));
      updateBaseline((old: any[]) => {
        const s = { ...old[0], [field]: !value };
        return [s, old[1]];
      });
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedServerId) return;

    if (settings.enabled && botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, `servers/${selectedServerId}/leveling/settings`),
        settings,
      );

      const token = await auth.currentUser?.getIdToken();
      
      // Notify Discord Bot to announce the setting change natively, just like a slash command
      await fetch("/api/bot/notify-setting", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          type: "leveling_toggle",
          enabled: settings.enabled,
        }),
      });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsLevelingSaved(true);
      setSaving(false);
    }
  };

  const handleAddReward = async () => {
    if (!newReward.level || !newReward.roleId || !selectedServerId) return;

    if (botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }

    await setDoc(
      doc(db, `servers/${selectedServerId}/roleRewards/${newReward.roleId}`),
      {
        roleId: newReward.roleId,
        requiredLevel: parseInt(newReward.level, 10),
      },
    );
    // Also delete any old format document that might exist for this level to avoid conflicts
    try {
      await deleteDoc(doc(db, `servers/${selectedServerId}/roleRewards/${newReward.level}`));
    } catch {}

    setNewReward({ level: "", roleId: "" });
  };

  const handleDeleteReward = async (roleId: string, level: string) => {
    if (!selectedServerId) return;
    
    // Delete new format document (keyed by roleId)
    try {
      await deleteDoc(
        doc(db, `servers/${selectedServerId}/roleRewards/${roleId}`),
      );
    } catch {}
    
    // Delete old format document (keyed by level)
    try {
      await deleteDoc(
        doc(db, `servers/${selectedServerId}/roleRewards/${level}`),
      );
    } catch {}
  };

  const handleResetXP = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    setShowResetConfirm(false);
    if (!selectedServerId) return;
    try {
      const snap = await getDocs(
        collection(db, `servers/${selectedServerId}/leveling_users`),
      );
      const batch = writeBatch(db);
      snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      setLeaderboard([]);
    } catch (e) {
      console.error("Error resetting XP:", e);
      toast.error("Failed to reset XP.");
    }
  };

  if (loading)
    return (
      <div className="space-y-10 pb-32 animate-pulse">
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div className="flex-1 space-y-4">
            <div className="h-10 w-64 bg-surface-container rounded-xl"></div>
            <div className="h-4 w-96 bg-surface-container rounded-md"></div>
          </div>
          <div className="w-48 h-16 bg-surface-container rounded-2xl"></div>
        </header>

        <div className="flex flex-wrap items-center gap-2 mb-8 bg-surface-container/20 p-2 rounded-2xl border border-white/40">
           <div className="w-32 h-10 bg-surface-container rounded-xl"></div>
           <div className="w-32 h-10 bg-surface-container rounded-xl"></div>
        </div>

        <div className="border border-white/40 bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-xl shadow-primary/5 flex flex-col h-96">
          <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-outline-variant/20 bg-surface-container/30 rounded-t-[2.5rem]">
            <div className="h-6 w-48 bg-surface-container rounded-md mb-2"></div>
            <div className="h-3 w-64 bg-surface-container rounded-md"></div>
          </div>
          <div className="p-8 space-y-8">
            <div className="h-12 w-full bg-surface-container rounded-2xl"></div>
            <div className="h-12 w-full bg-surface-container rounded-2xl"></div>
            <div className="h-12 w-full bg-surface-container rounded-2xl"></div>
          </div>
        </div>
      </div>
    );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="space-y-10 pb-32"
    >
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      {selectedServerId && (
        <PermissionsWarning 
          serverId={selectedServerId} 
          required={["SendMessages", "ManageRoles"]} 
        />
      )}
      {intentsWarning && (
        <div className="bg-danger/10 border border-danger/20 rounded-2xl p-4 flex items-start gap-4 mb-8 text-on-surface">
          <div className="bg-danger/20 p-2 rounded-xl text-danger mt-1">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-extrabold text-danger tracking-tight mb-1 uppercase">Limited Functionality</h3>
            <p className="text-xs text-on-surface/80 leading-relaxed font-medium">
              Your bot is running in <strong className="text-danger">Reduced Mode</strong>. The Message Content intent is disabled, so SentinL cannot read message contents to award XP. Leveling is currently inactive, but you can still configure the settings below.
            </p>
          </div>
        </div>
      )}
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
              Leveling System
            </h1>
            {!isPro && (
              <span className="text-[10px] sm:text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-bold uppercase tracking-widest mt-1">
                PRO
              </span>
            )}
          </div>
          <p className="text-text-secondary font-medium max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed">
            Manage experience points and role rewards for your server.
          </p>
        </div>
        <div
          className={`flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 rounded-2xl border shrink-0 transition-all ${
            !botGuilds.includes(selectedServerId) ||
            saving
              ? "opacity-50 cursor-not-allowed bg-surface-container/10 border-outline-variant/5 grayscale"
              : "cursor-pointer bg-surface-container/30 border-outline-variant/10 active:scale-95"
          }`}
          onClick={() => {
            if (
              !isPro ||
              !botGuilds.includes(selectedServerId) ||
              saving
            )
              return;
            toggleLevelingSetting("enabled", !settings.enabled);
          }}
        >
          <div className="flex flex-col items-end">
            <span
              className={`text-[9px] font-black tracking-[0.2em] uppercase ${settings.enabled ? "text-success" : "text-text-secondary"}`}
            >
              {settings.enabled ? "Active" : "Inactive"}
            </span>
            <span className="text-[11px] font-bold text-on-surface">
              {settings.enabled ? "System Enabled" : "System Disabled"}
            </span>
          </div>
          <div
            className={`w-14 h-8 rounded-full transition-all duration-300 ease-out relative shadow-inner cursor-pointer ${settings.enabled ? "bg-orange-500" : "bg-outline-variant/30"}`}
          >
            <div
              className={`absolute top-1.5 w-5 h-5 rounded-full bg-white transition-all duration-300 ease-out shadow-lg ${settings.enabled ? "left-7.5" : "left-1.5"}`}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-8 bg-surface-container/20 p-2 rounded-2xl border border-white/40">
          <button
            onClick={() => { setActiveTab("leveling"); window.history.replaceState(null, "", "#leveling"); }}
            className={`relative px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center gap-2.5 ${
              activeTab === "leveling"
                ? "text-white"
                : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
            }`}
          >
            {activeTab === "leveling" && (
              <motion.div
                layoutId="leveling-active-tab"
                className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2.5">
            Leveling & XP
            {!isPro && (
              <span
                className={`ml-1 text-[8px] px-1.5 py-0.5 rounded font-bold ${
                  activeTab === "leveling"
                    ? "bg-white/20 text-white"
                    : "bg-surface-variant/50 text-text-secondary/80"
                }`}
              >
                PRO
              </span>
            )}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab("giveaways"); window.history.replaceState(null, "", "#giveaways"); }}
            className={`relative px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center gap-2.5 ${
              activeTab === "giveaways"
                ? "text-white"
                : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
            }`}
          >
            {activeTab === "giveaways" && (
              <motion.div
                layoutId="leveling-active-tab"
                className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2.5">
            Giveaways Manager
            {!isPro && (
              <span
                className={`ml-1 text-[8px] px-1.5 py-0.5 rounded font-bold ${
                  activeTab === "giveaways"
                    ? "bg-white/20 text-white"
                    : "bg-surface-variant/50 text-text-secondary/80"
                }`}
              >
                PRO
              </span>
            )}
            </span>
          </button>
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="space-y-10"
          >
        {activeTab === "leveling" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* XP Config */}
              <ProGate isPro={isPro} featureName="XP Configuration" featureDescription="Customise multipliers, cooldowns, and formulas on Pro or Premium" className="block relative h-full">
              <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] border border-white/60 p-6 sm:p-10 space-y-8 flex flex-col shadow-xl shadow-primary/5 h-full">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary shadow-inner">
                    <Settings2 className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-extrabold text-on-surface tracking-tight">
                    Experience Configuration
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                      XP Multiplier
                    </label>
                    <div className="relative group">
                      
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="3.0"
                        value={settings.xpMultiplier}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            xpMultiplier: parseFloat(e.target.value),
                          })
                        }
                        className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all duration-300 ease-out outline-none"
                      />
                      
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                        Minimum XP per message
                      </label>
                      <input
                        type="number"
                        value={settings.xpMin}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            xpMin: parseInt(e.target.value),
                          })
                        }
                        className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all duration-300 ease-out outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                        Maximum XP per message
                      </label>
                      <input
                        type="number"
                        value={settings.xpMax}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            xpMax: parseInt(e.target.value),
                          })
                        }
                        className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all duration-300 ease-out outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1 flex justify-between">
                      <span>Level Formula Divisor</span>
                      <span className="text-primary font-mono normal-case">{settings.levelDivisor}</span>
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="1000"
                      value={settings.levelDivisor}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          levelDivisor: parseInt(e.target.value),
                        })
                      }
                      className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all duration-300 ease-out outline-none"
                    />
                    <p className="text-[10px] text-text-secondary mt-1 ml-1">
                      Controls how much XP is needed to level up. For example, setting this to 50 means you need 50 total XP for Level 1, 100 XP for Level 2, etc. (Check ranks in Discord via <span className="font-mono text-[9px] bg-outline-variant/20 px-1 py-0.5 rounded">/rank</span> and <span className="font-mono text-[9px] bg-outline-variant/20 px-1 py-0.5 rounded">/leaderboard</span>)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                      Cooldown between messages (seconds)
                    </label>
                    <input
                      type="number"
                      min="15"
                      max="300"
                      value={settings.cooldownSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          cooldownSeconds: parseInt(e.target.value),
                        })
                      }
                      className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all duration-300 ease-out outline-none"
                    />
                  </div>
                </div>
              </div>
              </ProGate>

              {/* Exclusions */}
              <ProGate
                isPro={isPro}
                featureName="Exclusions"
                featureDescription="Blacklist specific channels and roles from earning XP across the server."
                className="w-full relative block"
              >
                <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] border border-white/60 p-6 sm:p-10 space-y-8 flex flex-col shadow-xl shadow-primary/5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-danger-container/20 rounded-xl flex items-center justify-center text-danger shadow-inner">
                      <ShieldOff className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-extrabold text-on-surface tracking-tight">
                      Ignored Channels & Blacklisted Roles
                    </h2>
                  </div>

                <div className="space-y-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                      Ignored Channels
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <ChannelSelector
                          channels={discordChannels}
                          value={newIgnoreChannel}
                          onChange={setNewIgnoreChannel}
                          placeholder="Select channel to ignore..."
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (
                            newIgnoreChannel &&
                            !settings.ignoredChannels.includes(newIgnoreChannel)
                          ) {
                            setSettings({
                              ...settings,
                              ignoredChannels: [
                                ...settings.ignoredChannels,
                                newIgnoreChannel,
                              ],
                            });
                            setNewIgnoreChannel("");
                          }
                        }}
                        className="w-14 bg-primary text-white rounded-2xl flex items-center justify-center hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-90 transition-all duration-300 ease-out font-black"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      {settings.ignoredChannels.map((id) => (
                        <span
                          key={id}
                          className="text-[10px] font-black bg-white/60 border border-outline-variant/20 px-3 py-2 rounded-xl flex items-center gap-2 group hover:border-danger/30 transition-all duration-300 ease-out shadow-sm"
                        >
                          <Hash className="w-3 h-3 text-primary" />{" "}
                          <span className="truncate max-w-[120px]">
                            {discordChannels.find(c => c.id === id)?.name || id}
                          </span>
                          <button
                            onClick={() =>
                              setSettings({
                                ...settings,
                                ignoredChannels:
                                  settings.ignoredChannels.filter(
                                    (c) => c !== id,
                                  ),
                              })
                            }
                            className="p-1 hover:bg-danger/10 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-text-secondary group-hover:text-danger" />
                          </button>
                        </span>
                      ))}
                      {settings.ignoredChannels.length === 0 && (
                        <div className="w-full py-4 text-center border border-dashed border-outline-variant/30 rounded-xl">
                          <p className="text-[10px] font-bold text-text-secondary/50 uppercase tracking-widest">
                            No channels excluded
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                      Blacklisted Roles
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <RoleSelector
                          roles={discordRoles}
                          disablePositionCheck={true}
                          value={newIgnoreRole}
                          onChange={setNewIgnoreRole}
                          placeholder="Select role to ignore..."
                        />
                      </div>
                      <button
                        onClick={() => {
                          if (
                            newIgnoreRole &&
                            !settings.ignoredRoles.includes(newIgnoreRole)
                          ) {
                            setSettings({
                              ...settings,
                              ignoredRoles: [
                                ...settings.ignoredRoles,
                                newIgnoreRole,
                              ],
                            });
                            setNewIgnoreRole("");
                          }
                        }}
                        className="w-14 bg-primary text-white rounded-2xl flex items-center justify-center hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-90 transition-all duration-300 ease-out font-black"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      {settings.ignoredRoles.map((id) => (
                        <span
                          key={id}
                          className="text-[10px] font-black bg-white/60 border border-outline-variant/20 px-3 py-2 rounded-xl flex items-center gap-2 group hover:border-danger/30 transition-all duration-300 ease-out shadow-sm"
                        >
                          <UsersIcon className="w-3 h-3 text-primary/60" />
                          <span className="truncate max-w-[120px]">
                            {discordRoles.find(r => r.id === id)?.name || id}
                          </span>
                          <button
                            onClick={() =>
                              setSettings({
                                ...settings,
                                ignoredRoles: settings.ignoredRoles.filter(
                                  (r) => r !== id,
                                ),
                              })
                            }
                            className="p-1 hover:bg-danger/10 rounded-md transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-text-secondary group-hover:text-danger" />
                          </button>
                        </span>
                      ))}
                      {settings.ignoredRoles.length === 0 && (
                        <div className="w-full py-4 text-center border border-dashed border-outline-variant/30 rounded-xl">
                          <p className="text-[10px] font-bold text-text-secondary/50 uppercase tracking-widest">
                            No roles excluded
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </ProGate>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Role Rewards */}
              <ProGate isPro={isPro} featureName="Role Rewards" featureDescription="Automatically assign roles when members level up on Pro or Premium" className="block relative h-full w-full">
              <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] border border-white/60 p-6 sm:p-10 space-y-8 flex flex-col shadow-xl shadow-primary/5 h-full">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary shadow-inner">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-extrabold text-on-surface tracking-tight flex items-center gap-2">
                    Role Rewards
                    <div className="relative group flex items-center">
                      <Info className="w-4 h-4 text-text-secondary cursor-help" />
                      <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-[100] whitespace-normal pointer-events-none text-center font-normal tracking-normal leading-relaxed text-balance">
                        Users who reach this level will automatically be assigned this role. Note: The bot's role must be placed higher in your Discord Server Settings &gt; Roles to assign it.
                      </div>
                    </div>
                  </h2>
                </div>

                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
                    <div className="flex-1 sm:flex-[0.5] space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                        Level
                      </label>
                      <input
                        type="number"
                        placeholder="LVL"
                        value={newReward.level}
                        onChange={(e) =>
                          setNewReward({ ...newReward, level: e.target.value })
                        }
                        className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1">
                        Assign Role
                      </label>
                      <RoleSelector
                        roles={discordRoles}
                        botRolePosition={botRolePosition}
                        value={newReward.roleId}
                        onChange={(roleId) =>
                          setNewReward({ ...newReward, roleId })
                        }
                        placeholder="Select role..."
                      />
                    </div>
                    
                    <button
                      onClick={handleAddReward}
                      className="w-full sm:w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-95 transition-all duration-300 ease-out font-black shrink-0"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                    
                  </div>

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    <AnimatePresence>
                    {roleRewards.map((reward, idx) => (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                        key={reward.roleId}
                        className="flex flex-col sm:flex-row sm:items-center justify-between bg-white/60 p-5 rounded-2xl border border-white/60 shadow-sm transition-all duration-300 ease-out hover:bg-white hover:border-primary/20 group gap-4"
                      >
                        <div className="flex items-center gap-4 sm:gap-6">
                          <div className="flex flex-col min-w-[70px]">
                            <span className="text-primary font-black text-sm uppercase tracking-tighter">
                              LVL {reward.level}
                            </span>
                            <span className="text-[8px] font-black text-text-secondary tracking-widest uppercase opacity-60">
                              Requirement
                            </span>
                          </div>
                          <div className="h-8 w-px bg-outline-variant/20 hidden sm:block" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-on-surface font-mono text-sm font-bold truncate">
                              {discordRoles.find(r => r.id === reward.roleId)?.name || reward.roleId}
                            </span>
                            <span className="text-[8px] font-black text-text-secondary tracking-widest uppercase opacity-60">
                              Role Assigned
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleDeleteReward(reward.roleId, reward.level)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-danger/5 text-danger font-black text-[9px] uppercase tracking-widest hover:bg-danger hover:text-white transition-all duration-300 ease-out opacity-0 group-hover:opacity-100 sm:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                    {roleRewards.length === 0 && (
                      <CompactEmptyState 
                        title="No rewards configured."
                        description="Add roles to reward active users."
                      />
                    )}
                  </div>
                </div>
              </div>
              </ProGate>

              {/* Global Leaderboard Preview */}
              <ProGate isPro={isPro} featureName="Server Leaderboard" featureDescription="View the top active members in your server on Pro or Premium" className="block relative h-full w-full">
              <div className="bg-white/40 backdrop-blur-sm rounded-[2rem] sm:rounded-[3rem] border border-white/60 p-6 sm:p-10 space-y-8 flex flex-col shadow-xl shadow-primary/5 h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary shadow-inner">
                      <UsersIcon className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-extrabold text-on-surface tracking-tight">
                      Server Leaderboard
                    </h2>
                  </div>
                  <div className="w-2.5 h-2.5 rounded-full bg-success shadow-[0_0_8px_rgba(52,168,83,0.5)] animate-pulse" />
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] leading-relaxed ml-1 opacity-70">
                    View the top active members in your server.
                  </p>
                  <div className="space-y-3.5 pt-2">
                    {isPro && leaderboard.length > 0 ? (
                      <AnimatePresence>
                      {leaderboard.map((user, idx) => (
                        <motion.div
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          key={user.id}
                          className="flex items-center justify-between bg-surface-container/20 backdrop-blur-sm p-4 rounded-2xl border border-outline-variant/10"
                        >
                          <div className="flex items-center gap-5">
                            <span className="text-xs font-black text-primary w-5 text-right font-mono">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <img
                              src={
                                user.avatar ||
                                "https://cdn.discordapp.com/embed/avatars/0.png"
                              }
                              alt={user.username}
                              className="w-10 h-10 rounded-xl bg-surface-container shadow-inner border border-outline-variant/20 object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-extrabold text-on-surface tracking-tight">
                                  {user.username}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(user.id);
                                    toast.success("User ID copied");
                                  }}
                                  title="Copy User ID"
                                  className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">
                                {user.xp.toLocaleString()} XP
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">
                              Level
                            </span>
                            <span className="text-lg font-black text-on-surface leading-none">
                              {user.level || 0}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                      </AnimatePresence>
                    ) : (
                      <CompactEmptyState 
                        title={isPro ? "No users on the leaderboard yet." : "Leaderboard locked."}
                        description={isPro ? "Messages will populate this list." : "Upgrade to Pro to view leaderboards."}
                      />
                    )}
                  </div>
                </div>
              </div>
              </ProGate>
            </div>

            <ProGate isPro={isPro} featureName="Reset XP" featureDescription="Resetting data is available on Pro or Premium" className="block relative w-full">
            <div className="flex flex-col md:flex-row justify-between items-center p-6 sm:p-8 bg-danger-container/10 border border-danger/20 rounded-[2rem] sm:rounded-[2.5rem] backdrop-blur-sm gap-6">
              <div className="flex items-center gap-5 text-center md:text-left">
                <div className="w-14 h-14 bg-danger/10 rounded-2xl flex items-center justify-center text-danger border border-danger/10">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-on-surface tracking-tight">
                    Reset All XP
                  </h3>
                  <p className="text-[11px] font-bold text-text-secondary max-w-sm mt-1">
                    Delete all user XP and levels. This cannot be undone.
                  </p>
                </div>
              </div>
              
              <button
                onClick={handleResetXP}
                className="px-8 py-4 bg-danger/5 text-danger border border-danger/20 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-danger hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-lg shadow-danger/5"
              >
                Reset XP Data
              </button>
              
            </div>
            </ProGate>

            {/* Confirmation Modal */}
            <AnimatePresence>
              {showResetConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowResetConfirm(false)}
                    className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
                  >
                    <div className="p-8 text-center">
                      <div className="w-20 h-20 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-black text-on-surface tracking-tight mb-2 uppercase">
                        Confirm Reset
                      </h3>
                      <p className="text-text-secondary text-sm font-medium leading-relaxed">
                        You are about to permanently delete all experience
                        points and level data for{" "}
                        <span className="font-bold text-on-surface">
                          this server
                        </span>
                        . This action is atomic and{" "}
                        <span className="text-danger font-bold italic underline">
                          cannot be reversed
                        </span>
                        .
                      </p>
                    </div>
                    <div className="flex p-4 gap-4 bg-surface-container/30 border-t border-outline-variant/10">
                      <button
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 py-4 bg-white border border-outline-variant/30 rounded-2xl text-[11px] font-black uppercase tracking-widest text-on-surface hover:bg-surface-container transition-all duration-300 ease-out active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmReset}
                        className="flex-1 py-4 bg-danger text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-danger/90 transition-all duration-300 ease-out shadow-lg shadow-danger/20 active:scale-95"
                      >
                        Yes, Reset All
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <div className="flex justify-end mt-8">
              <ProGate isPro={isPro} featureName="XP Settings" featureDescription="Customise XP multipliers, cooldowns, and formulas" placement="top">
              <motion.button animate={isLevelingSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={(isPro && levelingHasChanges) ? { scale: 0.95 } : undefined}
                onClick={handleSaveSettings}
                disabled={saving || (!levelingHasChanges && !isLevelingSaved)}
                className={`px-10 py-5 rounded-[2rem] shadow-xl flex items-center gap-4 font-black transition-all duration-300 ease-out hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 group uppercase text-xs tracking-widest ${
                  isLevelingSaved
                    ? "bg-emerald-500 shadow-emerald-500/20 text-white"
                    : !levelingHasChanges
                         ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30"
                         : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
                }`}
              >
                {saving ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isLevelingSaved ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <Save className="w-6 h-6 " />
                )}
                {saving
                  ? "Saving..."
                  : isLevelingSaved
                    ? "Saved"
                    : "Save Changes"}
              </motion.button>
              </ProGate>
            </div>
          </>
        )}
        {activeTab === "giveaways" && (
          <Suspense fallback={<SentinLLoading />}>
            <GiveawaysManager />
          </Suspense>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
