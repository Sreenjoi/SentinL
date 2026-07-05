import React, { useState, useEffect, lazy, Suspense } from "react";
import { EmptyState } from "./EmptyState";
import { useLocation, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  or,
  and,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  Save,
  ShieldAlert,
  Plus,
  Trash2,
  CreditCard,
  Clock,
  Power,
  Loader2,
  Activity,
  ListChecks,
  Settings as SettingsIcon,
  ChevronRight,
  Info,
  Check,
  Wand2,
  Lock,
  Brain,
  X,
  Gavel,
  RefreshCw,
  MessageSquareText,
  UserRoundCog,
  TerminalSquare,
} from "lucide-react";
import { useServer } from "../context/ServerContext";
import { validateKeyword } from "../utils/keywordHelper";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";
import { motion, AnimatePresence } from "motion/react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useSaveState } from "../hooks/useSaveState";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";
import { ServerRulePresetPicker } from "./ServerRulePresetPicker";
import { getDiscordInviteUrl } from "../utils/discordInvite";
import { DOWNSTREAM_EFFECTS, PermissionType } from "./PermissionsWarning";
import { BranchTabs, BrandedPageHeader, HeaderMetaPills } from "./BrandedPageHeader";
import { getPlanDisplayLabel } from "../utils/planDisplay";
import type { ServerRulePreset } from "../data/serverRulePresets";

import { Select } from "./Select";
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

interface Rule {
  id: string;
  text: string;
  createdAt: string;
}

const CommandsGuide = lazy(() => import("./CommandsGuide"));
const CustomCommandsBuilder = lazy(() => import("./CustomCommandsBuilder"));
const RolesManager = lazy(() => import("./RolesManager"));
import { toast } from "sonner";

export default function BotSettings() {
  const [user] = useAuthState(auth);
  const {
    selectedServerId,
    tier,
    isBetaTester,
    isTrial,
    loading: serverLoading,
    discordProfile,
    authorizedServers,
    activeServerIds,
    activeQuotaCount,
    isServerActiveGlobally,
    serverClaimedBy,
    isSharedServer,
    botGuilds,
    botPresenceError,
    botPermissions,
    maxSlots,
    refreshAccess,
    isPro,
    serverEntitlementExpiry,
    serverEntitlementStatus,
  } = useServer();

  const [optimisticActive, setOptimisticActive] = useState<boolean | null>(
    null,
  );

  const isCurrentlyActiveGlobally = isServerActiveGlobally;
  const isCurrentlyActiveInProfile = activeServerIds.includes(
    selectedServerId || "",
  );
  const isCurrentlyActive =
    optimisticActive !== null ? optimisticActive : isServerActiveGlobally;
  const botIsPresent =
    !!selectedServerId &&
    (botGuilds.includes(selectedServerId) || !!botPermissions);
  // isSharedServer: User is a moderator of this server (has it in their Discord server list)
  // but did not claim it. They can view settings and invite the bot but cannot claim or unclaim.

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [settings, setSettings] = useState<{
    modRoleId: string;
    logChannelId: string;
    lastCommandSync: string;
    language: string;
    keywords: string[];
    autoDeleteOnKeywordMatch: boolean;
    confidenceThreshold: number;
    autoDelete: boolean;
    useContext: boolean;
    healthWidget?: {
      enabled: boolean;
      channelId: string;
      messageId?: string;
      lastScore?: string;
      lastUpdated?: string;
    };
  }>({
    modRoleId: "",
    logChannelId: "",
    lastCommandSync: "",
    language: "en",
    keywords: [],
    autoDeleteOnKeywordMatch: false,
    confidenceThreshold: 80,
    autoDelete: false,
    useContext: false,
    healthWidget: { enabled: false, channelId: "" },
  });

  const [newKeyword, setNewKeyword] = useState("");
  const { isSaved, setIsSaved, hasChanges, resetSaveState, updateBaseline } =
    useSaveState(settings);
  const [discordRoles, setDiscordRoles] = useState<any[]>([]);
  const [discordChannels, setDiscordChannels] = useState<any[]>([]);

  const languages = [
    { code: "en", name: "English", native: "English" },
    { code: "es", name: "Spanish", native: "Español" },
    { code: "fr", name: "French", native: "Français" },
    { code: "de", name: "German", native: "Deutsch" },
    { code: "hi", name: "Hindi", native: "हिन्दी" },
    { code: "ja", name: "Japanese", native: "日本語" },
    { code: "pt", name: "Portuguese", native: "Português" },
    { code: "ru", name: "Russian", native: "Русский" },
    { code: "ar", name: "Arabic", native: "العربية" },
    { code: "it", name: "Italian", native: "Italiano" },
    { code: "zh", name: "Chinese", native: "中文" },
    { code: "ko", name: "Korean", native: "한국어" },
    { code: "bn", name: "Bengali", native: "বাংলা" },
  ];

  const [rules, setRules] = useState<Rule[]>([]);
  const [newRule, setNewRule] = useState("");
  const [subscription, setSubscription] = useState<any>(null);
  const [serverGrantExpiry, setServerGrantExpiry] = useState<any>(null);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [showUnclaimConfirm, setShowUnclaimConfirm] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const isOwnedByMe =
    userSubscription?.linkedServerIds?.includes(selectedServerId) ||
    serverClaimedBy === user?.email;

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      added: string[];
      updated: string[];
      removed?: string[];
      failed: { name: string; error: string }[];
    };
  } | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "general" | "dna" | "commands" | "onboarding" | "custom_commands"
  >(() => {
    const hash = window.location.hash.replace("#", "").split("/")[0];
    if (
      ["general", "dna", "commands", "onboarding", "custom_commands"].includes(
        hash,
      )
    ) {
      return hash as any;
    }
    return "general";
  });

  const [dnaTab, setDnaTab] = useState<"rules" | "suggestions">("rules");
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [hasViewedSuggestions, setHasViewedSuggestions] = useState(false);
  const [selectedSuggestionPresetId, setSelectedSuggestionPresetId] = useState("custom");
  const [addingAllPresetRules, setAddingAllPresetRules] = useState(false);
  const [addingRules, setAddingRules] = useState<
    Record<string, "idle" | "loading" | "added">
  >({});

  const toggleSuggestionsReadStatus = async (isRead: boolean) => {
    if (!user || !selectedServerId) return;
    try {
      const latestTs =
        recommendations.length > 0
          ? Math.max(
              ...recommendations.map((r: any) =>
                r.createdAt?.toMillis ? r.createdAt.toMillis() : 0,
              ),
            )
          : 0;

      const docRef = doc(db, `users/${user.uid}/readStatus`, selectedServerId);
      await setDoc(
        docRef,
        {
          isRead,
          ...(isRead && { lastViewedTs: latestTs > 0 ? latestTs : Date.now() }),
        },
        { merge: true },
      );
    } catch (error) {
      console.error("Failed to update read status:", error);
    }
  };

  useEffect(() => {
    if (!user || !selectedServerId) return;
    const unsub = onSnapshot(
      doc(db, `users/${user.uid}/readStatus`, selectedServerId),
      (snapshot) => {
        const data = snapshot.data();
        const dbIsRead = data?.isRead ?? false;

        const latestTs =
          recommendations.length > 0
            ? Math.max(
                ...recommendations.map((r: any) =>
                  r.createdAt?.toMillis ? r.createdAt.toMillis() : 0,
                ),
              )
            : 0;

        const storedTs = data?.lastViewedTs ?? 0;

        if (latestTs > storedTs && recommendations.length > 0) {
          setHasViewedSuggestions(false);
        } else {
          setHasViewedSuggestions(true);
        }
      },
      (error) => console.error("readStatus snap error:", error, `Path: users/${user.uid}/readStatus/${selectedServerId}`)
    );
    return () => unsub();
  }, [user, selectedServerId, recommendations]);

  useEffect(() => {
    if (!selectedServerId) return;

    if (activeTab === "dna" && dnaTab === "suggestions") {
      if (!hasViewedSuggestions) {
        setHasViewedSuggestions(true);
        toggleSuggestionsReadStatus(true);
      }
    }
  }, [activeTab, dnaTab, selectedServerId, user, hasViewedSuggestions]);

  useEffect(() => {
    const hash = location.hash.replace("#", "").split("/")[0];
    if (
      ["general", "dna", "commands", "onboarding", "custom_commands"].includes(
        hash,
      )
    ) {
      setActiveTab(hash as any);
    }
  }, [location.hash]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").split("/")[0];
      if (
        [
          "general",
          "dna",
          "commands",
          "onboarding",
          "custom_commands",
        ].includes(hash)
      ) {
        setActiveTab(hash as any);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!selectedServerId || !isPro) return;
    
    let localRecs: any[] = [];
    let globalRecs: any[] = [];
    
    const updateRecs = () => {
      const allRecs = [...localRecs, ...globalRecs];
      setRecommendations(
        allRecs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      );
    };

    const unsubLocal = onSnapshot(
      query(
        collection(db, "recommendations"),
        where("serverId", "==", selectedServerId),
        where("status", "in", ["pending", "needs_review"])
      ),
      (snap) => {
        localRecs = [];
        snap.forEach((d) => localRecs.push({ id: d.id, ...d.data() }));
        updateRecs();
      },
      (err) => console.error("Local recs error:", err)
    );

    const unsubGlobal = onSnapshot(
      query(
        collection(db, "recommendations"),
        where("serverId", "==", "global"),
        where("status", "in", ["pending", "needs_review"])
      ),
      (snap) => {
        globalRecs = [];
        snap.forEach((d) => globalRecs.push({ id: d.id, ...d.data() }));
        updateRecs();
      },
      (err) => console.error("Global recs error:", err)
    );

    return () => {
      unsubLocal();
      unsubGlobal();
    };
  }, [selectedServerId, isPro]);

  useEffect(() => {
    // Only clear ERRORS after a timeout.
    // Keep the "Synced" success state visible so the user knows it's done.
    if (syncResult && !syncResult.success) {
      const timer = setTimeout(() => setSyncResult(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [syncResult]);

  useEffect(() => {
    if (!loading && location.hash.includes("/")) {
      const elementId = location.hash.split("/")[1];
      if (elementId) {
        let attempts = 0;
        const tryScroll = () => {
          const el = document.getElementById(elementId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add(
              "ring-2",
              "ring-primary",
              "ring-offset-8",
              "ring-offset-bg-base",
              "rounded-lg",
            );
            setTimeout(
              () =>
                el.classList.remove(
                  "ring-2",
                  "ring-primary",
                  "ring-offset-8",
                  "ring-offset-bg-base",
                  "rounded-lg",
                ),
              2500,
            );
          } else if (attempts < 5) {
            attempts++;
            setTimeout(tryScroll, 300);
          }
        };
        setTimeout(tryScroll, 100);
      }
    }
  }, [loading, location.hash, activeTab]);

  const handleSyncCommands = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/register-commands`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ serverId: selectedServerId }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(
          `Server returned non-JSON: ${text.substring(0, 50)}...`,
        );
      }

      if (data.details) {
        const added = data.details.added || [];
        const updated = data.details.updated || [];
        const removed = data.details.removed || [];
        const failed = data.details.failed || [];
        setSyncResult({
          success: data.success,
          message: "Commands synced!",
          details: data.details,
        });

        if (data.success) {
          const changedCommands = [
            ...added.map((name: string) => `added /${name}`),
            ...updated.map((name: string) => `updated /${name}`),
            ...removed.map((name: string) => `removed duplicate /${name}`),
          ];
          const preview = changedCommands.slice(0, 6).join(", ");
          const overflow =
            changedCommands.length > 6
              ? `, and ${changedCommands.length - 6} more`
              : "";

          toast.success(
            changedCommands.length > 0
              ? `Slash commands synced: ${preview}${overflow}.`
              : "Slash commands are already synced.",
          );
        }

        if (failed.length > 0) {
          failed.forEach((f: any) => {
            toast.error(`Failed to register /${f.name}: ${f?.error}`);
          });
        }
      } else if (data.success) {
        setSyncResult({ success: true, message: "Commands synced!" });
        toast.success("Slash commands synced.");
      } else {
        setSyncResult({
          success: false,
          message: data?.error || "Unknown error",
        });
        toast.error(data?.error || "Failed to sync commands.");
      }

      if (data.success && selectedServerId) {
        const now = new Date().toISOString();
        await setDoc(
          doc(db, `servers/${selectedServerId}`),
          { lastCommandSync: now },
          { merge: true },
        );
        setSettings((s) => ({ ...s, lastCommandSync: now }));
      }
    } catch (err: any) {
      console.error("Sync Error:", err);
      setSyncResult({ success: false, message: err.message });
      toast.error("Failed to sync commands: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    setOptimisticActive(null);
    if (!user || !selectedServerId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setSubscription(null);
    setServerGrantExpiry(null);

    const unsubServer = onSnapshot(
      doc(db, `servers/${selectedServerId}`),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const newSettings = {
            modRoleId: data.modRoleId || "",
            logChannelId: data.logChannelId || "",
            lastCommandSync: data.lastCommandSync || "",
            language: data.language || "en",
            keywords: data.keywords || [],
            autoDeleteOnKeywordMatch: data.autoDeleteOnKeywordMatch || false,
            confidenceThreshold: data.confidenceThreshold || 80,
            autoDelete: data.autoDelete || false,
            useContext: data.useContext || false,
            healthWidget: data.healthWidget || {
              enabled: false,
              channelId: "",
            },
          };

          if (hasChanges.current) {
            updateBaseline(() => newSettings);
          } else {
            setSettings(newSettings);
            resetSaveState(newSettings);
          }

          if (data.lastCommandSync && !hasChanges.current && !syncResult) {
            // You might not want to re-trigger the toast on every snapshot, but this preserves original logic broadly
            // Original: if (data.lastCommandSync) setSyncResult(...)
            // Actually, we'll just keep it clean:
          }
          setServerGrantExpiry(data.betaExpiry || null);
        } else {
          setServerGrantExpiry(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Failed to fetch settings", err);
        setLoading(false);
      },
    );

    const subRef = doc(db, `subscriptions/${selectedServerId}`);
    const unsubSub = onSnapshot(subRef, (subSnap) => {
      if (subSnap.exists()) {
        setSubscription(subSnap.data());
      } else {
        setSubscription(null);
      }
    }, (err) => console.error("Subscription snapshot error:", err));

    auth.currentUser?.getIdToken().then((token) => {
      fetch(`/api/discord/roles/${selectedServerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              return res.json();
            }
          }
          return { roles: [] };
        })
        .then((data) => data.roles && setDiscordRoles(data.roles))
        .catch(console.error);

      fetch(`/api/discord/channels/${selectedServerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              return res.json();
            }
          }
          return { channels: [] };
        })
        .then((data) => data.channels && setDiscordChannels(data.channels))
        .catch(console.error);
    });

    const unsubUserSub = onSnapshot(
      doc(db, `subscriptions/${user.uid}`),
      (docSnap) => {
        if (docSnap.exists()) {
          setUserSubscription(docSnap.data());
        } else {
          setUserSubscription(null);
        }
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `subscriptions/${user.uid}`,
        );
      },
    );

    const q = query(collection(db, `servers/${selectedServerId}/rules`));
    const unsubscribeRules = onSnapshot(q, {
      next: (snapshot) => {
        const rulesData: Rule[] = [];
        snapshot.forEach((doc) => {
          rulesData.push({ id: doc.id, ...doc.data() } as Rule);
        });
        // Sort by createdAt so they don't jump around
        rulesData.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setRules(rulesData);
      },
      error: (err) => {
        handleFirestoreError(
          err,
          OperationType.GET,
          `servers/${selectedServerId}/rules`,
        );
      },
    });

    return () => {
      unsubUserSub();
      unsubServer();
      unsubSub();
      unsubscribeRules();
    };
  }, [user, selectedServerId]);

  const handleKickBot = async () => {
    if (!selectedServerId || !user?.email) return;

    setToggling(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/kick-bot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          email: user.email,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Failed to remove bot");
      }

      await refreshAccess();
    } catch (err: any) {
      console.error("Error removing bot:", err);
    } finally {
      setToggling(false);
    }
  };

  const [syncingBot, setSyncingBot] = useState(false);

  const handleForceSync = async () => {
    if (!selectedServerId || !user) return;
    setSyncingBot(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/force-sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not sync connection status.");
        return;
      }
      if (data.success) {
        toast.success(
          `Connection restored! Bot is ${data.active ? "active" : "present but inactive"}.`,
        );
        if (data.active && !optimisticActive) {
          setOptimisticActive(true);
        }
        await refreshAccess();
      } else {
        toast.error(data.error || "Failed to force sync.");
      }
    } catch (e: any) {
      toast.error("An error occurred during force sync.");
    } finally {
      setSyncingBot(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedServerId || !user?.email) return;

    setToggling(true);
    setActivationError(null);
    try {
      const token = await user.getIdToken();

      if (isCurrentlyActive) {
        setOptimisticActive(false);

        const res = await fetch(`/api/guilds/${selectedServerId}/activation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active: false }),
        });

        if (!res.ok) {
          const errData = await res.json();
          setOptimisticActive(true);
          setActivationError(errData.error || "Failed to deactivate server.");
          setToggling(false);
          return;
        }

      } else {
        // Activate this server
        if (!isOwnedByMe && !isSharedServer) {
          setActivationError(
            "You must claim this server first before activating.",
          );
          setToggling(false);
          return;
        }
        // Shared server moderators can activate but not claim, which is fine

        let isBetaTest = false;
        const serverSubSnap = await getDoc(
          doc(db, "server_subscriptions", selectedServerId),
        );
        if (serverSubSnap.exists() && serverSubSnap.data()?.isBeta === true) {
          isBetaTest = true;
        }

        if (!isBetaTest && activeQuotaCount >= maxSlots) {
          setActivationError(
            `You have reached your maximum of ${maxSlots} active server slots. Deactivate another server first.`,
          );
          setToggling(false);
          return;
        }

        try {
          const permRes = await fetch(
            `/api/discord/permissions/${selectedServerId}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          const data = await permRes.json().catch(() => null);
          if (!permRes.ok || !data?.permissions) {
            setOptimisticActive(false);
            setActivationError(
              data?.error ||
                "SentinL could not verify the bot in this server yet. Reopen the dashboard or use Sync Connection Status after Discord finishes the invite.",
            );
            setToggling(false);
            return;
          }
          if (data && data.permissions) {
            const requiredPerms = [
              "ViewChannel",
              "SendMessages",
              "ManageMessages",
              "ModerateMembers",
              "ReadMessageHistory",
              "EmbedLinks",
            ];
            const missing = requiredPerms.filter((p) => !data.permissions[p]);
            if (missing.length > 0) {
              const missingDetails = missing.map(
                (p) => `${p} (${DOWNSTREAM_EFFECTS[p as PermissionType]})`,
              );
              setActivationError(
                `Missing permissions: ${missingDetails.join(" | ")}. Please update Bot's role in Discord Server settings.`,
              );
              setToggling(false);
              return;
            }
          }
        } catch (err) {
          console.error("Failed to check bot permissions", err);
          setOptimisticActive(false);
          setActivationError(
            "SentinL could not verify the bot's Discord permissions. Please sync connection status or try again after Firebase/Discord recovers.",
          );
          setToggling(false);
          return;
        }

        setOptimisticActive(true);
        const res = await fetch(`/api/guilds/${selectedServerId}/activation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active: true }),
        });

        if (!res.ok) {
          const errData = await res.json();
          setOptimisticActive(false);
          setActivationError(errData.error || "Failed to activate server.");
          setToggling(false);
          return;
        }

      }

      await refreshAccess();
    } catch (err) {
      console.error("Error toggling activation:", err);
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `servers/${selectedServerId}`,
      );
      setActivationError("Failed to toggle server state.");
    } finally {
      setToggling(false);
    }
  };

  const handleClaimServer = async () => {
    if (!selectedServerId || !discordProfile || !user) return;

    // Cross check mechanism: Ensure user actually owns or moderates the server
    // by verifying it's in their authorizedServers list (which is populated via Discord OAuth 0x8 & 0x20 permissions check)
    const isAuthorized = authorizedServers.some(
      (server) => server.id === selectedServerId,
    );
    if (!isAuthorized) {
      toast(
        "You need Discord's Manage Server permission to claim this server.",
      );
      return;
    }

    setClaiming(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/claim-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          userId: user.uid,
          discordId: discordProfile.id,
          serverName:
            authorizedServers.find((s) => s.id === selectedServerId)?.name ||
            "",
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.error || result?.message || "Failed to claim server",
        );
      }

      await refreshAccess();
      toast.success("Server claimed successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Error claiming server: " + err.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleUnclaimServer = async () => {
    if (!selectedServerId || !user) return;

    setClaiming(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/unclaim-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          userId: user.uid,
          email: user.email,
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.error || result?.message || "Failed to unclaim server",
        );
      }

      await refreshAccess();
      toast.success("Server unclaimed successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Error unclaiming server: " + err.message);
    } finally {
      setClaiming(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId) return;
    setSaving(true);
    try {
      const payloadToSave: any = { ...settings };
      delete payloadToSave.healthWidget;
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
    } catch (error) {
      console.error("Error saving settings:", error);
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `servers/${selectedServerId}`,
      );
      toast.error("Failed to save settings.");
    }
    setSaving(false);
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !selectedServerId) return;

    const validation = validateKeyword(newKeyword);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const trimmed = validation.normalized;
    // Prevent duplicates
    if (!settings.keywords.includes(trimmed)) {
      const updatedKeywords = [...settings.keywords, trimmed];
      setSettings((prev) => ({
        ...prev,
        keywords: updatedKeywords,
      }));
      setNewKeyword("");

      try {
        await setDoc(
          doc(db, `servers/${selectedServerId}`),
          { keywords: updatedKeywords },
          { merge: true },
        );
        toast.success("Keyword added");
      } catch (error) {
        console.error("Error saving keyword:", error);
        toast.error("Failed to save keyword");
      }
    } else {
      setNewKeyword("");
    }
  };

  const handleRemoveKeyword = async (keywordToRemove: string) => {
    if (!selectedServerId) return;
    const updatedKeywords = settings.keywords.filter(
      (k) => k !== keywordToRemove,
    );
    setSettings((prev) => ({
      ...prev,
      keywords: updatedKeywords,
    }));

    try {
      await setDoc(
        doc(db, `servers/${selectedServerId}`),
        { keywords: updatedKeywords },
        { merge: true },
      );
      toast.success("Keyword removed");
    } catch (error) {
      console.error("Error removing keyword:", error);
      toast.error("Failed to remove keyword");
    }
  };

  const handleToggleAutoDelete = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!selectedServerId) return;
    const isChecked = e.target.checked;
    setSettings((prev) => ({
      ...prev,
      autoDeleteOnKeywordMatch: isChecked,
    }));
    updateBaseline((old: any) => ({
      ...old,
      autoDeleteOnKeywordMatch: isChecked,
    }));

    try {
      await setDoc(
        doc(db, `servers/${selectedServerId}`),
        { autoDeleteOnKeywordMatch: isChecked },
        { merge: true },
      );
      toast.success("Setting updated");
    } catch (error) {
      console.error("Error updating setting:", error);
      toast.error("Failed to update setting");
      setSettings((prev) => ({
        ...prev,
        autoDeleteOnKeywordMatch: !isChecked,
      }));
      updateBaseline((old: any) => ({
        ...old,
        autoDeleteOnKeywordMatch: !isChecked,
      }));
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.trim() || !selectedServerId) return;

    try {
      await addDoc(collection(db, `servers/${selectedServerId}/rules`), {
        text: newRule,
        createdAt: new Date().toISOString(),
      });
      setNewRule("");
    } catch (error) {
      console.error("Error adding rule:", error);
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `servers/${selectedServerId}/rules`,
      );
      if (error instanceof Error) {
        toast.error("Error adding rule: " + error.message);
      }
    }
  };

  const handleRecAction = async (recId: string, action: "add" | "dismiss") => {
    if (!user || !isPro) return;
    const token = await user.getIdToken();
    try {
      const res = await fetch("/api/recommendations/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recommendationId: recId,
          serverId: selectedServerId,
          userId: user.uid,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      toast.error("Failed to process recommendation action: " + err.message);
    }
  };

  const addSuggestionRule = async (ruleId: string, ruleText: string) => {
    if (!selectedServerId || !isPro) return;

    const normalizedRule = ruleText.trim().toLowerCase();
    if (rules.some((rule) => rule.text.trim().toLowerCase() === normalizedRule) || addingRules[ruleId] === "added") {
      setAddingRules((prev) => ({ ...prev, [ruleId]: "added" }));
      return;
    }

    setAddingRules((prev) => ({ ...prev, [ruleId]: "loading" }));

    try {
      const token = user ? await user.getIdToken() : "";

      const response = await fetch("/api/rules/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ serverId: selectedServerId, ruleText }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || "Failed to add rule");
      }

      setAddingRules((prev) => ({ ...prev, [ruleId]: "added" }));
      toast.success(result?.duplicate ? "Rule already added." : "Rule added successfully!");
    } catch (err: any) {
      console.error(err);
      setAddingRules((prev) => ({ ...prev, [ruleId]: "idle" }));
      toast.error(err.message || "Failed to add rule. Please try again.");
    }
  };

  const addAllPresetRules = async (preset: ServerRulePreset) => {
    setAddingAllPresetRules(true);
    try {
      const existingRuleSet = new Set(rules.map((rule) => rule.text.trim().toLowerCase()));
      for (const [index, ruleText] of preset.rules.entries()) {
        const ruleId = `${preset.id}-${index}`;
        if (existingRuleSet.has(ruleText.trim().toLowerCase()) || addingRules[ruleId] === "added") continue;
        await addSuggestionRule(ruleId, ruleText);
      }
    } finally {
      setAddingAllPresetRules(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedServerId) return;
    try {
      await deleteDoc(doc(db, `servers/${selectedServerId}/rules`, ruleId));
    } catch (error) {
      console.error("Error deleting rule:", error);
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `servers/${selectedServerId}/rules`,
      );
    }
  };

  if (serverLoading || loading) {
    return (
      <div className="flex flex-col gap-6 w-full max-w-[1400px] animate-pulse">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="h-8 w-48 bg-surface-container rounded-md"></div>
          <div className="h-10 w-64 bg-surface-container rounded-xl"></div>
        </div>
        <div className="flex gap-2 mb-6 border-b border-outline-variant/30 pb-4 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-10 w-32 bg-surface-container rounded-xl"
            ></div>
          ))}
        </div>
        <div className="bg-white/80 backdrop-blur-md rounded-[2.5rem] border border-white/40 shadow-xl shadow-primary/5 w-full flex flex-col min-h-[500px]">
          <div className="px-8 py-6 border-b border-outline-variant/20 flex gap-4">
            <div className="w-12 h-12 bg-surface-container rounded-2xl"></div>
            <div className="space-y-2 pt-1">
              <div className="h-5 w-48 bg-surface-container rounded-md"></div>
              <div className="h-3 w-64 bg-surface-container rounded-md"></div>
            </div>
          </div>
          <div className="p-8 space-y-8 flex-1">
            <div className="space-y-4">
              <div className="h-4 w-32 bg-surface-container rounded-md"></div>
              <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
            </div>
            <div className="space-y-4">
              <div className="h-4 w-40 bg-surface-container rounded-md"></div>
              <div className="h-14 w-full bg-surface-container rounded-2xl"></div>
            </div>
            <div className="space-y-4">
              <div className="h-4 w-32 bg-surface-container rounded-md"></div>
              <div className="h-32 w-full bg-surface-container rounded-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedServerId) {
    const inviteUrl = getDiscordInviteUrl();

    return (
      <EmptyState
        title="No servers found"
        description={
          !discordProfile
            ? "Connect your Discord account to sync your servers using the button on the top right."
            : "Invite SentinL to your server to get started."
        }
      >
        {discordProfile && inviteUrl ? (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2 rounded-md font-semibold bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors duration-300 ease-out"
          >
            Invite Bot to your Server
          </a>
        ) : (
          <button
            disabled
            className="px-6 py-2 rounded-md font-semibold bg-surface-container text-text-secondary/50 cursor-not-allowed transition-colors duration-300 ease-out border border-outline-variant/30"
          >
            Invite Bot to your Server
          </button>
        )}
      </EmptyState>
    );
  }

  const inviteUrl = getDiscordInviteUrl();
  const activeTabLabel =
    activeTab === "general"
      ? "General Settings"
      : activeTab === "dna"
        ? "Community DNA"
        : activeTab === "commands"
          ? "Command List"
          : activeTab === "onboarding"
          ? "Roles & Onboarding"
          : "Custom Commands";
  const headerPath = [
    activeTabLabel,
    activeTab === "dna" ? (dnaTab === "suggestions" ? "Suggestions" : "Custom Rules") : null,
  ];
  const parseDateLike = (value: any): Date | null => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const serverEntitlementExpiryDate = parseDateLike(serverEntitlementExpiry);
  const selectedServerSubExpiry =
    parseDateLike(subscription?.expiresAt) ||
    parseDateLike(subscription?.trialEnd);
  const selectedServerGrantExpiry = parseDateLike(serverGrantExpiry);
  const planExpiry =
    serverEntitlementExpiryDate ||
    selectedServerSubExpiry ||
    selectedServerGrantExpiry;
  const hasActiveExpiringPlan =
    !!tier && tier !== "free" && !!planExpiry && planExpiry.getTime() > Date.now();
  const trialExpiry =
    (serverEntitlementStatus === "trial" ? serverEntitlementExpiryDate : null) ||
    parseDateLike(subscription?.trialEnd);
  const isTrialLike =
    isTrial ||
    (serverEntitlementStatus === "trial" &&
      !!serverEntitlementExpiryDate &&
      serverEntitlementExpiryDate.getTime() > Date.now()) ||
    (subscription?.status === "trial" &&
      !!trialExpiry &&
      trialExpiry.getTime() > Date.now());
  const planExpiryText = hasActiveExpiringPlan
    ? `${isTrialLike ? "Trial ends" : "Plan expires"} ${planExpiry.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : null;
  const activationControls = (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {discordProfile && (
        <div id="setup-claim-server" className="group relative">
          {isSharedServer ? (
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/70"
            >
              <UserRoundCog className="h-3.5 w-3.5" />
              Shared
            </button>
          ) : isOwnedByMe ? (
            showUnclaimConfirm ? (
              <div className="flex w-full items-center gap-1 rounded-2xl border border-white/20 bg-white/10 p-1">
                <button
                  disabled={claiming}
                  onClick={() => {
                    setShowUnclaimConfirm(false);
                    handleUnclaimServer();
                  }}
                  className="flex-1 rounded-xl bg-white px-2 py-2 text-[9px] font-black uppercase tracking-widest text-danger transition-all hover:bg-white/90 active:scale-95 disabled:opacity-50"
                >
                  {claiming ? "Wait" : "Yes"}
                </button>
                <button
                  disabled={claiming}
                  onClick={() => setShowUnclaimConfirm(false)}
                  className="flex-1 rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/75 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                disabled={claiming}
                onClick={() => setShowUnclaimConfirm(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-primary shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:bg-white/90 active:scale-95 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Claimed
              </button>
            )
          ) : (
            <button
              disabled={claiming}
              onClick={handleClaimServer}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/12 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:-translate-y-0.5 hover:bg-white hover:text-primary active:scale-95 disabled:opacity-50"
            >
              <UserRoundCog className="h-3.5 w-3.5" />
              {claiming ? "Claiming" : "Claim"}
            </button>
          )}
          <p className="mt-1.5 text-center text-[7px] font-black uppercase tracking-widest text-white/50">
            Server access
          </p>
        </div>
      )}

      <div id="setup-invite-bot" className="group relative">
        {botIsPresent ? (
          showKickConfirm ? (
            <div className="flex w-full items-center gap-1 rounded-2xl border border-white/20 bg-white/10 p-1">
              <button
                disabled={toggling}
                onClick={() => {
                  setShowKickConfirm(false);
                  handleKickBot();
                }}
                className="flex-1 rounded-xl bg-white px-2 py-2 text-[9px] font-black uppercase tracking-widest text-danger transition-all hover:bg-white/90 active:scale-95 disabled:opacity-50"
              >
                {toggling ? "Wait" : "Remove"}
              </button>
              <button
                disabled={toggling}
                onClick={() => setShowKickConfirm(false)}
                className="flex-1 rounded-xl px-2 py-2 text-[9px] font-black uppercase tracking-widest text-white/75 transition-all hover:bg-white/10 active:scale-95 disabled:opacity-50"
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowKickConfirm(true)}
              disabled={toggling}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-primary shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:bg-white/90 active:scale-95 disabled:opacity-50"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Deployed
            </button>
          )
        ) : (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${!(isOwnedByMe || isSharedServer) ? "pointer-events-none border-white/10 bg-white/5 text-white/35" : "border-white/25 bg-white/12 text-white hover:-translate-y-0.5 hover:bg-white hover:text-primary"}`}
            onClick={(e) => {
              if (!(isOwnedByMe || isSharedServer)) {
                e.preventDefault();
                toast("You must claim the server first.");
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Invite
          </a>
        )}
        <p className="mt-1.5 text-center text-[7px] font-black uppercase tracking-widest text-white/50">
          Bot install
        </p>
      </div>

      <div id="setup-activate-bot" className="group relative">
        <button
          disabled={
            isSharedServer ||
            toggling ||
            !botIsPresent
          }
          onClick={handleToggleActive}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${!botIsPresent || (isSharedServer && !isCurrentlyActive) ? "border-white/10 bg-white/5 text-white/35" : isCurrentlyActive ? "border-white/25 bg-white text-primary shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:bg-white/90" : "border-white/25 bg-white/12 text-white hover:-translate-y-0.5 hover:bg-white hover:text-primary"}`}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
          {isCurrentlyActive ? "Active" : "Activate"}
        </button>
        <p className="mt-1.5 text-center text-[7px] font-black uppercase tracking-widest text-white/50">
          Moderation
        </p>
        {activationError && (
          <div className="absolute top-12 left-1/2 z-50 flex w-52 -translate-x-1/2 items-center gap-2 rounded-xl bg-danger p-2 text-center text-[10px] font-semibold leading-tight text-white shadow-xl">
            <span>{activationError}</span>
            <button
              onClick={() => setActivationError(null)}
              className="ml-auto rounded-md px-1 transition-opacity hover:opacity-75"
            >
              <span className="sr-only">Close</span>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {isSharedServer ? (
          <div className="pointer-events-none absolute top-12 left-1/2 z-50 w-56 -translate-x-1/2 rounded-2xl border border-white/45 bg-white/95 p-2.5 text-center text-[10px] font-bold leading-tight text-primary opacity-0 shadow-xl shadow-black/10 backdrop-blur-xl transition-all group-hover:opacity-100">
            This server's billing and activation are managed by the owner.
          </div>
        ) : (
          !botIsPresent && (
            <div className="pointer-events-none absolute top-12 left-1/2 z-50 w-56 -translate-x-1/2 rounded-2xl border border-white/45 bg-white/95 p-2.5 text-center text-[10px] font-bold leading-tight text-primary opacity-0 shadow-xl shadow-black/10 backdrop-blur-xl transition-all group-hover:opacity-100">
              Invite the bot before activating moderation.
            </div>
          )
        )}
      </div>

      <div className="relative">
        <button
          disabled={syncing || !isCurrentlyActive}
          onClick={handleSyncCommands}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${!isCurrentlyActive ? "border-white/10 bg-white/5 text-white/35" : syncResult?.success ? "border-white/25 bg-white text-primary shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:bg-white/90" : "border-white/25 bg-white/12 text-white hover:-translate-y-0.5 hover:bg-white hover:text-primary"}`}
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : syncResult?.success ? (
            <ListChecks className="h-3.5 w-3.5" />
          ) : (
            <Activity className="h-3.5 w-3.5" />
          )}
          {syncing ? "Syncing" : syncResult?.success ? "Synced" : "Sync"}
        </button>
        {syncResult && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[7px] font-black uppercase tracking-widest ${syncResult.success ? "text-white" : "text-white"}`}
          >
            {syncResult.success ? "Success" : "Failed"}
          </motion.span>
        )}
        <p className="mt-1.5 text-center text-[7px] font-black uppercase tracking-widest text-white/50">
          Commands
        </p>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="space-y-8"
    >
      <BrandedPageHeader
        eyebrow="Bot Control"
        title="Bot Settings"
        description="Manage setup, rules, commands, roles, and automation for this server."
        icon={SettingsIcon}
        meta={
          <HeaderMetaPills
            planLabel={getPlanDisplayLabel({ tier, isBetaTester, isTrial: isTrialLike, isSharedServer })}
            path={headerPath}
          />
        }
        action={
          <div className="flex w-full min-w-[320px] max-w-3xl flex-col gap-4 rounded-[1.75rem] border border-white/20 bg-white/10 px-4 py-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.30)] backdrop-blur-xl lg:w-[680px]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <motion.span
                  animate={isCurrentlyActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                  transition={{ duration: 1.8, repeat: isCurrentlyActive ? Infinity : 0, ease: "easeInOut" }}
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${isCurrentlyActive ? "border-white/30 bg-white text-primary shadow-lg shadow-black/10" : "border-white/20 bg-white/10 text-white/70"}`}
                >
                  <Power className="h-4 w-4" />
                </motion.span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                    Activation Status
                  </p>
                  <p className="text-base font-black text-white">
                    {isCurrentlyActive ? "Bot Active" : "Bot Inactive"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/70">
                  {activeQuotaCount}/{maxSlots} slots
                </span>
                <button
                  onClick={handleForceSync}
                  disabled={syncingBot}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-primary shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:bg-white/90 active:scale-95 disabled:opacity-60"
                  title="Sync Connection Status"
                  aria-label="Sync connection status"
                >
                  <RefreshCw className={`h-4 w-4 ${syncingBot ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
            {planExpiryText && (
              <div className="flex items-center gap-2 border-t border-white/15 pt-3 text-[10px] font-black uppercase tracking-widest text-white/70">
                <Clock className="h-3.5 w-3.5" />
                {planExpiryText}
              </div>
            )}
            <div className="border-t border-white/15 pt-4">
              {activationControls}
              {botPresenceError && (
                <div className="mt-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-white/85">
                  {botPresenceError}
                </div>
              )}
            </div>
          </div>
        }
      />

      <div className="max-w-full">
        <BranchTabs
          active={activeTab}
          onChange={(newTab) => {
            setActiveTab(newTab);
            window.history.replaceState(null, "", `#${newTab}`);
          }}
          items={[
            { id: "general", label: "General Settings", icon: SettingsIcon },
            {
              id: "dna",
              icon: Brain,
              label: (
                <span className="flex items-center gap-1.5">
                  Community DNA
                  <AnimatePresence>
                    {recommendations.length > 0 && !hasViewedSuggestions && (
                      <motion.span
                        key={recommendations.length}
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: [1, 1.15, 1], opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.8, y: -10 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="rounded bg-danger px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm shadow-danger/20"
                      >
                        {recommendations.length}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              ),
            },
            { id: "commands", label: "Command List", icon: TerminalSquare },
            { id: "onboarding", label: "Roles & Onboarding", icon: UserRoundCog },
            {
              id: "custom_commands",
              icon: MessageSquareText,
              label: (
                <span className="flex items-center gap-1.5">
                  Custom Commands
                  {!isPro && (
                    <span className="sentinl-pro-badge">
                      PRO
                    </span>
                  )}
                </span>
              ),
            },
          ]}
        />
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {activeTab === "general" && (
              <div className="w-full border border-white/40 bg-white/80 backdrop-blur-md rounded-[2.5rem] overflow-hidden shadow-xl shadow-primary/5">
                <div className="px-8 py-6 border-b border-primary/20 bg-primary text-white">
                  <h2 className="text-xl font-extrabold text-white tracking-tight">
                    General Settings
                  </h2>
                  <p className="text-[10px] font-black text-white/78 uppercase tracking-widest mt-1">
                    Choose the basics SentinL needs to work in this server.
                  </p>
                </div>
                <form onSubmit={handleSave} className="p-8 space-y-8">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                      Language
                    </label>
                    <Select
                      value={settings.language}
                      onChange={(val) =>
                        setSettings({ ...settings, language: val })
                      }
                      options={languages.map((lang) => ({
                        value: lang.code,
                        label: `${lang.native} (${lang.name})`,
                      }))}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1 flex items-center justify-between">
                      <div>
                        Moderator Role
                        <Tooltip text="Members with this role can use moderator-only SentinL commands and are treated as trusted staff." />
                      </div>
                    </label>
                    <RoleSelector
                      roles={discordRoles}
                      disablePositionCheck={true}
                      value={settings.modRoleId}
                      onChange={(roleId) =>
                        setSettings({ ...settings, modRoleId: roleId })
                      }
                      placeholder="Select moderator role..."
                    />
                    <p className="text-[10px] text-text-secondary mt-2 ml-1 opacity-70">
                      Pick the staff role that should control moderation tools.
                    </p>
                  </div>

                  <div id="setup-log-channel">
                    <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1 flex items-center justify-between">
                      <div>
                        Log Channel
                        <Tooltip text="Choose a private staff channel where SentinL should post moderation alerts, reports, and action updates." />
                      </div>
                    </label>
                    <ChannelSelector
                      channels={discordChannels}
                      value={settings.logChannelId}
                      onChange={(val) =>
                        setSettings({ ...settings, logChannelId: val })
                      }
                      placeholder="Select log channel..."
                    />
                    <p className="text-[10px] text-text-secondary mt-2 ml-1 opacity-70">
                      SentinL will post moderation alerts and report updates here.
                    </p>
                  </div>

                  <div className="pt-6 border-t border-outline-variant/20">
                    <motion.button
                      animate={
                        isSaved
                          ? {
                              scale: [1, 1.05, 1],
                              transition: { duration: 0.3 },
                            }
                          : {}
                      }
                      whileTap={{ scale: hasChanges ? 0.95 : 1 }}
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
                      {saving
                        ? "Saving Changes..."
                        : isSaved
                          ? "Saved"
                          : "Save Changes"}
                    </motion.button>
                  </div>
                </form>
              </div>
            )}

            {activeTab === "dna" && (
              <div className="flex flex-col gap-8">
                <div className="ml-4 max-w-[calc(100%-1rem)] sm:ml-5 sm:max-w-[calc(100%-1.25rem)] lg:ml-6 lg:max-w-[calc(100%-1.5rem)]">
                  <BranchTabs
                    level="sub"
                    active={dnaTab}
                    onChange={(tab) => setDnaTab(tab)}
                    items={[
                      { id: "rules", label: "Custom Rules", icon: ShieldAlert },
                      {
                        id: "suggestions",
                        icon: Wand2,
                        label: (
                          <span className="flex items-center gap-1">
                            DNA Suggestions
                            <AnimatePresence>
                              {recommendations.length > 0 && !hasViewedSuggestions && (
                                <motion.span
                                  key={recommendations.length}
                                  initial={{ scale: 1, opacity: 1 }}
                                  animate={{ scale: [1, 1.15, 1], opacity: 1 }}
                                  exit={{ opacity: 0, scale: 0.8, y: -10 }}
                                  transition={{ duration: 0.4, ease: "easeOut" }}
                                  className="rounded bg-danger px-1 py-0.5 text-[7px] font-black text-white shadow-sm shadow-danger/20"
                                >
                                  {recommendations.length}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={dnaTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    {dnaTab === "rules" && (
                      <div className="grid grid-cols-1 gap-8">
                        {/* Left Column */}
                        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                          <div className="bg-white/80 backdrop-blur-md border border-white/50 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5">
                            <div className="relative overflow-hidden bg-primary px-8 py-7 text-white">
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.24),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.18),transparent_45%)]" />
                              <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                                <div className="max-w-2xl">
                                  <h2 className="text-2xl font-black tracking-tight">
                                    Custom Rules
                    <Tooltip text="Write rules the way you would explain them to a moderator. SentinL uses them when judging tone, intent, and behavior." />
                                  </h2>
                                  <p className="mt-2 text-sm font-semibold leading-relaxed text-white/80">
                                    Tell SentinL what your community allows and what crosses the line. Use normal sentences, like you would explain rules to a new moderator.
                                  </p>
                                </div>
                                <div className="flex w-fit items-center rounded-full border border-white/25 bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/85 backdrop-blur-md">
                                  <span className="px-3 py-2">{rules.length} rules</span>
                                  <span className="h-4 w-px bg-white/25" />
                                  <span className="px-3 py-2">15 recommended</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid items-start gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
                              <section className="self-start rounded-[2rem] border border-primary/10 bg-primary/5 p-5 shadow-inner">
                                <div className="mb-4">
                                  <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">
                                    Add a rule
                                  </h3>
                                  <p className="mt-2 text-xs font-semibold leading-relaxed text-text-secondary">
                                    Be specific about behavior, not just words. Mention if sarcasm, baiting, spoilers, links, or repeated insults should be treated as problems.
                                  </p>
                                </div>
                              <form
                                onSubmit={handleAddRule}
                                  className="flex flex-col gap-3"
                              >
                                  <textarea
                                  value={newRule}
                                  onChange={(e) => setNewRule(e.target.value)}
                                    placeholder="Example: Do not target members with sarcasm, baiting, insults, or comments meant to make them feel stupid."
                                    rows={5}
                                    className="min-h-[130px] w-full resize-none rounded-2xl border border-white/70 bg-white/80 px-5 py-4 text-sm font-medium leading-relaxed text-on-surface shadow-sm outline-none transition-all duration-300 placeholder:text-text-secondary/45 focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10"
                                />
                                <button
                                  type="submit"
                                    disabled={!newRule.trim()}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 active:scale-95 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <Plus className="w-4 h-4" />
                                    Add Rule
                                </button>
                              </form>
                                <div className="mt-5 grid gap-2 text-[11px] font-bold leading-relaxed text-text-secondary">
                                  <div className="flex items-start gap-2 rounded-2xl bg-white/60 p-3">
                                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                    <span>Good rules describe intent and behavior clearly.</span>
                                  </div>
                                  <div className="flex items-start gap-2 rounded-2xl bg-white/60 p-3">
                                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                    <span>Keep the list focused. Too many overlapping rules can make moderation less consistent.</span>
                                  </div>
                                </div>
                              </section>

                              <section className="flex h-[32rem] max-h-[70vh] flex-col rounded-[2rem] border border-white/70 bg-white/70 shadow-sm">
                                <div className="flex items-center justify-between gap-4 border-b border-outline-variant/20 px-5 py-4">
                                  <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-on-surface">
                                      Active rules
                                    </h3>
                                    <p className="mt-1 text-xs font-semibold text-text-secondary">
                                      These instructions guide SentinL while it judges messages.
                                    </p>
                                  </div>
                                  <Brain className="h-5 w-5 shrink-0 text-primary" />
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                  <div className="flex flex-col gap-3">
                                    {rules.length === 0 ? (
                                      <div className="flex min-h-[22rem] flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-outline-variant/40 bg-surface-container/40 px-6 py-12 text-center">
                                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                                          <ShieldAlert className="h-7 w-7" />
                                        </div>
                                        <h4 className="text-sm font-black text-on-surface">
                                          No custom rules yet
                                        </h4>
                                        <p className="mt-2 max-w-xs text-xs font-semibold leading-relaxed text-text-secondary">
                                          Add your first rule to teach SentinL how your server expects people to behave.
                                        </p>
                                      </div>
                                    ) : (
                                      rules.map((rule, idx) => (
                                        <motion.div
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          key={rule.id}
                                          className="group flex gap-4 rounded-2xl border border-outline-variant/20 bg-white/70 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white hover:shadow-md"
                                        >
                                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-black text-primary">
                                            {idx + 1}
                                          </div>
                                          <div className="min-w-0 flex-1 pt-1">
                                            <p className="break-words text-sm font-semibold leading-relaxed text-on-surface">
                                              {rule.text}
                                            </p>
                                          </div>
                                          {ruleToDelete === rule.id ? (
                                            <div className="mt-0.5 flex h-fit shrink-0 gap-2">
                                              <button
                                                onClick={() =>
                                                  handleDeleteRule(rule.id)
                                                }
                                                className="rounded-xl bg-danger px-3 py-1.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-danger/20 transition-colors hover:bg-danger/90"
                                              >
                                                Yes
                                              </button>
                                              <button
                                                onClick={() => setRuleToDelete(null)}
                                                className="rounded-xl bg-surface-container-high px-3 py-1.5 text-xs font-black uppercase tracking-widest text-on-surface transition-colors hover:bg-outline-variant/30"
                                              >
                                                No
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() => setRuleToDelete(rule.id)}
                                              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-secondary opacity-100 transition-all duration-300 hover:bg-danger/10 hover:text-danger focus:opacity-100 lg:opacity-0 group-hover:opacity-100"
                                              title="Delete rule"
                                              aria-label="Delete rule"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          )}
                                        </motion.div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </section>
                            </div>
                          </div>

                          <div className="self-start h-fit bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5">
                            <div className="relative overflow-hidden bg-primary px-8 py-6 text-white">
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.16),transparent_45%)]" />
                              <div className="relative z-10">
                                <h2 className="text-xl font-extrabold tracking-tight">
                                  Keyword Pre-Filter
                                  <Tooltip text="Keywords are exact words or phrases SentinL can catch instantly before using AI. Use this for obvious spam terms, scam domains, or words your server never allows." />
                                </h2>
                                <p className="text-[10px] font-black text-white/75 uppercase tracking-widest mt-1">
                                  Instant local filter before AI.
                                </p>
                              </div>
                            </div>
                            <div className="p-8 space-y-6">
                              <div>
                                <label className="block text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1">
                                  Add Keyword
                                </label>
                                <div className="flex gap-3">
                                  <input
                                    type="text"
                                    value={newKeyword}
                                    onChange={(e) =>
                                      setNewKeyword(e.target.value)
                                    }
                                    placeholder="e.g. slur, scam_domain"
                                    className="flex-1 bg-surface-container text-sm font-medium text-on-surface rounded-xl px-4 py-3 border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all duration-300"
                                  />
                                  <button
                                    onClick={handleAddKeyword}
                                    className="px-5 py-3 rounded-xl bg-surface-container-high text-on-surface font-black text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-300 ease-out shadow-inner active:scale-95"
                                  >
                                    Add
                                  </button>
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                                  Active Filter
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  {settings.keywords &&
                                  settings.keywords.length > 0 ? (
                                    settings.keywords.map((kw, i) => (
                                      <span
                                        key={i}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/20 text-xs font-semibold text-on-surface group"
                                      >
                                        {kw}
                                        <button
                                          onClick={() =>
                                            handleRemoveKeyword(kw)
                                          }
                                          className="text-text-secondary group-hover:text-danger focus:text-danger transition-colors"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-text-secondary/60 italic font-medium">
                                      No keywords added
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col pt-2 group">
                                <div className="flex items-center">
                                  <div className="relative flex items-center cursor-pointer">
                                    <input
                                      id="autoDeleteOnKeywordMatch"
                                      type="checkbox"
                                      checked={
                                        settings.autoDeleteOnKeywordMatch
                                      }
                                      onChange={handleToggleAutoDelete}
                                      className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                                    />
                                    <div
                                      className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.autoDeleteOnKeywordMatch ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20" : "bg-surface-container border-outline-variant peer-hover:border-orange-500/50"}`}
                                    >
                                      {settings.autoDeleteOnKeywordMatch && (
                                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="ml-4 flex flex-col">
                                    <label
                                      htmlFor="autoDeleteOnKeywordMatch"
                                      className="block text-xs font-bold text-on-surface flex items-center gap-2 cursor-pointer uppercase tracking-wider group relative"
                                    >
                                      Auto-delete keyword matches
                                    </label>
                                    <span className="text-[10px] text-text-secondary mt-1">
                                      Removes keyword matches immediately. Leave it off if staff should review them first.
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Column */}
                        <div className="hidden">
                          <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30 shrink-0">
                            <div className="flex justify-between items-center bg-primary/10 text-primary px-4 py-3 rounded-2xl border border-primary/20 mb-4 shadow-inner">
                              <div className="flex items-center gap-3">
                                <Brain className="w-5 h-5 shrink-0" />
                                <span className="text-xs font-bold uppercase tracking-widest">
                                  Rule guidance
                                </span>
                              </div>
                              <span className="text-[10px] uppercase font-black bg-primary/20 text-primary px-2 py-1 rounded-lg">
                                Active
                              </span>
                            </div>
                            <p className="text-xs text-text-secondary font-medium leading-relaxed mb-6">
                              Think of these rules as the foundation of your
                              community. SentinL uses them alongside its
                              built-in safety filters to evaluate messages. It
                              enforces your guidelines reliably while
                              understanding the context—so it knows the
                              difference between a friendly joke and harmful
                              behavior.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <TooltipPrimitive.Provider delayDuration={100}>
                                <TooltipPrimitive.Root>
                                  <TooltipPrimitive.Trigger asChild>
                                    <span className="px-3 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-[10px] font-black uppercase text-text-secondary tracking-widest flex items-center gap-2 cursor-help w-fit">
                                      Rules Added
                                      <span className="w-5 h-5 bg-white rounded-md flex items-center justify-center text-primary shadow-sm border border-outline-variant/10">
                                        {rules.length}
                                      </span>
                                      <span className="text-outline-variant/50">
                                        |
                                      </span>
                                      Recommended Limit
                                      <span className="w-5 h-5 bg-white rounded-md flex items-center justify-center text-text-secondary shadow-sm border border-outline-variant/10">
                                        15
                                      </span>
                                    </span>
                                  </TooltipPrimitive.Trigger>
                                  <TooltipPrimitive.Portal>
                                    <TooltipPrimitive.Content
                                      side="top"
                                      align="center"
                                      sideOffset={5}
                                      className="w-64 rounded-2xl border border-primary/20 bg-white/95 p-3 text-center text-[11px] font-bold leading-relaxed tracking-normal text-on-surface shadow-2xl shadow-primary/15 backdrop-blur-xl z-[9999] animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
                                    >
                                      Keeping your rules under 15 helps SentinL
                                      stay focused. Too many overlapping rules
                                      can make decisions less consistent.
                                      <TooltipPrimitive.Arrow className="fill-white" />
                                    </TooltipPrimitive.Content>
                                  </TooltipPrimitive.Portal>
                                </TooltipPrimitive.Root>
                              </TooltipPrimitive.Provider>
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="flex flex-col gap-2">
                              {rules.length === 0 ? (
                                <div className="flex flex-col flex-1 items-center justify-center py-12 px-6 text-center h-full">
                                  <div className="w-16 h-16 rounded-3xl bg-surface-container-high flex items-center justify-center mb-4 shadow-inner opacity-50">
                                    <ShieldAlert className="w-8 h-8 text-text-secondary/50" />
                                  </div>
                                  <h4 className="text-sm font-bold text-on-surface mb-2">
                                    No rules active
                                  </h4>
                                  <p className="text-xs text-text-secondary max-w-[200px] leading-relaxed font-medium">
                                  Add the rules you want SentinL to enforce in
                                  this server.
                                  </p>
                                </div>
                              ) : (
                                rules.map((rule, idx) => (
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={rule.id}
                                    className="group flex gap-4 p-4 rounded-xl border border-outline-variant/20 bg-surface/50 hover:bg-white hover:border-primary/30 transition-all duration-300 ease-out"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 shadow-inner group-hover:bg-primary/5 group-hover:text-primary transition-colors text-xs font-black text-text-secondary/70">
                                      {idx + 1}
                                    </div>
                                    <div className="flex-1 pt-1.5 min-w-0">
                                      <p className="text-sm text-on-surface font-medium leading-relaxed break-words">
                                        {rule.text}
                                      </p>
                                    </div>
                                    {ruleToDelete === rule.id ? (
                                      <div className="flex gap-2 shrink-0 h-fit mt-0.5">
                                        <button
                                          onClick={() =>
                                            handleDeleteRule(rule.id)
                                          }
                                          className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-bold uppercase tracking-widest hover:bg-danger/90 transition-colors shadow-lg shadow-danger/20"
                                        >
                                          Yes
                                        </button>
                                        <button
                                          onClick={() => setRuleToDelete(null)}
                                          className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold uppercase tracking-widest hover:bg-outline-variant/30 transition-colors"
                                        >
                                          No
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setRuleToDelete(rule.id)}
                                        className="h-8 w-8 flex items-center justify-center shrink-0 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all duration-300 ease-out opacity-100 lg:opacity-0 group-hover:opacity-100 focus:opacity-100 mt-0.5"
                                        title="Delete Rule"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </motion.div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {dnaTab === "suggestions" && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="flex flex-col h-[700px]">
                          {/* Pre-written Suggestions */}
                          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 h-full">
                            <div className="flex flex-col gap-2 shrink-0 h-[160px] bg-primary px-8 py-7 text-white">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white shadow-inner border border-white/20">
                                  <Wand2 className="w-5 h-5" />
                                </div>
                                <h3 className="text-xl font-extrabold text-white tracking-tight">
                                  Pre-Written Suggestions
                                </h3>
                              </div>
                              <p className="text-sm text-white/78 pl-14 leading-relaxed">
                                Add ready-made rules for common problems like
                                sarcasm, baiting, banter, and veiled threats.
                              </p>
                            </div>
                            <div className="overflow-y-auto p-8 flex-1 min-h-0">
                              <ServerRulePresetPicker
                                selectedPresetId={selectedSuggestionPresetId}
                                onSelectPreset={(preset) => setSelectedSuggestionPresetId(preset.id)}
                                existingRules={rules.map((rule) => rule.text)}
                                addingRules={addingRules}
                                onAddRule={addSuggestionRule}
                                onAddAllRules={addAllPresetRules}
                                addAllLoading={addingAllPresetRules}
                                disabled={!isPro}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col h-[700px]">
                          {/* AI Recommended Rules based on Analysis */}
                          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 h-full">
                            <div className="flex flex-col gap-2 shrink-0 h-[160px] bg-primary px-8 py-7 text-white">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white shadow-inner border border-white/20">
                                  <Brain className="w-5 h-5" />
                                </div>
                                <h3 className="text-xl font-extrabold text-white tracking-tight">
                                  AI Context Recommendations
                                </h3>
                              </div>
                              <p className="text-sm text-white/78 pl-14 leading-relaxed">
                                Rules dynamically generated by observing your
                                moderators' behaviour over the past week.
                                (Requires continuous Pro subscription and high
                                volume of false flags)
                              </p>
                            </div>

                            <div className="space-y-4 overflow-y-auto p-8 flex-1 min-h-0">
                              {!isPro ? (
                                <div className="p-10 rounded-3xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden h-full">
                                  <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] pointer-events-none text-primary">
                                    <Brain className="w-48 h-48" />
                                  </div>
                                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-5 shadow-sm border border-outline-variant/30 text-primary/70">
                                    <Lock className="w-6 h-6" />
                                  </div>
                                  <h4 className="text-lg font-extrabold text-on-surface tracking-tight mb-2">
                                    Pro Feature Locked
                                  </h4>
                                  <p className="text-sm text-text-secondary font-medium max-w-md mx-auto leading-relaxed">
                                    Upgrade to SentinL Pro to unlock dynamic,
                                    AI-generated community rule recommendations
                                    based on your moderation history.
                                  </p>
                                </div>
                              ) : recommendations.length === 0 ? (
                                <div className="p-10 rounded-3xl border border-outline-variant/20 bg-surface-container/30 flex flex-col items-center justify-center text-center h-full">
                                  <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20 text-text-secondary/60 shadow-inner">
                                    <Brain className="w-6 h-6" />
                                  </div>
                                  <h4 className="text-lg font-extrabold text-on-surface tracking-tight mb-2">
                                    Awaiting Training Data
                                  </h4>
                                  <p className="text-sm text-text-secondary mt-1 max-w-md mx-auto font-medium leading-relaxed">
                                    Our models need more manual interventions
                                    (False Positives/Negatives via{" "}
                                    <code className="bg-surface-container px-1 py-0.5 rounded text-xs">
                                      /train
                                    </code>
                                    ) from your moderators to identify patterns
                                    and generate rules.
                                  </p>
                                </div>
                              ) : (
                                <AnimatePresence>
                                  {recommendations.map((rec) => (
                                    <motion.div
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{
                                        opacity: 0,
                                        height: 0,
                                        scale: 0.95,
                                        margin: 0,
                                        overflow: "hidden",
                                      }}
                                      key={rec.id}
                                      className="p-5 rounded-2xl border border-primary/20 bg-primary/5 shadow-inner"
                                    >
                                      <div className="flex items-center gap-2 mb-3">
                                        <span className="px-2 py-1 bg-white text-primary rounded-md text-[9px] uppercase tracking-widest font-black shadow-sm inline-block">
                                          {rec.type || "Rule Recommendation"}
                                        </span>
                                        <AnimatePresence>
                                          {!hasViewedSuggestions && (
                                            <motion.span
                                              initial={{ opacity: 0, x: -10 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              exit={{
                                                opacity: 0,
                                                scale: 0.9,
                                                width: 0,
                                                margin: 0,
                                                padding: 0,
                                              }}
                                              className="px-2 py-1 bg-blue-500/20 text-blue-500 rounded-md text-[9px] uppercase tracking-widest font-black shadow-sm overflow-hidden whitespace-nowrap"
                                            >
                                              New
                                            </motion.span>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                      <p className="text-sm text-on-surface font-semibold leading-relaxed mb-4">
                                        {rec.text || rec.ruleText}
                                      </p>
                                      {rec.reasoning && (
                                        <div className="mb-4 p-3 bg-surface-container/50 rounded-lg border border-outline-variant/30">
                                          <p className="text-xs text-text-secondary leading-relaxed italic">
                                            <span className="font-semibold not-italic text-on-surface/70">Context: </span>
                                            {rec.reasoning}
                                          </p>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-3">
                                        <button
                                          onClick={() =>
                                            handleRecAction(rec.id, "add")
                                          }
                                          className="flex-1 bg-primary text-white font-bold text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                                        >
                                          Add Rule
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleRecAction(rec.id, "dismiss")
                                          }
                                          className="flex-1 bg-surface-container text-on-surface font-bold text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-surface-container-high transition-all"
                                        >
                                          Dismiss
                                        </button>
                                      </div>
                                    </motion.div>
                                  ))}
                                </AnimatePresence>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {activeTab === "commands" && (
              <div className="w-full">
                <Suspense fallback={<div>Loading...</div>}>
                  <CommandsGuide />
                </Suspense>
              </div>
            )}

            {activeTab === "onboarding" && (
              <div className="w-full">
                <Suspense fallback={<div>Loading...</div>}>
                  <RolesManager />
                </Suspense>
              </div>
            )}

            {activeTab === "custom_commands" && (
              <div className="w-full">
                <Suspense fallback={<div>Loading...</div>}>
                  <CustomCommandsBuilder />
                </Suspense>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
