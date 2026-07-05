import React, { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { useServer } from "../context/ServerContext";
import { Activity } from "lucide-react";
import { db, auth } from "../firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { Loader2, Save, Plus, Trash2, Info, Check } from "lucide-react";
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
          <Info className="w-4 h-4 text-text-secondary" />
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="top"
          align="center"
          sideOffset={5}
          className="w-56 p-2.5 bg-gray-800 border border-gray-700 text-gray-100 text-[11px] font-semibold rounded-xl shadow-2xl z-[9999] text-center leading-relaxed tracking-wide animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 shadow-black/50"
        >
          {text}
          <TooltipPrimitive.Arrow className="fill-gray-800" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

export default function ModSettings() {
  const [user] = useAuthState(auth);
  const { selectedServerId, tier, botPermissions, isBetaTester, isTrial, isPro, dailyAICount, dailyAiLimit } = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      toast.error("Failed to update setting.", { id: `${field}-toast` });
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
          Configure automated actions and AI context.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-8 pb-6 flex flex-col flex-1 gap-10">
        {/* AI Analysis Section */}
        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-extrabold text-on-surface uppercase tracking-widest border-b-2 border-primary pb-1 inline-block">
              AI Analysis Limits
            </h3>
          </div>

          <div className="space-y-8 pl-1">
            <div>
              <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest flex items-center justify-between">
                <span className="flex items-center">
                  AI Confidence Threshold (%)
                  <Tooltip text="The minimum confidence score required for the AI to flag a message. Setting this higher reduces false positives." />
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
              <ProGate isPro={isPro} featureName="Auto-Delete" featureDescription="Automatically remove Extreme-level messages from the channel" className="relative block w-full">
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
                  Enable Auto-delete Flagged Messages
                </label>
                <span className="text-[10px] text-text-secondary mt-1">
                  Automatically deletes messages that the AI flags as "Extreme"
                  (and meets the confidence threshold).
                </span>
              </div>
              </div>
              </ProGate>
            </div>

            <div className={`flex flex-col pt-2 group`}>
              <ProGate isPro={isPro} featureName="Context Awareness" featureDescription="AI reads conversation history for better decisions" className="relative block w-full">
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
                  Enable AI Context Reading
                </label>
              </div>
              <p className="text-[10px] text-text-secondary mt-1 ml-10">
                AI dynamically reads relevant recent messages (Mentions, Replies, same Author, and recent history) to reduce false positives.
              </p>
              </div>
              </ProGate>
            </div>

            <div className={`flex flex-col pt-2 group`}>
              <ProGate isPro={isPro} featureName="Dual-Model Escalation" featureDescription="Uncertain cases are re-checked by a more powerful AI" className="relative block w-full">
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
                  AI Escalation 
                </label>
              </div>
              <p className="text-[10px] text-text-secondary mt-1 ml-10">
                When enabled, uncertain messages are re-analyzed by a more powerful model for higher accuracy.
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
