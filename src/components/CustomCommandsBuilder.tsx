import React, { useState, useEffect } from "react";
import { EmptyState, CompactEmptyState } from "./EmptyState";
import { motion, AnimatePresence } from "motion/react";
import { useServer } from "../context/ServerContext";
import { Select } from "./Select";
import { db, auth } from "../firebase";
import { ProGate } from "./ProGate";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
} from "firebase/firestore";
import {
  Plus,
  Trash2,
  Save,
  MessageSquare,
  UserPlus,
  UserMinus,
  Mail,
  ChevronDown,
  ChevronUp,
  Settings,
  AlertCircle,
  RefreshCw,
  Info,
  Check,
  Lock,
} from "lucide-react";
import { useSaveState } from "../hooks/useSaveState";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { PermissionsWarning } from "./PermissionsWarning";
import { RoleSelector } from "./RoleSelector";

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

type ActionType = "send_message" | "add_role" | "remove_role" | "dm_user";

interface CommandAction {
  id: string;
  type: ActionType;
  content?: string;
  isEmbed?: boolean;
  embedTitle?: string;
  embedColor?: string;
  roleId?: string;
}

interface CustomCommand {
  id: string;
  name: string;
  description: string;
  actions: CommandAction[];
  isLocked?: boolean;
  permission?: "everyone" | "moderator";
  requiresUser?: boolean;
}

export default function CustomCommandsBuilder() {
  const { selectedServerId, tier, isBetaTester, isTrial , isPro} = useServer();
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [commandToDelete, setCommandToDelete] = useState<CustomCommand | null>(null);


  useEffect(() => {
    if (selectedServerId) {
      loadCommands();
      
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
        });
      }
    }
  }, [selectedServerId]);

  const loadCommands = async () => {
    if (!selectedServerId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, `servers/${selectedServerId}/custom_commands`),
      );
      const snap = await getDocs(q);
      const cmds = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as CustomCommand[];
      setCommands(cmds);
      if (cmds.length > 0) setSelectedId(cmds[0].id);
    } catch (e: any) {
      console.error("CustomCommandsBuilder loadCommands error:", e);
      handleFirestoreError(
        e,
        OperationType.LIST,
        `servers/${selectedServerId}/custom_commands`,
      );
    }
    setLoading(false);
  };

  const handleCreate = () => {
    const newCmd: CustomCommand = {
      id: uuidv4(),
      name: "newcommand",
      description: "A new custom command",
      actions: [],
    };
    setCommands((prev) => [...prev, newCmd]);
    setSelectedId(newCmd.id);
  };

  const handleUpdate = (id: string, updates: Partial<CustomCommand>) => {
    setCommands((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const handleDelete = async (id: string) => {
    if (!selectedServerId) return;
    try {
      await deleteDoc(
        doc(db, `servers/${selectedServerId}/custom_commands`, id),
      );
      setCommands((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e: any) {
      console.error("CustomCommandsBuilder handleDelete error:", e);
      handleFirestoreError(
        e,
        OperationType.DELETE,
        `servers/${selectedServerId}/custom_commands/${id}`,
      );
      toast(`Error deleting: ${e.message}`);
    }
  };

  const selectedCommand = commands.find((c) => c.id === selectedId);
  const { isSaved, setIsSaved, hasChanges, resetSaveState } = useSaveState(selectedCommand);

  useEffect(() => {
     resetSaveState(selectedCommand);
  }, [selectedId]); // Reset baseline when switching commands

  const addAction = (type: ActionType) => {
    if (!selectedCommand) return;
    handleUpdate(selectedCommand.id, {
      actions: [
        ...selectedCommand.actions,
        { id: uuidv4(), type, content: "", isEmbed: false },
      ],
    });
  };

  const updateAction = (actionId: string, updates: Partial<CommandAction>) => {
    if (!selectedCommand) return;
    handleUpdate(selectedCommand.id, {
      actions: selectedCommand.actions.map((a) =>
        a.id === actionId ? { ...a, ...updates } : a,
      ),
    });
  };

  const removeAction = (actionId: string) => {
    if (!selectedCommand) return;
    handleUpdate(selectedCommand.id, {
      actions: selectedCommand.actions.filter((a) => a.id !== actionId),
    });
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    if (!selectedCommand) return;
    const newActions = [...selectedCommand.actions];
    if (index + direction < 0 || index + direction >= newActions.length) return;
    const temp = newActions[index];
    newActions[index] = newActions[index + direction];
    newActions[index + direction] = temp;
    handleUpdate(selectedCommand.id, { actions: newActions });
  };

  const saveSelected = async () => {
    if (!selectedServerId || !selectedCommand) return;
    
    // Validate command name regex and length
    if (!/^[a-z0-9_-]{1,32}$/.test(selectedCommand.name)) {
      toast.error(
        "Command names must be 1-32 characters and only contain lowercase letters, numbers, dashes, and underscores.",
      );
      return;
    }

    // Validate command name uniqueness
    const nameIsUnique = !commands.some(
      (cmd) => cmd.id !== selectedCommand.id && cmd.name === selectedCommand.name
    );
    if (!nameIsUnique) {
      toast.error("A command with this name already exists. Please choose a unique name.");
      return;
    }

    // Validate actions
    if (selectedCommand.actions.length === 0) {
      toast.error("Commands must have at least one action.");
      return;
    }

    for (const action of selectedCommand.actions) {
      if (action.type === "add_role" || action.type === "remove_role") {
        if (!action.roleId || !/^\d+$/.test(action.roleId)) {
          toast.error(`Invalid Role ID for action "${action.type.replace("_", " ")}". Must be a valid numeric Discord ID.`);
          return;
        }
      } else if (action.type === "send_message" || action.type === "dm_user") {
        if (!action.content?.trim() && !(action.isEmbed && action.embedTitle?.trim())) {
          toast.error(`Message actions must have some content or an embed title.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await setDoc(
        doc(
          db,
          `servers/${selectedServerId}/custom_commands`,
          selectedCommand.id,
        ),
        selectedCommand,
      );
      setIsSaved(true);
      toast.success("Command saved successfully.");
    } catch (e: any) {
      console.error("CustomCommandsBuilder saveSelected error:", e);
      handleFirestoreError(
        e,
        OperationType.WRITE,
        `servers/${selectedServerId}/custom_commands`,
      );
      toast.error(`Error saving: ${e.message}`);
    }
    setSaving(false);
  };

  const syncCommands = async () => {
    if (!selectedServerId) return;
    setSyncing(true);
    setSyncMessage("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(
        `/api/guilds/${selectedServerId}/sync_custom_commands`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await res.json();
      if (data.success) {
        setSyncMessage("Commands are live in Discord.");
        setTimeout(() => setSyncMessage(""), 5000);
      } else {
        setSyncMessage(`Error: ${data?.error}`);
      }
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    }
    setSyncing(false);
  };

  return (
    <>
      <div className={`flex flex-col gap-8`}>
        {selectedServerId && (
          <PermissionsWarning 
            serverId={selectedServerId} 
            required={["SendMessages"]} 
          />
        )}
        <ProGate isPro={isPro} featureName="Custom Commands" featureDescription="Build powerful custom slash commands for your server" className="w-full">
          <div className="flex flex-col gap-8 transition-all duration-300 ease-in-out w-full">
            <section className="border-b border-outline-variant/20 pb-6">
              <div className="max-w-3xl">
                <h2 className="text-3xl font-black tracking-tight text-on-surface sm:text-4xl">
                  Custom Commands
                </h2>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-text-secondary">
                  Build Discord slash commands by setting the trigger first, then arranging what SentinL should do when members use it.
                </p>
              </div>
            </section>

          <div className="flex flex-col lg:flex-row gap-8 w-full">
            {/* Sidebar */}
      <div className="w-full lg:w-[34%] flex flex-col">
          <div className="overflow-hidden rounded-[2.25rem] border border-white/50 bg-white/80 shadow-xl shadow-primary/5 backdrop-blur-md">
            <div className="flex items-start justify-between gap-4 bg-primary px-6 py-5 text-white">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black tracking-tight text-white">Command Roster</h2>
                  <span className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                    {isPro ? "PRO ACCESS" : "PRO LOCKED"}
                  </span>
                </div>
                <p className="mt-1 max-w-[240px] text-xs font-semibold leading-snug text-white/75">
                  {commands.length} saved. Select one to edit.
                </p>
              </div>
              <button
                  onClick={handleCreate}
                  disabled={!isPro}
                  aria-label="Create custom command"
                  className="w-11 h-11 shrink-0 rounded-2xl bg-white text-primary flex items-center justify-center hover:-translate-y-0.5 active:scale-95 transition-all shadow-lg shadow-black/10 disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
            </div>

          <div className="p-4 flex flex-col gap-2 min-h-[430px]">
            {loading ? (
              <div className="text-center p-8 text-text-secondary animate-pulse">
                Loading...
              </div>
            ) : commands.length === 0 ? (
              <CompactEmptyState 
                title="No commands yet."
                description="Click + to create your first command."
              />
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className={`w-full rounded-2xl transition-all duration-300 group flex items-center pr-2 border ${
                    selectedId === cmd.id
                      ? "bg-primary text-white shadow-xl shadow-primary/20 border-primary"
                      : "bg-white text-on-surface hover:bg-primary/5 border-outline-variant/20 hover:border-primary/25"
                  }`}
                >
                  <button
                    onClick={() => setSelectedId(cmd.id)}
                    className="flex-1 text-left px-5 py-4 font-bold flex justify-between items-center rounded-2xl bg-transparent outline-none"
                  >
                    <div>
                      <div className="text-[13px] tracking-wide">/{cmd.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md uppercase tracking-wider font-extrabold flex-shrink-0 ${selectedId === cmd.id ? "bg-white/20 text-white" : "bg-outline-variant/30 text-text-secondary"}`}
                        >
                          {cmd.permission === "moderator" ? "MODS" : "ALL"}
                        </span>
                        <div
                          className={`text-[10px] font-medium opacity-70 truncate max-w-[150px]`}
                        >
                          {cmd.description}
                        </div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommandToDelete(cmd);
                    }}
                    disabled={saving || !isPro}
                    className={`p-2 rounded-xl transition-all disabled:opacity-50 shrink-0 ${
                      selectedId === cmd.id 
                        ? "text-white/70 hover:text-white hover:bg-white/20" 
                        : "text-text-secondary/50 hover:text-danger hover:bg-danger/10"
                    }`}
                    title="Delete Command"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
          </div>
        </div>

        {/* Editor */}
        <div className="w-full lg:w-[66%] flex flex-col">
          <div className="overflow-hidden rounded-[2.25rem] border border-white/60 bg-white/85 shadow-xl shadow-primary/5 backdrop-blur-md">
            <div className="flex flex-col gap-4 border-b border-primary/20 bg-primary px-6 py-5 text-white xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-black text-white flex items-center">
                  Command Builder
                  <Tooltip text="Save commands here first, then publish them to Discord so members can use them." />
                </h2>
                <p className="mt-1 whitespace-nowrap text-xs font-semibold text-white/80">
                  Define the command first, then build the exact sequence SentinL should run.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {syncMessage && (
                  <span className="rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-bold text-white animate-pulse">
                    {syncMessage}
                  </span>
                )}
                <button
                  onClick={syncCommands}
                  disabled={syncing || !isPro}
                  className="inline-flex h-11 min-w-[170px] items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/15 px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:text-primary hover:shadow-lg hover:shadow-black/10 active:scale-95 disabled:translate-y-0 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                  />
                  Publish to Discord
                </button>
                <motion.button animate={isSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={hasChanges ? { scale: 0.95 } : undefined}
                  onClick={saveSelected}
                  disabled={!selectedId || saving || !isPro || (!hasChanges && !isSaved)}
                  className={`inline-flex h-11 min-w-[170px] items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 disabled:hover:scale-100 ${
                    isSaved
                      ? "bg-emerald-500 text-white shadow-black/10 hover:bg-emerald-600"
                      : !hasChanges
                        ? "bg-white/20 text-white/70 shadow-none cursor-default border border-white/25"
                        : "bg-white text-primary shadow-black/10 hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-xl"
                  } ${saving ? "opacity-50 cursor-wait" : ""}`}
                >
                  {saving ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : isSaved ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {saving ? "Saving..." : isSaved ? "Saved" : "Save Changes"}
                </motion.button>
              </div>
            </div>

          {!selectedCommand ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-secondary min-h-[430px] p-10 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/10 bg-primary/10 text-primary">
                <Settings className="w-8 h-8" />
              </div>
              <p className="text-sm font-bold text-on-surface">Select or create a command</p>
              <p className="mt-2 max-w-sm text-xs font-semibold leading-relaxed text-text-secondary">
                Choose a command from the roster or press the plus button to start building a new slash command.
              </p>
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-6">
              {/* Info Fields */}
              <section className="relative border-b-2 border-outline-variant/30 pb-6 pl-11">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-black text-white shadow-lg shadow-primary/20">
                  1
                </div>
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-3">
                      Command Definition
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-text-secondary">
                      This is what Discord users see before the command runs.
                    </p>
                  </div>
                  <span className="hidden rounded-full border border-primary/15 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary sm:inline-flex">
                    /{selectedCommand.name || "command"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                  <div>
                    <label className="flex text-xs font-bold text-on-surface mb-2 tracking-wide uppercase items-center">
                      Command Name
                      <Tooltip text="The word members type after /. Keep it short and do not use spaces." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-text-secondary">
                        /
                      </span>
                      <input
                        type="text"
                        disabled={!isPro}
                        value={selectedCommand.name}
                        onChange={(e) =>
                          handleUpdate(selectedCommand.id, {
                            name: e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_-]/g, ""),
                          })
                        }
                        className="w-full rounded-2xl border border-outline-variant/25 bg-white pl-8 pr-4 py-2.5 text-sm font-bold text-on-surface shadow-sm transition-all placeholder:text-text-secondary/45 hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                        placeholder="e.g. verified"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex text-xs font-bold text-on-surface mb-2 tracking-wide uppercase items-center">
                      Description
                      <Tooltip text="The short helper text members see in Discord before they run the command." />
                    </label>
                    <input
                      type="text"
                      disabled={!isPro}
                      value={selectedCommand.description}
                      onChange={(e) =>
                        handleUpdate(selectedCommand.id, {
                          description: e.target.value,
                        })
                      }
                      className="w-full rounded-2xl border border-outline-variant/25 bg-white px-4 py-2.5 text-sm font-medium text-on-surface shadow-sm transition-all placeholder:text-text-secondary/45 hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                      placeholder="What does this command do?"
                    />
                  </div>
                  <div>
                    <label className="flex text-xs font-bold text-on-surface mb-2 tracking-wide uppercase items-center">
                      Permissions
                      <Tooltip text="Choose who can use this command." />
                    </label>
                    <Select
                      disabled={!isPro}
                      value={selectedCommand.permission || "everyone"}
                      onChange={(val) =>
                        handleUpdate(selectedCommand.id, {
                          permission: val as "everyone" | "moderator",
                        })
                      }
                      options={[
                        { value: "everyone", label: "Everyone" },
                        { value: "moderator", label: "Moderators Only" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="flex text-xs font-bold text-on-surface mb-2 tracking-wide uppercase items-center">
                      Target User
                      <Tooltip text="Turn this on when the command should ask staff to pick a member first." />
                    </label>
                    <Select
                      disabled={!isPro}
                      value={selectedCommand.requiresUser ? "yes" : "no"}
                      onChange={(val) =>
                        handleUpdate(selectedCommand.id, {
                          requiresUser: val === "yes",
                        })
                      }
                      options={[
                        { value: "no", label: "No, applies to self" },
                        { value: "yes", label: "Yes, select a user" }
                      ]}
                    />
                  </div>
                </div>
              </section>

              {/* Actions Engine */}
              <section className="relative pl-11">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-black text-white shadow-lg shadow-primary/20">
                  2
                </div>
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary flex items-center gap-3">
                      Execution Sequence
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-text-secondary">
                      SentinL runs these actions from top to bottom when the slash command is used.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-outline-variant/30 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-text-secondary">
                    {selectedCommand.actions.length} actions
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  <AnimatePresence>
                    {selectedCommand.actions.map((act, index) => (
                      <motion.div
                        key={act.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative overflow-hidden rounded-[1.5rem] border border-outline-variant/20 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-primary/10 group"
                      >
                        <div className="flex">
                          {/* Reorder controls */}
                          <div className="flex w-16 flex-col items-center justify-center gap-1 border-r border-outline-variant/15 bg-primary/5 py-4 opacity-100 transition-opacity">
                            <button
                              onClick={() => moveAction(index, -1)}
                              disabled={!isPro}
                              className="p-1 hover:bg-primary/10 rounded-lg text-text-secondary hover:text-primary disabled:opacity-50"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <div className="w-7 h-7 flex items-center justify-center rounded-xl bg-primary text-white text-[10px] font-black shadow-sm shadow-primary/20">
                              {index + 1}
                            </div>
                            <button
                              onClick={() => moveAction(index, 1)}
                              disabled={!isPro}
                              className="p-1 hover:bg-primary/10 rounded-lg text-text-secondary hover:text-primary disabled:opacity-50"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex-1 flex flex-col gap-4 p-5">
                            <div className="flex justify-between items-center">
                              <div className="px-3 py-1.5 bg-primary/10 rounded-xl text-xs font-black uppercase tracking-wider text-primary border border-primary/15 flex gap-2 items-center">
                                {act.type === "send_message" && (
                                  <MessageSquare className="w-3.5 h-3.5" />
                                )}
                                {act.type === "add_role" && (
                                  <UserPlus className="w-3.5 h-3.5" />
                                )}
                                {act.type === "remove_role" && (
                                  <UserMinus className="w-3.5 h-3.5" />
                                )}
                                {act.type === "dm_user" && (
                                  <Mail className="w-3.5 h-3.5" />
                                )}
                                {act.type.replace("_", " ")}
                              </div>
                              <button
                                onClick={() => removeAction(act.id)}
                                disabled={!isPro}
                                className="p-2 text-text-secondary hover:bg-danger/10 hover:text-danger rounded-xl transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Specific Config based on type */}
                            {(act.type === "send_message" ||
                              act.type === "dm_user") && (
                              <div className="flex flex-col gap-3 mt-2">
                                <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
                                  <input
                                    type="checkbox"
                                    disabled={!isPro}
                                    checked={act.isEmbed}
                                    onChange={(e) =>
                                      updateAction(act.id, {
                                        isEmbed: e.target.checked,
                                      })
                                    }
                                    className="rounded text-orange-500 focus:ring-orange-500 disabled:opacity-50 border-outline-variant"
                                  />
                                  Use Rich Embed Display
                                  <Tooltip text="Send this as a styled Discord message instead of plain text." />
                                </label>
                                {act.isEmbed && (
                                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
                                    <input
                                      type="text"
                                      disabled={!isPro}
                                      placeholder="Embed Title"
                                      value={act.embedTitle || ""}
                                      onChange={(e) =>
                                        updateAction(act.id, {
                                          embedTitle: e.target.value,
                                        })
                                      }
                                      className="rounded-2xl border border-outline-variant/25 bg-white px-4 py-3 text-sm font-semibold text-on-surface shadow-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                                    />
                                    <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container/25 px-3">
                                      <input
                                        type="color"
                                        disabled={!isPro}
                                        value={act.embedColor || "#6b46c1"}
                                        onChange={(e) =>
                                          updateAction(act.id, {
                                            embedColor: e.target.value,
                                          })
                                        }
                                        className="w-10 h-10 rounded-xl border-0 bg-transparent cursor-pointer disabled:opacity-50"
                                      />
                                      <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">
                                        Accent
                                      </span>
                                    </div>
                                  </div>
                                )}
                                <textarea
                                  disabled={!isPro}
                                  value={act.content || ""}
                                  onChange={(e) => {
                                    updateAction(act.id, {
                                      content: e.target.value,
                                    });
                                    e.target.style.height = "auto";
                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                  }}
                                  className="w-full rounded-2xl border border-outline-variant/25 bg-white px-4 py-3 text-sm font-medium text-on-surface shadow-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 min-h-[100px] max-h-[300px] resize-none overflow-y-auto disabled:opacity-50 custom-scrollbar"
                                  placeholder="Message payload content... Supports variables like {user_mentions}"
                                ></textarea>
                              </div>
                            )}

                            {(act.type === "add_role" ||
                              act.type === "remove_role") && (
                              <div className="mt-2">
                                <label className="flex text-xs font-bold text-on-surface mb-2 tracking-wide uppercase items-center">
                                  Target Discord Role
                                </label>
                                <RoleSelector
                                  roles={discordRoles}
                                  disablePositionCheck={true}
                                  value={act.roleId || ""}
                                  onChange={(roleId) =>
                                    updateAction(act.id, {
                                      roleId: roleId,
                                    })
                                  }
                                  placeholder="Select target role..."
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  <div className="mt-5 border-t-2 border-outline-variant/30 pt-5">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-text-secondary">
                      Add the next action
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => addAction("send_message")}
                      disabled={!isPro}
                      className="flex flex-col text-left px-4 py-3.5 border border-dashed border-outline-variant/50 hover:border-primary/50 rounded-2xl transition-all duration-300 ease-out bg-white hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15 group disabled:opacity-50"
                    >
                      <div className="text-xs font-black uppercase tracking-widest text-text-secondary group-hover:text-white transition-colors flex gap-2 items-center mb-1.5">
                        <MessageSquare className="w-4 h-4" /> Send Message
                      </div>
                      <span className="text-[11px] font-medium text-text-secondary/80 leading-relaxed group-hover:text-white/85">
                        Posts a public message in the channel where the command
                        was used.
                        <br />
                        <span className="italic opacity-70">
                          Example: "Welcome to the server, @user!"
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => addAction("add_role")}
                      disabled={!isPro}
                      className="flex flex-col text-left px-4 py-3.5 border border-dashed border-outline-variant/50 hover:border-primary/50 rounded-2xl transition-all duration-300 ease-out bg-white hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15 group disabled:opacity-50"
                    >
                      <div className="text-xs font-black uppercase tracking-widest text-text-secondary group-hover:text-white transition-colors flex gap-2 items-center mb-1.5">
                        <UserPlus className="w-4 h-4" /> Assign Role
                      </div>
                      <span className="text-[11px] font-medium text-text-secondary/80 leading-relaxed group-hover:text-white/85">
                        Gives the user a specific role (like VIP or Member).
                        <br />
                        <span className="italic opacity-70">
                          Example: Assigning the 'Verified' role after they
                          accept the rules.
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => addAction("remove_role")}
                      disabled={!isPro}
                      className="flex flex-col text-left px-4 py-3.5 border border-dashed border-outline-variant/50 hover:border-primary/50 rounded-2xl transition-all duration-300 ease-out bg-white hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15 group disabled:opacity-50"
                    >
                      <div className="text-xs font-black uppercase tracking-widest text-text-secondary group-hover:text-white transition-colors flex gap-2 items-center mb-1.5">
                        <UserMinus className="w-4 h-4" /> Remove Role
                      </div>
                      <span className="text-[11px] font-medium text-text-secondary/80 leading-relaxed group-hover:text-white/85">
                        Takes a specific role away from the user.
                        <br />
                        <span className="italic opacity-70">
                          Example: Removing the 'Muted' role to let them chat
                          again.
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => addAction("dm_user")}
                      disabled={!isPro}
                      className="flex flex-col text-left px-4 py-3.5 border border-dashed border-outline-variant/50 hover:border-primary/50 rounded-2xl transition-all duration-300 ease-out bg-white hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15 group disabled:opacity-50"
                    >
                      <div className="text-xs font-black uppercase tracking-widest text-text-secondary group-hover:text-white transition-colors flex gap-2 items-center mb-1.5">
                        <Mail className="w-4 h-4" /> Direct Message
                      </div>
                      <span className="text-[11px] font-medium text-text-secondary/80 leading-relaxed group-hover:text-white/85">
                        Sends a private, one-on-one message to the user that
                        nobody else can see.
                        <br />
                        <span className="italic opacity-70">
                          Example: "You've received a warning for spamming."
                        </span>
                      </span>
                    </button>
                    </div>
                  </div>
                </div>
              </section>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
      </div>
      </ProGate>
    </div>

    <AnimatePresence>
        {commandToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-surface rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
            >
              <div className="flex items-center gap-4 text-danger mb-4">
                <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-on-surface">Delete Command</h3>
                  <p className="text-xs font-semibold text-text-secondary uppercase tracking-widest mt-1">
                    "{commandToDelete.name}"
                  </p>
                </div>
              </div>

              <p className="text-sm font-medium text-text-secondary leading-relaxed mb-8">
                Are you absolutely sure you want to delete this custom command? It will be permanently removed and cannot be recovered.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => setCommandToDelete(null)}
                  className="flex-1 py-3 px-6 rounded-2xl font-bold text-xs uppercase tracking-widest text-text-secondary hover:bg-surface-variant transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDelete(commandToDelete.id);
                    setCommandToDelete(null);
                  }}
                  className="flex-1 py-3 px-6 rounded-2xl font-bold text-xs uppercase tracking-widest bg-danger text-white hover:bg-red-600 shadow-lg shadow-danger/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
