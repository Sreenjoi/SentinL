import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import {
  ArrowRight,
  ArrowLeft,
  Bot,
  CheckCircle,
  Layers3,
  Loader2,
  MessageSquareText,
  PlayCircle,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { ServerRulePresetPicker } from "./ServerRulePresetPicker";
import { useServer } from "../context/ServerContext";
import { useSetupStatus, type SetupStatus } from "../hooks/useSetupStatus";
import { getDiscordInviteUrl } from "../utils/discordInvite";
import type { ServerRulePreset } from "../data/serverRulePresets";

type FirstRunSetupFlowProps = {
  serverName: string;
  onCompleted?: () => void;
};

type PresetId = "relaxed" | "balanced" | "strict";

const presets: Record<
  PresetId,
  {
    title: string;
    label: string;
    description: string;
    payload: {
      confidenceThreshold: number;
      autoDelete: boolean;
      useContext: boolean;
      enableDualModel: boolean;
    };
  }
> = {
  relaxed: {
    title: "Relaxed",
    label: "Light review",
    description: "Best for casual servers that only want obvious abuse and spam reviewed.",
    payload: {
      confidenceThreshold: 88,
      autoDelete: false,
      useContext: false,
      enableDualModel: false,
    },
  },
  balanced: {
    title: "Balanced",
    label: "Recommended",
    description: "A steady default for most servers: catches risky messages without being jumpy.",
    payload: {
      confidenceThreshold: 80,
      autoDelete: false,
      useContext: true,
      enableDualModel: false,
    },
  },
  strict: {
    title: "Strict",
    label: "More sensitive",
    description: "Better for large or high-risk communities that want more messages reviewed.",
    payload: {
      confidenceThreshold: 72,
      autoDelete: true,
      useContext: true,
      enableDualModel: true,
    },
  },
};

const presetIds = Object.keys(presets) as PresetId[];

const permissionRows = [
  {
    key: "SendMessages",
    title: "Send Messages",
    description: "Lets SentinL post setup alerts, logs, and helpful replies.",
  },
  {
    key: "ManageMessages",
    title: "Manage Messages",
    description: "Lets SentinL remove messages when moderators or auto-delete choose that action.",
  },
  {
    key: "ModerateMembers",
    title: "Moderate Members",
    description: "Lets SentinL time out members when that moderation action is used.",
  },
  {
    key: "ViewChannel",
    title: "View Channels",
    description: "Lets SentinL see the channels it is supposed to protect.",
  },
  {
    key: "ReadMessageHistory",
    title: "Read Message History",
    description: "Helps SentinL understand recent chat when context is needed.",
  },
  {
    key: "EmbedLinks",
    title: "Embed Links",
    description: "Keeps moderation logs readable in your log channel.",
  },
];

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-primary shadow-sm transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/35 bg-white/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary disabled:cursor-not-allowed disabled:opacity-60";

const driftInTransition = {
  duration: 0.42,
  ease: [0.16, 1, 0.3, 1] as const,
};

function isPermissionDenied(error: any): boolean {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "permission-denied" || message.includes("missing or insufficient permissions");
}

function statusIcon(done: boolean) {
  return done ? (
    <CheckCircle className="w-4 h-4 text-white" />
  ) : (
    <XCircle className="w-4 h-4 text-white/60" />
  );
}

function setupStepCompletion(setup: SetupStatus, step: number): boolean {
  if (step === 0) return setup.connectComplete && setup.claimComplete && setup.inviteComplete && setup.activateComplete;
  if (step === 1) return setup.permissionsComplete && setup.intentsComplete && setup.logComplete;
  if (step === 2) return setup.serverTypeComplete;
  if (step === 3) return setup.rulesComplete;
  return setup.testBotDone;
}

function firstIncompleteStep(setup: SetupStatus): number {
  if (!setup.connectComplete || !setup.claimComplete || !setup.inviteComplete || !setup.activateComplete) return 0;
  if (!setup.permissionsComplete || !setup.intentsComplete || !setup.logComplete) return 1;
  if (!setup.serverTypeComplete) return 2;
  if (!setup.rulesComplete) return 3;
  return 4;
}

export function FirstRunSetupFlow({ serverName, onCompleted }: FirstRunSetupFlowProps) {
  const navigate = useNavigate();
  const setup = useSetupStatus();
  const {
    selectedServerId,
    botPermissions,
    intentsWarning,
    isPro,
    user,
  } = useServer();

  const [activeStep, setActiveStep] = useState(0);
  const [savingPreset, setSavingPreset] = useState<PresetId | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId | null>(null);
  const [selectedServerTypeId, setSelectedServerTypeId] = useState("custom");
  const [existingRules, setExistingRules] = useState<string[]>([]);
  const [addingRules, setAddingRules] = useState<Record<string, "idle" | "loading" | "added">>({});
  const [addingAllRules, setAddingAllRules] = useState(false);
  const [completing, setCompleting] = useState<"finish" | "skip" | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [completed, setCompleted] = useState(false);

  const steps = useMemo(
    () => [
      { title: "Connect & Activate", icon: Bot },
      { title: "Permissions & Logs", icon: ShieldCheck },
      { title: "Choose Server Type", icon: Layers3 },
      { title: "Rules & Style", icon: SlidersHorizontal },
      { title: "Run Test Scan", icon: MessageSquareText },
    ],
    [],
  );

  const existingRuleSet = useMemo(
    () => new Set(existingRules.map((rule) => rule.trim().toLowerCase())),
    [existingRules],
  );

  useEffect(() => {
    if (!selectedServerId) {
      setExistingRules([]);
      return;
    }

    return onSnapshot(
      collection(db, `servers/${selectedServerId}/rules`),
      (snap) => {
        setExistingRules(
          snap.docs
            .map((ruleDoc) => String(ruleDoc.data()?.text || "").trim())
            .filter(Boolean),
        );
      },
      (error) => {
        console.error("Failed to load existing setup rules", error);
        setExistingRules([]);
      },
    );
  }, [selectedServerId]);

  const saveCompletion = async (mode: "finish" | "skip") => {
    if (!selectedServerId) return;
    if (mode === "finish" && !setup.isAllDone) {
      setActiveStep(firstIncompleteStep(setup));
      toast.error("Complete the remaining setup items before finishing.");
      return;
    }

    setCompleting(mode);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/onboarding/completion`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          completedBy: user?.uid || auth.currentUser?.uid || "unknown",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save setup progress.");
      toast.success(mode === "skip" ? "Setup flow skipped for now." : "First-run setup completed.");
      onCompleted?.();
    } catch (error: any) {
      console.error("Failed to save onboarding completion", error);
      toast.error(error?.message || "Could not save setup progress.");
    } finally {
      setCompleting(null);
    }
  };

  const closeFlow = () => {
    if (onCompleted) {
      onCompleted();
      return;
    }
    navigate("/dashboard");
  };

  const handleFinishSetup = () => {
    if (!selectedServerId) {
      toast.error("Select a server before finishing setup.");
      return;
    }
    if (!setup.isAllDone) {
      setActiveStep(firstIncompleteStep(setup));
      toast.error("Complete the remaining setup items before finishing.");
      return;
    }
    setCompleted(true);
  };

  const applyPreset = async (presetId: PresetId) => {
    if (!selectedServerId) return;
    const preset = presets[presetId];

    if (isPro && preset.payload.autoDelete && botPermissions && !botPermissions.ManageMessages) {
      toast.error("SentinL needs Manage Messages before Strict can enable auto-delete.");
      setActiveStep(1);
      return;
    }

    setSavingPreset(presetId);
    try {
      const freeSafePayload = {
        confidenceThreshold: preset.payload.confidenceThreshold,
      };
      const payload: any = { ...freeSafePayload };

      if (isPro) {
        payload.autoDelete = preset.payload.autoDelete;
        payload.useContext = preset.payload.useContext;
        payload.enableDualModel = preset.payload.enableDualModel;
      }

      await setDoc(doc(db, "servers", selectedServerId), payload, { merge: true });
      setSelectedPresetId(presetId);
      toast.success(`${preset.title} moderation style applied.`);
      setActiveStep(4);
    } catch (error: any) {
      if (isPro && isPermissionDenied(error)) {
        try {
          await setDoc(
            doc(db, "servers", selectedServerId),
            { confidenceThreshold: preset.payload.confidenceThreshold },
            { merge: true },
          );
          setSelectedPresetId(presetId);
          toast.warning(
            `${preset.title} sensitivity applied. Pro-only style options could not be saved for this server.`,
          );
          setActiveStep(4);
          return;
        } catch (fallbackError: any) {
          console.error("Failed to apply fallback moderation preset", fallbackError);
        }
      }
      console.error("Failed to apply moderation preset", error);
      toast.error(error?.message || "Could not apply moderation style.");
    } finally {
      setSavingPreset(null);
    }
  };

  const saveServerType = async (preset: ServerRulePreset) => {
    if (!selectedServerId) return;
    setSelectedServerTypeId(preset.id);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/server-type`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ presetId: preset.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save server type.");
      toast.success(`${preset.shortLabel} preset selected.`);
    } catch (error: any) {
      console.error("Failed to save server type", error);
      toast.error(error?.message || "Could not save server type.");
    }
  };

  const addPresetRule = async (ruleId: string, ruleText: string) => {
    if (!selectedServerId) return;
    const normalizedRule = ruleText.trim().toLowerCase();
    if (existingRuleSet.has(normalizedRule) || addingRules[ruleId] === "added") {
      setAddingRules((prev) => ({ ...prev, [ruleId]: "added" }));
      return;
    }

    setAddingRules((prev) => ({ ...prev, [ruleId]: "loading" }));
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/rules/add", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serverId: selectedServerId, ruleText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add rule.");
      setAddingRules((prev) => ({ ...prev, [ruleId]: "added" }));
      toast.success(data.duplicate ? "Rule already added." : "Rule added.");
    } catch (error: any) {
      console.error("Failed to add preset rule", error);
      setAddingRules((prev) => ({ ...prev, [ruleId]: "idle" }));
      toast.error(error?.message || "Could not add rule.");
    }
  };

  const addAllPresetRules = async (preset: ServerRulePreset) => {
    setAddingAllRules(true);
    try {
      for (const [index, rule] of preset.rules.entries()) {
        const ruleId = `${preset.id}-${index}`;
        if (existingRuleSet.has(rule.trim().toLowerCase()) || addingRules[ruleId] === "added") continue;
        await addPresetRule(ruleId, rule);
      }
      setActiveStep(3);
    } finally {
      setAddingAllRules(false);
    }
  };

  const runTestScan = async () => {
    if (!selectedServerId) return;
    setTesting(true);
    setTestResults([]);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/moderation/test-scan`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "first_run_setup" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Test scan failed.");
      setTestResults(Array.isArray(data.results) ? data.results : []);
      toast.success("Test scan completed.");
    } catch (error: any) {
      console.error("Test scan failed", error);
      toast.error(error?.message || "Could not run test scan.");
    } finally {
      setTesting(false);
    }
  };

  const inviteUrl = getDiscordInviteUrl();
  const currentStep = steps[activeStep];
  const CurrentIcon = currentStep.icon;

  return (
    <section className="fixed inset-y-0 left-0 right-0 z-[45] overflow-y-auto bg-primary text-white md:left-72 md:overflow-hidden">
      <div className="pointer-events-none fixed inset-y-0 left-0 right-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.14),transparent_26%),linear-gradient(135deg,rgba(0,0,0,0.12),transparent_44%)] md:left-72" />
      <div className="relative grid min-h-screen grid-cols-1 md:h-screen md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        {completed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="col-span-full flex min-h-screen items-center justify-center px-6 py-12 text-center"
          >
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.18, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
              >
                <Logo className="mx-auto mb-6 h-20 w-20 text-white" stroke="currentColor" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36, ...driftInTransition }}
                className="text-[10px] font-black uppercase tracking-[0.28em] text-white/70"
              >
                Setup complete
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55, duration: 0.72, ease: [0.16, 1, 0.3, 1] }}
                className="mt-3 text-4xl font-black tracking-tight text-white sm:text-6xl"
              >
                SentinL is ready for {serverName}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.82, ...driftInTransition }}
                className="mx-auto mt-5 max-w-xl text-sm font-semibold leading-relaxed text-white/78 sm:text-base"
              >
                Your dashboard is ready. SentinL will keep checking setup health and warn you if something important changes later.
              </motion.p>
              <motion.button
                type="button"
                onClick={() => saveCompletion("finish")}
                disabled={completing !== null}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.04, ...driftInTransition }}
                className={`${primaryButtonClass} mt-7`}
              >
                {completing === "finish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Go to Dashboard
              </motion.button>
            </div>
          </motion.div>
        ) : (
        <>
        <aside className="flex flex-col border-b border-white/20 px-6 py-5 md:h-screen md:justify-center md:border-b-0 md:border-r md:px-7 md:py-8 xl:px-8">
          <div className="md:-mt-4">
            <button
              type="button"
              onClick={closeFlow}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Dashboard
            </button>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/70">
              First-run setup
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-white xl:text-3xl">
              Setup SentinL for {serverName}
            </h1>
            <div className="mt-4 flex items-end gap-2 text-white">
              <span className="text-2xl font-black">{setup.completedCount}/{setup.totalCount}</span>
              <span className="pb-1 text-[10px] font-black uppercase tracking-widest text-white/65">
                Setup health
              </span>
            </div>
          </div>

          <nav className="mt-7 grid gap-1 sm:grid-cols-2 md:grid-cols-1" aria-label="Setup steps">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const complete = setupStepCompletion(setup, index);
              const selected = activeStep === index;
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`group flex items-center gap-3 px-0 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    selected
                      ? "text-white"
                      : "text-white/58 hover:text-white"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black ${
                    selected ? "border-white bg-white text-primary" : complete ? "border-white text-white" : "border-white/40 text-white/65"
                  }`}>
                    {index + 1}
                  </span>
                  <span className="hidden sm:flex">
                    <StepIcon className="w-4 h-4 shrink-0" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black uppercase tracking-wide">{step.title}</span>
                    <span className={`mt-1 block text-[10px] font-bold ${selected ? "text-white/80" : "text-white/48"}`}>
                      {complete ? "Ready" : "Needs attention"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-h-[calc(100vh-196px)] items-center justify-start px-6 py-8 md:h-screen md:min-h-0 md:px-8 md:py-8 lg:px-10 xl:px-14">
          <div className="w-full max-w-4xl">
          <div className="flex items-center gap-4">
            <div className="shrink-0 text-white">
              <CurrentIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/65">
                Step {activeStep + 1} of {steps.length}
              </p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">{currentStep.title}</h2>
            </div>
          </div>

          <motion.div
            key={activeStep}
            initial={{ opacity: 0, x: 44 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7"
          >
          {activeStep === 0 && (
            <div className="space-y-6">
              <div className="grid gap-4">
                <SetupLine delay={0.06} title="Discord account" done={setup.connectComplete} text={setup.connectComplete ? "Connected to your dashboard account." : "Connect Discord so SentinL can identify your servers."} />
                <SetupLine delay={0.18} title="Server claimed" done={setup.claimComplete} text={setup.claimComplete ? "This server is linked to your dashboard." : "Claim this server in Settings."} />
                <SetupLine delay={0.30} title="Bot invited" done={setup.inviteComplete} text={setup.inviteComplete ? "SentinL is in this server." : "Invite the bot to this server."} />
                <SetupLine delay={0.42} title="Bot activated" done={setup.activateComplete} text={setup.activateComplete ? "SentinL is active for this server." : "Turn on the server activation switch so SentinL can moderate."} />
              </div>
              <div className="flex flex-wrap gap-3 pt-1">
                {!setup.connectComplete && (
                  <Link to="/connect" className={primaryButtonClass}>
                    Connect Discord <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                {!setup.claimComplete && (
                  <Link to="/settings#general/setup-claim-server" className={secondaryButtonClass}>
                    Claim Server
                  </Link>
                )}
                {!setup.inviteComplete && inviteUrl && (
                  <a href={inviteUrl} target="_blank" rel="noreferrer" className={primaryButtonClass}>
                    Invite Bot <ArrowRight className="w-4 h-4" />
                  </a>
                )}
                {!setup.activateComplete && (
                  <Link to="/settings#general/setup-activate-bot" className={secondaryButtonClass}>
                    Activate Bot
                  </Link>
                )}
                <button type="button" onClick={() => setActiveStep(1)} className={secondaryButtonClass}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 1 && (
            <div className="space-y-5">
              <div className="grid gap-x-8 gap-y-3 xl:grid-cols-2">
                {permissionRows.map((permission, index) => {
                  const done = !!botPermissions?.[permission.key];
                  return (
                    <SetupLine key={permission.key} delay={0.06 + index * 0.1} title={permission.title} done={done} text={permission.description} />
                  );
                })}
                <SetupLine
                  title="Message Content Intent"
                  done={setup.intentsComplete}
                  delay={0.66}
                  text="Discord blocks bots from reading message text unless this is enabled. Without it, SentinL can be online but unable to moderate normal messages."
                />
                <SetupLine
                  title="Log channel"
                  done={setup.logComplete}
                  delay={0.78}
                  text={setup.logComplete ? "A moderation log channel is selected." : "Choose where SentinL should post moderation alerts and setup notices."}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                {intentsWarning && (
                  <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className={primaryButtonClass}>
                    Open Discord Developer Portal
                  </a>
                )}
                {!setup.logComplete && (
                  <Link to="/settings#general/setup-log-channel" className={secondaryButtonClass}>
                    Set Log Channel
                  </Link>
                )}
                <button type="button" onClick={() => setActiveStep(2)} className={secondaryButtonClass}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-6">
              <ServerRulePresetPicker
                tone="orange"
                layout="split"
                selectedPresetId={setup.serverTypePresetId || selectedServerTypeId}
                onSelectPreset={saveServerType}
                existingRules={existingRules}
                addingRules={addingRules}
                onAddRule={addPresetRule}
                onAddAllRules={addAllPresetRules}
                addAllLoading={addingAllRules}
              />
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setActiveStep(3)} className={secondaryButtonClass}>
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-6">
              <div className="grid gap-4">
                <SetupLine
                  title="Custom rule or keyword"
                  done={setup.rulesComplete}
                  delay={0.08}
                  text={setup.rulesComplete ? "At least one rule or keyword is configured." : "Add at least one custom rule or keyword so SentinL knows your community boundaries."}
                />
              </div>
              {!setup.rulesComplete && (
                <Link to="/settings#dna" className={secondaryButtonClass}>
                  Add Rules
                </Link>
              )}
              <div className="grid gap-5 md:grid-cols-3">
                {presetIds.map((presetId, index) => {
                  const preset = presets[presetId];
                  const selected = selectedPresetId === presetId;
                  return (
                    <motion.button
                      key={presetId}
                      type="button"
                      onClick={() => applyPreset(presetId)}
                      disabled={savingPreset !== null}
                      aria-pressed={selected}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.18 + index * 0.12, ...driftInTransition }}
                      className={`border-l-2 py-1.5 pl-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                        selected
                          ? "border-white text-white"
                          : "border-white/35 text-white/72 hover:border-white hover:text-white"
                      } disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-base font-black text-white">{preset.title}</span>
                        {selected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-widest text-primary">
                            <CheckCircle className="h-3 w-3" />
                            Selected
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/62">
                            {preset.label}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-white/72">{preset.description}</p>
                      <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-white">
                        {savingPreset === presetId ? "Applying..." : "Apply preset"}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {!isPro && (
                <p className="max-w-2xl text-xs font-semibold leading-relaxed text-white/72">
                  Free servers can use the core sensitivity style. Pro-only options like context reading, auto-delete, and extra review stay locked until upgrade.
                </p>
              )}
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-start gap-4">
                  {setup.testBotDone ? (
                    <CheckCircle className="w-5 h-5 text-white shrink-0 mt-0.5" />
                  ) : (
                    <PlayCircle className="w-5 h-5 text-white shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="text-base font-black text-white">Dry-run moderation test</h4>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/72">
                      {setup.testBotDone
                        ? "The setup test has been completed for this server."
                        : "This checks sample messages without deleting anything, timing anyone out, sending DMs, writing strikes, or creating real moderation actions."}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={runTestScan} disabled={testing} className={`${primaryButtonClass} mt-4`}>
                  {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Run Test Scan
                </button>
              </div>

              {testResults.length > 0 && (
                <div className="grid gap-3 xl:grid-cols-2">
                  {testResults.map((result, index) => (
                    <motion.div
                      key={`${result.label}-${index}`}
                      initial={{ opacity: 0, x: 34 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.14, ...driftInTransition }}
                      className="flex items-start justify-between gap-5 border-b border-white/18 pb-3"
                    >
                      <div>
                        <div className="text-sm font-black text-white">{result.label || "Sample message"}</div>
                        <div className="mt-1 text-xs font-semibold text-white/68">{result.reason || "SentinL checked this sample safely without taking action."}</div>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/78 whitespace-nowrap">
                        {result.outcome || "Checked"}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={handleFinishSetup} disabled={completing !== null} className={primaryButtonClass}>
                  <Shield className="w-4 h-4" />
                  Finish Setup
                </button>
                <button type="button" onClick={() => saveCompletion("skip")} disabled={completing !== null} className={secondaryButtonClass}>
                  Skip for now
                </button>
              </div>
            </div>
          )}
          </motion.div>
          </div>
        </main>
      </>
      )}
      </div>
    </section>
  );
}

type SetupLineProps = React.Attributes & {
  title: string;
  done: boolean;
  text: string;
  delay?: number;
};

function SetupLine({ title, done, text, delay = 0 }: SetupLineProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, ...driftInTransition }}
      className="flex items-start gap-3 border-b border-white/18 pb-3"
    >
      <div className="mt-0.5">{statusIcon(done)}</div>
      <div>
        <div className="text-sm font-black text-white">{title}</div>
        <div className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-white/70">{text}</div>
      </div>
    </motion.div>
  );
}
