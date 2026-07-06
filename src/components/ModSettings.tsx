import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { useServer } from "../context/ServerContext";
import { Activity } from "lucide-react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { Loader2, Save, Plus, Trash2, Info, Check, SlidersHorizontal, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSaveState } from "../hooks/useSaveState";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { toast } from "sonner";
import { PermissionGateModal } from "./PermissionGateModal";
import { ProGate } from "./ProGate";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const Tooltip = ({ text }: { text: string }) => (
  <TooltipPrimitive.Provider delayDuration={100}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span className="inline-flex items-center ml-2 align-middle z-50 cursor-help">
          <Info className="w-4 h-4 text-current opacity-70" />
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          align="center"
          sideOffset={5}
          className="w-60 rounded-2xl border border-primary/20 bg-white/95 p-3 text-center text-[11px] font-bold leading-relaxed tracking-normal text-on-surface shadow-2xl shadow-primary/15 backdrop-blur-xl z-[9999] animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
          {text}
          <TooltipPrimitive.Arrow className="fill-white" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

type ModerationPresetId = "relaxed" | "balanced" | "strict";

const moderationPresets: Record<
  ModerationPresetId,
  {
    title: string;
    description: string;
    confidenceThreshold: number;
    autoDelete: boolean;
    useContext: boolean;
    enableDualModel: boolean;
  }
> = {
  relaxed: {
    title: "Relaxed",
    description: "Fewer borderline flags. Best for casual servers.",
    confidenceThreshold: 88,
    autoDelete: false,
    useContext: false,
    enableDualModel: false,
  },
  balanced: {
    title: "Balanced",
    description: "Recommended default for most communities.",
    confidenceThreshold: 80,
    autoDelete: false,
    useContext: true,
    enableDualModel: false,
  },
  strict: {
    title: "Strict",
    description: "More sensitive review for higher-risk servers.",
    confidenceThreshold: 72,
    autoDelete: true,
    useContext: true,
    enableDualModel: true,
  },
};

function isPermissionDenied(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "permission-denied" || message.includes("missing or insufficient permissions");
}

export default function ModSettings() {
  const [user] = useAuthState(auth);
  const { selectedServerId, tier, botPermissions, isBetaTester, isTrial, isPro, dailyAICount, dailyAiLimit } = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<ModerationPresetId | null>(null);
  const [newKeyword, setNewKeyword] = useState("");

  const [settings, setSettings] = useState<{
    confidenceThreshold: number;
    autoDelete: boolean;
    useContext: boolean;
    enableDualModel: boolean;
  }>({
    confidenceThreshold: 80,
    autoDelete: false,
    useContext: false,
    enableDualModel: false,
  });
  const { isSaved, setIsSaved, hasChanges, hasChangesRef, resetSaveState, updateBaseline } = useSaveState(settings);

  const selectedPreset = (Object.keys(moderationPresets) as ModerationPresetId[]).find((presetId) => {
    const preset = moderationPresets[presetId];
    if (settings.confidenceThreshold !== preset.confidenceThreshold) return false;
    if (!isPro) return true;
    return (
      settings.autoDelete === preset.autoDelete &&
      settings.useContext === preset.useContext &&
      settings.enableDualModel === preset.enableDualModel
    );
  }) || "custom";

  useEffect(() => {
    if (!user || !selectedServerId) {
      setLoading(false);
      return;
    }

    try {
      const serverDoc = doc(db, `servers/${selectedServerId}`);
      const unsubscribe = onSnapshot(serverDoc, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          
          const remoteSettings = {
            confidenceThreshold: data.confidenceThreshold || 80,
            autoDelete: isPro ? (data.autoDelete || false) : false,
            useContext: isPro ? (data.useContext || false) : false,
            enableDualModel: isPro ? (data.enableDualModel === true) : false,
          };

          if (hasChangesRef.current) {
            // Local edits exist. Do NOT wipe them out. Only update the baseline so saving works cleanly.
            updateBaseline(() => remoteSettings);
          } else {
            // Safe to apply remotely fetched settings. 
            setSettings(remoteSettings);
            resetSaveState(remoteSettings);
          }
        }
        setLoading(false);
      }, (err) => {
        console.error("Error fetching settings:", err);
        handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}`);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (err: any) {
      console.error("Error setting up snapshot:", err);
      handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}`);
      setLoading(false);
    }
  }, [user, selectedServerId, isPro]);

    const toggleSetting = async (field: Extract<keyof typeof settings, string>, value: boolean) => {
    if (!selectedServerId) return;

    if (field === "autoDelete" && value && botPermissions && !botPermissions.ManageMessages) {
      setMissingPermModal("Manage Messages");
      return;
    }

    setSettings((prev) => ({ ...prev, [field]: value }));
    updateBaseline((old: any) => ({ ...old, [field]: value }));
    try {
      await setDoc(doc(db, `servers/${selectedServerId}`), { [field]: value }, { merge: true });
      toast.success("Setting updated.", { id: `${field}-toast`, duration: 2000 });
    } catch (err: any) {
      console.error(`Error toggling ${field}:`, err);
      handleFirestoreError(err, OperationType.WRITE, `servers/${selectedServerId}`);
      toast.error("Could not save this change. Please try again.", { id: `${field}-toast` });
      setSettings((prev) => ({ ...prev, [field]: !value }));
      updateBaseline((old: any) => ({ ...old, [field]: !value }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId) return;

    if (settings.autoDelete && botPermissions && !botPermissions.ManageMessages) {
      setMissingPermModal("Manage Messages");
      return;
    }

    setSaving(true);
    try {
      const payloadToSave: any = { ...settings };
      if (!isPro) {
        delete payloadToSave.autoDelete;
        delete payloadToSave.useContext;
        delete payloadToSave.enableDualModel;
        delete payloadToSave.primaryConfidenceThreshold;
      }
      
      await setDoc(doc(db, `servers/${selectedServerId}`), payloadToSave, {
        merge: true,
      });
      setIsSaved(true);
    } catch (err: any) {
      console.error("Error saving settings:", err);
      handleFirestoreError(err, OperationType.WRITE, `servers/${selectedServerId}`);
      toast.error("Failed to save settings.");
    }
    setSaving(false);
  };

  const applyModerationPreset = async (presetId: ModerationPresetId) => {
    if (!selectedServerId) return;

    const preset = moderationPresets[presetId];
    const nextSettings = {
      confidenceThreshold: preset.confidenceThreshold,
      autoDelete: isPro ? preset.autoDelete : false,
      useContext: isPro ? preset.useContext : false,
      enableDualModel: isPro ? preset.enableDualModel : false,
    };

    if (isPro && nextSettings.autoDelete && botPermissions && !botPermissions.ManageMessages) {
      setMissingPermModal("Manage Messages");
      return;
    }

    setApplyingPreset(presetId);
    setSettings(nextSettings);
    updateBaseline(() => nextSettings);

    try {
      const freeSafePayload = {
        confidenceThreshold: nextSettings.confidenceThreshold,
      };
      const payloadToSave: any = {
        ...freeSafePayload,
      };

      if (isPro) {
        payloadToSave.autoDelete = nextSettings.autoDelete;
        payloadToSave.useContext = nextSettings.useContext;
        payloadToSave.enableDualModel = nextSettings.enableDualModel;
      }

      await setDoc(doc(db, `servers/${selectedServerId}`), payloadToSave, { merge: true });
      setIsSaved(true);
      toast.success(`${preset.title} moderation style applied.`);
    } catch (err: any) {
      if (isPro && isPermissionDenied(err)) {
        try {
          const fallbackSettings = {
            ...nextSettings,
            autoDelete: false,
            useContext: false,
            enableDualModel: false,
          };
          await setDoc(
            doc(db, `servers/${selectedServerId}`),
            { confidenceThreshold: nextSettings.confidenceThreshold },
            { merge: true },
          );
          setSettings(fallbackSettings);
          updateBaseline(() => fallbackSettings);
          setIsSaved(true);
          toast.warning(
            `${preset.title} sensitivity applied. Pro-only style options could not be saved for this server.`,
          );
          return;
        } catch (fallbackError: any) {
          console.error(`Error applying ${presetId} fallback preset:`, fallbackError);
        }
      }
      console.error(`Error applying ${presetId} preset:`, err);
      handleFirestoreError(err, OperationType.WRITE, `servers/${selectedServerId}`);
      toast.error("Failed to apply moderation style.");
    } finally {
      setApplyingPreset(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden shadow-xl shadow-primary/5 w-full animate-pulse">
        <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30">
          <div className="h-6 w-48 bg-surface-container rounded-md mb-2"></div>
          <div className="h-3 w-64 bg-surface-container rounded-md"></div>
        </div>
        <div className="p-8 space-y-10">
          <div className="space-y-6">
            <div className="h-5 w-32 bg-surface-container rounded-md"></div>
            <div className="space-y-8 pl-1">
              <div>
                <div className="h-3 w-40 bg-surface-container rounded-md mb-4"></div>
                <div className="h-1.5 w-full bg-surface-container rounded-full"></div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-6 w-6 bg-surface-container rounded-lg"></div>
                <div className="space-y-2">
                  <div className="h-3 w-48 bg-surface-container rounded-md"></div>
                  <div className="h-2 w-64 bg-surface-container rounded-md"></div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-6 w-6 bg-surface-container rounded-lg"></div>
                <div className="space-y-2">
                  <div className="h-3 w-48 bg-surface-container rounded-md"></div>
                  <div className="h-2 w-64 bg-surface-container rounded-md"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedServerId) {
    return (
      <div className="flex justify-center items-center h-64 text-text-secondary">
        Please select a server to view settings.
      </div>
    );
  }

  return (
    <>
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      <div
        className="flex flex-col h-full bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden shadow-xl shadow-primary/5 w-full transition-all duration-300 ease-in-out"
      >
      <div className="px-8 py-6 border-b border-primary/20 bg-primary">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            AI Moderation Settings
          </h2>
        </div>
        <p className="text-[10px] font-black text-white/80 uppercase tracking-widest mt-1">
          Choose how careful SentinL should be.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-8 pb-6 flex flex-col flex-1 gap-10">
        {/* Moderation Behavior Section */}
        <div className="space-y-8 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-on-surface uppercase tracking-widest border-b-2 border-primary pb-1 inline-block">
                Moderation Behavior
              </h3>
              <p className="mt-3 max-w-2xl text-xs font-semibold leading-relaxed text-text-secondary">
                Pick how strict SentinL should be, when it should act, and when it should look closer before deciding.
              </p>
            </div>
            <span className="w-fit rounded-full border border-outline-variant/30 bg-surface-container/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-text-secondary">
              {selectedPreset === "custom" ? "Custom setup" : `${moderationPresets[selectedPreset as ModerationPresetId].title} style`}
            </span>
          </div>

          <div className="space-y-9 pl-1">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-on-surface uppercase tracking-widest">
                    Moderation Style
                  </h4>
                  <p className="text-[10px] text-text-secondary mt-1 max-w-2xl">
                    Start with a style that fits your server. Free servers can adjust sensitivity; Pro and Premium can also use context, extra review, and auto-delete.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {(Object.keys(moderationPresets) as ModerationPresetId[]).map((presetId) => {
                  const preset = moderationPresets[presetId];
                  const active = selectedPreset === presetId;
                  return (
                    <button
                      key={presetId}
                      type="button"
                      onClick={() => applyModerationPreset(presetId)}
                      disabled={applyingPreset !== null}
                      className={`border-l-2 py-2 pl-4 pr-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        active
                          ? "border-primary text-primary"
                          : "border-outline-variant/40 text-on-surface hover:border-primary/50"
                      } disabled:cursor-wait disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-widest text-on-surface">
                          {preset.title}
                        </span>
                        {applyingPreset === presetId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : active ? (
                          <CheckCircle className="w-3.5 h-3.5 text-primary" />
                        ) : null}
                      </div>
                      <p className="text-[10px] mt-2 leading-relaxed text-text-secondary">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}

                <div className={`border-l-2 py-2 pl-4 pr-3 ${selectedPreset === "custom" ? "border-primary" : "border-outline-variant/40"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-black uppercase tracking-widest text-on-surface">Custom</div>
                    {selectedPreset === "custom" && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-[10px] mt-2 leading-relaxed text-text-secondary">
                    Shown when you change the controls manually.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-outline-variant/20 pt-7">
              <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest flex items-center justify-between">
                <span className="flex items-center">
                  Flagging Strictness (%)
                  <Tooltip text="Higher means SentinL waits until it is more sure before flagging. Lower catches more borderline messages but may need more moderator review." />
                </span>
              </label>
              <div className="flex items-center space-x-6 px-2">
                <input
                  type="range"
                  min="50"
                  max="100"
                  value={settings.confidenceThreshold}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      confidenceThreshold: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-1.5 bg-surface-container rounded-full appearance-none cursor-pointer accent-primary disabled:opacity-30 disabled:cursor-not-allowed"
                />
                <span className="text-lg font-black text-primary min-w-[3rem] text-right font-mono">
                  {settings.confidenceThreshold}%
                </span>
              </div>
            </div>

            <div className={`flex items-center pt-2 group`}>
              <ProGate isPro={isPro} featureName="Auto-Delete" featureDescription="Remove clearly severe messages automatically so moderators do not have to clean them up by hand." className="relative block w-full">
              <div className="flex items-center">
              <div className="relative flex items-center cursor-pointer">
                <input
                  id="autoDelete"
                  type="checkbox"
                  checked={settings.autoDelete}
                  onChange={(e) => toggleSetting("autoDelete", e.target.checked)}
                  className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                />
                <div
                  className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.autoDelete ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20" : "bg-surface-container border-outline-variant peer-hover:border-orange-500/50"}`}
                >
                  {settings.autoDelete && (
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  )}
                </div>
              </div>
              <div className="ml-4 flex flex-col">
                <label
                  htmlFor="autoDelete"
                  className="block text-xs font-bold text-on-surface flex items-center gap-2 cursor-pointer uppercase tracking-wider group relative"
                >
                  Auto-delete severe messages
                </label>
                <span className="text-[10px] text-text-secondary mt-1">
                  Removes messages SentinL is highly sure are severe.
                </span>
              </div>
              </div>
              </ProGate>
            </div>

            <div className={`flex flex-col pt-2 group`}>
              <ProGate isPro={isPro} featureName="Context Awareness" featureDescription="Let SentinL look at nearby chat when a message needs more context." className="relative block w-full">
              <div className="flex flex-col">
              <div className="flex items-center">
                <div className="relative flex items-center cursor-pointer">
                  <input
                    id="useContext"
                    type="checkbox"
                    checked={settings.useContext}
                    onChange={(e) => toggleSetting("useContext", e.target.checked)}
                    className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                  />
                  <div
                    className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.useContext ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20" : "bg-surface-container border-outline-variant peer-hover:border-orange-500/50"}`}
                  >
                    {settings.useContext && (
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    )}
                  </div>
                </div>
                <label
                  htmlFor="useContext"
                  className="ml-4 block text-xs font-bold text-on-surface flex items-center gap-2 cursor-pointer uppercase tracking-wider group relative"
                >
                  Read nearby chat when needed
                </label>
              </div>
              <p className="text-[10px] text-text-secondary mt-1 ml-10">
                Helps SentinL understand replies, mentions, and ongoing arguments before it decides.
              </p>
              </div>
              </ProGate>
            </div>

            <div className={`flex flex-col pt-2 group`}>
              <ProGate isPro={isPro} featureName="Extra Review" featureDescription="Send uncertain cases through a stronger second check before taking action." className="relative block w-full">
              <div className="flex flex-col">
              <div className="flex items-center">
                <div className="relative flex items-center cursor-pointer">
                  <input
                    id="enableDualModel"
                    type="checkbox"
                    checked={settings.enableDualModel}
                    onChange={(e) => toggleSetting("enableDualModel", e.target.checked)}
                    className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                  />
                  <div
                    className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.enableDualModel ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20" : "bg-surface-container border-outline-variant peer-hover:border-orange-500/50"}`}
                  >
                    {settings.enableDualModel && (
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    )}
                  </div>
                </div>
                <label
                  htmlFor="enableDualModel"
                  className="ml-4 block text-xs font-bold text-on-surface flex items-center gap-2 cursor-pointer uppercase tracking-wider group relative"
                >
                  Extra review for uncertain cases
                </label>
              </div>
              <p className="text-[10px] text-text-secondary mt-1 ml-10">
                When SentinL is unsure, it checks again before making a final call.
              </p>
              </div>
              </ProGate>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-outline-variant/20 mt-auto">
          <motion.button animate={isSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={{ scale: hasChanges ? 0.95 : 1 }}
            type="submit"
            disabled={saving || (!hasChanges && !isSaved)}
            className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-lg flex items-center justify-center gap-2 ${
              isSaved
                ? "bg-emerald-500 text-white shadow-emerald-500/20"
                : !hasChanges
                  ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30"
                  : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
            } ${saving ? "opacity-50 cursor-wait" : ""}`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSaved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving..." : isSaved ? "Saved" : "Save Changes"}
          </motion.button>
        </div>
      </form>
    </div>
    </>
  );
}
