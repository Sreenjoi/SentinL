import React, { useState, useEffect } from "react";
import { EmptyState, CompactEmptyState } from "./EmptyState";
import {
  doc,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { ProGate } from "./ProGate";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import {
  Save,
  Loader2,
  Check,
  Plus,
  Trash2,
  Hash,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSaveState } from "../hooks/useSaveState";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { toast } from "sonner";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";
import { PermissionsWarning } from "./PermissionsWarning";
import { PermissionGateModal } from "./PermissionGateModal";

export default function RolesManager() {
  const { isPro, selectedServerId, tier, botPermissions } = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingServerSettings, setSavingServerSettings] = useState(false);
  const [serverSettings, setServerSettings] = useState<{
    autorole: { enabled: boolean; roleId: string };
    reactionRoles: any[];
  }>({
    autorole: { enabled: false, roleId: "" },
    reactionRoles: [],
  });

  const [onboardingConfig, setOnboardingConfig] = useState<{
    welcomeChannelId: string;
    welcomeMessage: string;
    dmWelcomeEnabled: boolean;
    channelWelcomeEnabled: boolean;
    dmWelcomeMessage: string;
  }>({
    welcomeChannelId: "",
    welcomeMessage: "",
    dmWelcomeEnabled: false,
    channelWelcomeEnabled: false,
    dmWelcomeMessage: "",
  });

  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [botRolePosition, setBotRolePosition] = useState<number>(0);
  const [discordChannels, setDiscordChannels] = useState<any[]>([]);
  const [showCreateRR, setShowCreateRR] = useState(false);
  const [creatingRR, setCreatingRR] = useState(false);
  const [newRR, setNewRR] = useState({
    title: "Get your roles!",
    channelId: "",
    mappings: [{ emoji: "👋", label: "Example Role", roleId: "" }]
  });

  const { isSaved: isRolesSaved, setIsSaved: setIsRolesSaved, hasChanges: rolesHasChanges, hasChangesRef, resetSaveState, updateBaseline } = useSaveState([
    serverSettings,
    onboardingConfig,
  ]);

  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  useEffect(() => {
    if (initialDataLoaded) return;
    if (!loading) { // Wait for first load
      const t = setTimeout(() => {
        resetSaveState([serverSettings, onboardingConfig]);
        setInitialDataLoaded(true);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [loading, serverSettings, onboardingConfig, initialDataLoaded]);

  useEffect(() => {
    if (selectedServerId) {
      auth.currentUser?.getIdToken().then(token => {
        fetch(`/api/discord/roles/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(async (res) => {
            if (res.ok) return res.json();
            if (res.status === 404) return { roles: [] };
            throw new Error(await res.text());
          })
          .then((data) => {
            if (data.roles) setDiscordRoles(data.roles);
            if (data.botHighestRolePosition !== undefined) setBotRolePosition(data.botHighestRolePosition);
          })
          .catch((err) => console.error("Failed to fetch roles", err));
          
        fetch(`/api/discord/channels/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(async (res) => {
            if (res.ok) return res.json();
            if (res.status === 404) return { channels: [] };
            throw new Error(await res.text());
          })
          .then((data) => {
            if (data.channels) setDiscordChannels(data.channels);
          })
          .catch((err) => console.error("Failed to fetch channels", err));
      });
    }
  }, [selectedServerId]);

  useEffect(() => {
    if (!selectedServerId) return;

    // Fetch main server settings for roles
    const mainServerRef = doc(db, `servers/${selectedServerId}`);
    const unsubscribeMainServer = onSnapshot(mainServerRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const settings = {
          autorole: data.autorole || { enabled: false, roleId: "" },
          reactionRoles: data.reactionRoles || [],
        };
        if (hasChangesRef.current) {
          updateBaseline((old: any[]) => [settings, old[1]]);
        } else {
          setServerSettings(settings);
          updateBaseline((old: any[]) => [settings, old[1]]);
        }
      }
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}`));

    const onboardingRef = doc(db, `servers/${selectedServerId}/onboarding/config`);
    const unsubscribeOnboarding = onSnapshot(onboardingRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const cfg = {
          welcomeChannelId: data.welcomeChannelId || "",
          welcomeMessage: data.welcomeMessage || "",
          dmWelcomeEnabled: data.dmWelcomeEnabled || false,
          channelWelcomeEnabled: data.channelWelcomeEnabled || false,
          dmWelcomeMessage: data.dmWelcomeMessage || "",
        };
        if (hasChangesRef.current) {
          updateBaseline((old: any[]) => [old[0], cfg]);
        } else {
          setOnboardingConfig(cfg);
          updateBaseline((old: any[]) => [old[0], cfg]);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/onboarding/config`));

    return () => {
      unsubscribeMainServer();
      unsubscribeOnboarding();
    };
  }, [selectedServerId]);

  const toggleServerSetting = async (fieldPath: "autorole.enabled", value: boolean) => {
    if (!selectedServerId) return;

    if (fieldPath === "autorole.enabled" && value && botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }

    setServerSettings(s => ({
      ...s,
      autorole: { ...s.autorole, enabled: value }
    }));
    updateBaseline((old: any[]) => {
      const s = { ...old[0], autorole: { ...old[0].autorole, enabled: value } };
      return [s, old[1]];
    });

    try {
      await setDoc(doc(db, `servers/${selectedServerId}`), {
        autorole: { ...serverSettings.autorole, enabled: value }
      }, { merge: true });
      toast.success("Setting updated.", { duration: 2000 });
    } catch (err: any) {
      console.error(err);
      toast.error("Could not save this change. Please try again.");
      setServerSettings(s => ({
        ...s,
        autorole: { ...s.autorole, enabled: !value }
      }));
      updateBaseline((old: any[]) => {
        const s = { ...old[0], autorole: { ...old[0].autorole, enabled: !value } };
        return [s, old[1]];
      });
    }
  };

  const toggleOnboardingSetting = async (field: "dmWelcomeEnabled" | "channelWelcomeEnabled", value: boolean) => {
    if (!selectedServerId) return;

    setOnboardingConfig(s => ({ ...s, [field]: value }));
    updateBaseline((old: any[]) => {
      const o = { ...old[1], [field]: value };
      return [old[0], o];
    });

    try {
      await setDoc(doc(db, `servers/${selectedServerId}/onboarding/config`), {
        [field]: value
      }, { merge: true });
      toast.success("Setting updated.", { duration: 2000 });
    } catch (err: any) {
      console.error(err);
      toast.error("Could not save this change. Please try again.");
      setOnboardingConfig(s => ({ ...s, [field]: !value }));
      updateBaseline((old: any[]) => {
        const o = { ...old[1], [field]: !value };
        return [old[0], o];
      });
    }
  };

  const handleSaveServerSettings = async () => {
    if (!selectedServerId) return;
    
    if (serverSettings.autorole.enabled && botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }
    
    setSavingServerSettings(true);
    try {
      await setDoc(
        doc(db, `servers/${selectedServerId}`),
        {
          autorole: serverSettings.autorole,
        },
        { merge: true },
      );

      await setDoc(
        doc(db, `servers/${selectedServerId}/onboarding/config`),
        {
          welcomeChannelId: onboardingConfig.welcomeChannelId,
          welcomeMessage: onboardingConfig.welcomeMessage,
          dmWelcomeEnabled: onboardingConfig.dmWelcomeEnabled,
          channelWelcomeEnabled: onboardingConfig.channelWelcomeEnabled,
          dmWelcomeMessage: onboardingConfig.dmWelcomeMessage,
        },
        { merge: true }
      );
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Could not save your role settings. Please try again.");
    } finally {
      setSavingServerSettings(false);
      setIsRolesSaved(true);
    }
  };

  const handleDeleteReactionRole = async (panelId: string) => {
    if (!selectedServerId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/reaction-roles/${panelId}`, {
         method: "DELETE",
         headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Reaction role panel deleted.");
    } catch(err) {
      toast.error("Failed to delete panel");
    }
  };

  const handleCreateReactionRole = async () => {
    if (!selectedServerId || !newRR.channelId || !newRR.title) return;
    if (newRR.mappings.length === 0 || !newRR.mappings[0].roleId) return;

    if (botPermissions && !botPermissions.ManageRoles) {
      setMissingPermModal("Manage Roles");
      return;
    }
    if (botPermissions && !botPermissions.AddReactions) {
      setMissingPermModal("Add Reactions");
      return;
    }

    setCreatingRR(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/reaction-roles`, {
         method: "POST",
         headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}` 
         },
         body: JSON.stringify(newRR)
      });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err?.error || "Failed to create panel");
      }
      toast.success("Reaction role panel created!");
      setShowCreateRR(false);
      setNewRR({
        title: "Get your roles!",
        channelId: "",
        mappings: [{ emoji: "👋", label: "Example Role", roleId: "" }]
      });
    } catch(err: any) {
      toast.error(err.message || "Failed to create panel");
    }
    setCreatingRR(false);
  };

  if (loading)
    return (
      <div className="flex flex-col gap-8 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="border border-white/40 bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-xl shadow-primary/5 flex flex-col h-64">
            <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-outline-variant/20 bg-surface-container/30 rounded-t-[2.5rem]">
              <div className="h-6 w-48 bg-surface-container rounded-md mb-2"></div>
              <div className="h-3 w-64 bg-surface-container rounded-md"></div>
            </div>
            <div className="p-6 sm:p-8 space-y-6 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-surface-container rounded-md"></div>
                <div className="w-12 h-6 bg-surface-container rounded-full"></div>
              </div>
              <div className="h-10 w-full bg-surface-container rounded-xl"></div>
            </div>
          </div>
          <div className="border border-white/40 bg-white/80 backdrop-blur-md rounded-[2.5rem] shadow-xl shadow-primary/5 flex flex-col h-64">
            <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-outline-variant/20 bg-surface-container/30 rounded-t-[2.5rem]">
               <div className="h-6 w-48 bg-surface-container rounded-md mb-2"></div>
               <div className="h-3 w-64 bg-surface-container rounded-md"></div>
            </div>
            <div className="p-6 sm:p-8 space-y-6 flex-1 flex flex-col">
             <div className="flex items-center justify-between">
                <div className="h-4 w-32 bg-surface-container rounded-md"></div>
                <div className="w-12 h-6 bg-surface-container rounded-full"></div>
              </div>
              <div className="h-10 w-full bg-surface-container rounded-xl"></div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      {selectedServerId && (
        <PermissionsWarning 
          serverId={selectedServerId} 
          required={["ManageRoles", "SendMessages", "ReadMessageHistory", "AddReactions"]} 
        />
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="border border-white/40 bg-white/80 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-primary/5 flex flex-col">
        <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-primary/20 bg-primary text-white rounded-t-[2rem] sm:rounded-t-[2.5rem] shrink-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Server Onboarding
          </h2>
          <p className="text-[9px] sm:text-[10px] font-black text-white/78 uppercase tracking-widest mt-1">
            Automatically assign a default role and send welcome messages when members join.
          </p>
        </div>
        <div className="p-6 sm:p-8 space-y-6 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-on-surface">
              Enable Auto-Assign
            </span>
            <button
              onClick={() => toggleServerSetting("autorole.enabled", !serverSettings.autorole.enabled)}
              className={`w-12 h-6 rounded-full transition-colors duration-300 ease-out relative flex items-center shadow-inner ${
                serverSettings.autorole.enabled
                  ? "bg-success"
                  : "bg-surface-container-highest border border-outline-variant/30"
              }`}
            >
              <motion.div
                layout
                className="w-4 h-4 rounded-full bg-white shadow-sm ml-1"
                animate={{ x: serverSettings.autorole.enabled ? 24 : 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 25,
                }}
              />
            </button>
          </div>

          {serverSettings.autorole.enabled && (
            <div className="z-30 relative">
              <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                Role to Assign
              </label>
              <RoleSelector
                roles={discordRoles}
                botRolePosition={botRolePosition}
                value={serverSettings.autorole.roleId}
                onChange={(roleId) =>
                  setServerSettings((s) => ({
                    ...s,
                    autorole: { ...s.autorole, roleId },
                  }))
                }
              />
            </div>
          )}

          <div className="h-px bg-outline-variant/10 my-1" />

          <div className="space-y-6 flex flex-col">
            <div className="flex items-center justify-between z-10 relative">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-on-surface">
                  DM Welcome Message
                </span>
                <span className="text-[10px] text-text-secondary">
                  Send server rules to new members via Direct Message.
                </span>
              </div>
              <button
                onClick={() => toggleOnboardingSetting("dmWelcomeEnabled", !onboardingConfig.dmWelcomeEnabled)}
                className={`w-12 h-6 shrink-0 rounded-full transition-colors duration-300 ease-out relative flex items-center shadow-inner ${
                  onboardingConfig.dmWelcomeEnabled
                    ? "bg-success"
                    : "bg-surface-container-highest border border-outline-variant/30"
                }`}
              >
                <motion.div
                  layout
                  className="w-4 h-4 rounded-full bg-white shadow-sm ml-1"
                  animate={{ x: onboardingConfig.dmWelcomeEnabled ? 24 : 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                />
              </button>
            </div>

            <AnimatePresence>
              {onboardingConfig.dmWelcomeEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="z-20 relative space-y-5"
                >
                  <div className="pt-2">
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 flex justify-between">
                      <span>DM Message Content</span>
                      <span className="text-primary font-mono normal-case">{'{rules}'} {'{server}'}</span>
                    </label>
                    <textarea
                      value={onboardingConfig.dmWelcomeMessage}
                      onChange={(e) => setOnboardingConfig({ ...onboardingConfig, dmWelcomeMessage: e.target.value })}
                      className="w-full bg-white border border-outline-variant/30 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-primary/50 shadow-sm min-h-[140px] resize-none"
                      placeholder="Hey {user}! 👋 Welcome to **{server}**!\n\nPlease take a moment to read our rules:\n\n{rules}\n\nEnjoy your stay!"
                    />
                    <p className="text-[10px] text-text-secondary mt-1 ml-1 pb-1">
                      Use <code className="bg-surface-container px-1 py-0.5 rounded font-mono font-black">{'{rules}'}</code> to insert the server rules, <code className="bg-surface-container px-1 py-0.5 rounded font-mono font-black">{'{server}'}</code> for the server name, and <code className="bg-surface-container px-1 py-0.5 rounded font-mono font-black">{'{user}'}</code> to mention the member.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="h-px bg-outline-variant/10 my-1" />

            <div className="flex items-center justify-between z-20 relative">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-on-surface">
                  Server Welcome Message
                </span>
                <span className="text-[10px] text-text-secondary">
                  Welcome new members to the server in a specific channel.
                </span>
              </div>
              <button
                onClick={() => toggleOnboardingSetting("channelWelcomeEnabled", !onboardingConfig.channelWelcomeEnabled)}
                className={`w-12 h-6 shrink-0 rounded-full transition-colors duration-300 ease-out relative flex items-center shadow-inner ${
                  onboardingConfig.channelWelcomeEnabled
                    ? "bg-success"
                    : "bg-surface-container-highest border border-outline-variant/30"
                }`}
              >
                <motion.div
                  layout
                  className="w-4 h-4 rounded-full bg-white shadow-sm ml-1"
                  animate={{ x: onboardingConfig.channelWelcomeEnabled ? 24 : 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                />
              </button>
            </div>

            <AnimatePresence>
              {onboardingConfig.channelWelcomeEnabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="z-20 relative space-y-5"
                >
                  <div className="pt-2">
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1">
                      Welcome Channel
                    </label>
                    <ChannelSelector
                        channels={discordChannels}
                        value={onboardingConfig.welcomeChannelId}
                        onChange={(val) => setOnboardingConfig({ ...onboardingConfig, welcomeChannelId: val })}
                        placeholder="Select a channel"
                      />
                  </div>

                  {onboardingConfig.welcomeChannelId && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 flex justify-between">
                          <span>Welcome Message</span>
                          <span className="text-primary font-mono normal-case">{'{user}'} {'{server}'}</span>
                        </label>
                        <textarea
                          value={onboardingConfig.welcomeMessage}
                          onChange={(e) => setOnboardingConfig({ ...onboardingConfig, welcomeMessage: e.target.value })}
                          className="w-full bg-white border border-outline-variant/30 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-primary/50 shadow-sm min-h-[100px] resize-none"
                          placeholder="Hey {user}, welcome to **{server}**! 🎉 We're so glad you're here. Make sure to check out the rules and say hi!"
                        />
                        <p className="text-[10px] text-text-secondary mt-1 ml-1 pb-1">
                          Use <code className="bg-surface-container px-1 py-0.5 rounded font-mono font-black">{'{user}'}</code> to mention the user and <code className="bg-surface-container px-1 py-0.5 rounded font-mono font-black">{'{server}'}</code> for the server name.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="pt-4 border-t border-outline-variant/20 z-10 relative mt-auto">
            <motion.button animate={isRolesSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={{ scale: rolesHasChanges ? 0.95 : 1 }}
              onClick={handleSaveServerSettings}
              disabled={savingServerSettings || (!rolesHasChanges && !isRolesSaved)}
              className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-lg flex items-center justify-center gap-2 ${
                isRolesSaved
                  ? "bg-emerald-500 shadow-emerald-500/20 text-white hover:bg-emerald-600"
                  : !rolesHasChanges
                      ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30"
                      : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
              } ${savingServerSettings ? "opacity-50 cursor-wait" : ""}`}
            >
              {savingServerSettings ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isRolesSaved ? (
                <Check className="w-5 h-5" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {savingServerSettings
                ? "Saving..."
                : isRolesSaved
                  ? "Saved"
                  : "Save Changes"}
            </motion.button>
          </div>
        </div>
      </div>

      <div className="border border-white/40 bg-white/80 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] shadow-xl shadow-primary/5 flex flex-col">
        <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-primary/20 bg-primary text-white rounded-t-[2rem] sm:rounded-t-[2.5rem] shrink-0">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Reaction Roles Manager
          </h2>
          <p className="text-[9px] sm:text-[10px] font-black text-white/78 uppercase tracking-widest mt-1">
            Active panels where users self-assign roles via buttons.
          </p>
        </div>
        <div className="p-6 sm:p-8 space-y-4 flex-1 flex flex-col">
          <div className="p-4 bg-primary-container/20 border border-primary/20 rounded-2xl flex flex-col items-start gap-3">
            <div>
              <p className="text-sm font-medium text-primary mb-1">
                Create a new Reaction Role panel
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">
                Configure a panel directly here. A message with buttons will be posted in the selected channel.
              </p>
            </div>
            
            <ProGate isPro={isPro || serverSettings.reactionRoles.length < 5} featureName="Unlimited Reaction Roles" featureDescription="Free tier is limited to 5 reaction role panels. Upgrade to Pro for unlimited panels!">
            <button
              onClick={() => setShowCreateRR(true)}
              className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl shadow hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              New Panel
            </button>
            </ProGate>
            {(!isPro) && (
              <p className="text-[10px] text-accent/80 font-bold mt-1 bg-accent/5 py-1.5 px-3 rounded-lg border border-accent/10">
                Tip: Free tier is limited to 5 reaction role panels. Upgrade
                to Pro for unlimited.
              </p>
            )}
          </div>

          <AnimatePresence>
            {showCreateRR && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/60 border border-outline-variant/30 rounded-2xl p-4 overflow-visible shadow-sm"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-1">Title</label>
                    <input
                      type="text"
                      value={newRR.title}
                      onChange={e => setNewRR({...newRR, title: e.target.value})}
                      className="w-full bg-white border border-outline-variant/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      placeholder="e.g., Get your roles!"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-1">Channel</label>
                    <ChannelSelector
                        channels={discordChannels}
                        value={newRR.channelId}
                        onChange={(val) => setNewRR({...newRR, channelId: val})}
                        placeholder="Select a channel..."
                      />
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-2">Role Mappings</label>
                    <div className="space-y-2">
                       {newRR.mappings.map((m, i) => (
                          <div key={i} className="flex gap-2 items-center bg-surface-container/50 p-2 rounded-xl border border-outline-variant/20">
                            <input
                              type="text"
                              value={m.emoji || ""}
                              onChange={e => {
                                const newMappings = [...newRR.mappings];
                                newMappings[i].emoji = e.target.value;
                                setNewRR({...newRR, mappings: newMappings});
                              }}
                              className="w-12 text-center bg-white border border-outline-variant/30 rounded-lg py-1.5 text-sm focus:outline-none focus:border-primary/50"
                              placeholder="👋"
                            />
                            <input
                              type="text"
                              value={m.label || ""}
                              onChange={e => {
                                const newMappings = [...newRR.mappings];
                                newMappings[i].label = e.target.value;
                                setNewRR({...newRR, mappings: newMappings});
                              }}
                              className="w-24 bg-white border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary/50"
                              placeholder="Label"
                            />
                            <RoleSelector
                              roles={discordRoles}
                              botRolePosition={botRolePosition}
                              value={m.roleId}
                              onChange={(roleId) => {
                                const newMappings = [...newRR.mappings];
                                newMappings[i].roleId = roleId;
                                setNewRR({...newRR, mappings: newMappings});
                              }}
                              className="flex-1"
                              placeholder="Select role..."
                            />
                            <button
                              onClick={() => {
                                const newMappings = newRR.mappings.filter((_, idx) => idx !== i);
                                setNewRR({...newRR, mappings: newMappings});
                              }}
                              className="p-1.5 text-danger hover:bg-danger/10 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                       ))}
                       <button
                         onClick={() => {
                           setNewRR({
                             ...newRR,
                             mappings: [...newRR.mappings, { emoji: "", label: "", roleId: "" }]
                           });
                         }}
                         className="text-xs font-bold text-primary hover:text-primary/80 transition-colors mt-2"
                       >
                         + Add Role Button
                       </button>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant/20">
                     <button
                       onClick={() => setShowCreateRR(false)}
                       className="px-4 py-2 text-text-secondary text-sm font-bold rounded-xl hover:bg-surface-container transition-colors"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={handleCreateReactionRole}
                       disabled={creatingRR || !newRR.channelId || !newRR.title || newRR.mappings.length === 0}
                       className="px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                     >
                       {creatingRR ? "Creating..." : "Create Panel"}
                     </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {serverSettings.reactionRoles.length === 0 ? (
            <div className="mt-4">
              <CompactEmptyState 
                title="No reaction role panels active."
                description="Click Add Panel to create your first reaction role assignment."
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 mt-4">
              <AnimatePresence>
              {serverSettings.reactionRoles.map(
                (panel: any, idx: number) => (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={idx}
                    className="p-4 bg-white/40 border border-white/40 rounded-2xl shadow-sm flex flex-col gap-3 relative group"
                  >
                    <button
                      onClick={() => handleDeleteReactionRole(panel.id)}
                      className="absolute top-4 right-4 p-1.5 text-danger bg-danger/5 hover:bg-danger/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-on-surface">
                        {panel.title || "Reaction Roles Panel"}
                      </span>
                      <span className="text-[10px] text-text-secondary mt-1 font-mono">
                        ID: {panel.id} &middot; Channel: {discordChannels.find(c => c.id === panel.channelId)?.name ? `#${discordChannels.find(c => c.id === panel.channelId)?.name}` : panel.channelId}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {panel.mappings.map((m: any, i: number) => {
                        const r = discordRoles.find((r: any) => r.id === m.roleId);
                        return (
                          <div
                            key={i}
                            className="px-2 py-1 bg-surface-container text-xs rounded border border-outline-variant/30 flex items-center gap-1.5 font-medium shadow-sm"
                          >
                            <span>{m.emoji}</span>
                            <div className="w-px h-3 bg-outline-variant/40 mx-0.5" />
                            {r ? (
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : "#99aab5" }} />
                                  <span style={{ color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : "inherit" }}>{r.name}</span>
                                </span>
                            ) : (
                                <span className="text-text-secondary">Role: {m.roleId}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ),
              )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

