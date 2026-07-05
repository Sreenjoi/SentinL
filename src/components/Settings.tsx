import React, { useState, useEffect } from "react";
import { EmptyState, CompactEmptyState } from './EmptyState';
import { useLocation, useNavigate } from 'react-router-dom';
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
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
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
  RefreshCw
} from "lucide-react";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { motion, AnimatePresence } from "motion/react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useSaveState } from "../hooks/useSaveState";
import { RoleSelector } from "./RoleSelector";
import { ChannelSelector } from "./ChannelSelector";

import { Select } from "./Select";
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

interface Rule {
  id: string;
  text: string;
  createdAt: string;
}

import CommandsGuide from "./CommandsGuide";
import CustomCommandsBuilder from "./CustomCommandsBuilder";
import RolesManager from "./RolesManager";
import { toast } from "sonner";

const SUGGESTED_RULES = [
  {
    id: "banter-exemption",
    text: "The Banter Exemption: Understand that close friends often insult each other using harsh slang or profanity as a form of affection. Look for contextual markers like 'lol', 'bro', emojis, or playful replies. If the tone suggests a mutual inside joke rather than genuine hostility, do NOT flag it as toxic.",
  },
  {
    id: "situational-frustration",
    text: "Gaming vs. Personal Rage: Distinguish between situational frustration and targeted harassment. Screaming 'this game is f***ing garbage' or 'I am going to kill this boss' is acceptable gaming rage. Screaming 'you are f***ing garbage' at a teammate is a punishable personal attack.",
  },
  {
    id: "sarcasm-nuance",
    text: "Passive Aggressive Sarcasm: Be extremely careful interpreting aggressive language wrapped in sarcasm. Statements like 'Wow, you're an absolute genius' can be more toxic if said repeatedly to demean someone making a mistake, than generalized profanity.",
  },
  {
    id: "self-deprecation",
    text: "Self-Deprecation Identification: Do not penalize users for insulting themselves. Phrases like 'I am so stupid today it hurts' or 'I hate myself for missing that shot' should be entirely ignored, whereas matching phrases directed at another user remain toxic violations.",
  },
  {
    id: "veiled-threats",
    text: "Passive-Aggressive & Veiled Threats: Flag indirect threats that try to bypass basic word filters. For example, 'You'd better watch your back when you log off' or 'I know where you live' must be recognized as high-severity violence threats even if they contain zero profanity.",
  },
  {
    id: "reclaimed-slang",
    text: "Reclaimed & Generational Slang: Consider the cultural and linguistic nuance of certain groups using traditionally derogatory terms in a reclaimed or casual context. Evaluate if the intent is affectionate within a group, lacking malicious intent toward marginalized identities.",
  },
];

export default function Settings() {
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
    maxSlots,
    refreshAccess, isPro} = useServer();

  const [optimisticActive, setOptimisticActive] = useState<boolean | null>(null);

  const isCurrentlyActiveGlobally = isServerActiveGlobally;
  const isCurrentlyActiveInProfile = activeServerIds.includes(selectedServerId || "");
  const isCurrentlyActive = optimisticActive !== null ? optimisticActive : isServerActiveGlobally;
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
  const { isSaved, setIsSaved, hasChanges, resetSaveState, updateBaseline } = useSaveState(settings);
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
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [showUnclaimConfirm, setShowUnclaimConfirm] = useState(false);
  const [showKickConfirm, setShowKickConfirm] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);

  const isOwnedByMe = userSubscription?.linkedServerIds?.includes(selectedServerId) || serverClaimedBy === user?.email;

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      added: string[];
      updated: string[];
      failed: { name: string; error: string }[];
    };
  } | null>(null);

  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "general" | "dna" | "commands" | "onboarding" | "custom_commands"
  >(() => {
    const hash = location.hash.replace("#", "");
    if (["general", "dna", "commands", "onboarding", "custom_commands"].includes(hash)) {
      return hash as any;
    }
    return "general";
  });
  const [dnaTab, setDnaTab] = useState<"rules" | "suggestions">("rules");
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [addingRules, setAddingRules] = useState<
    Record<string, "idle" | "loading" | "added">
  >({});

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (["general", "dna", "commands", "onboarding", "custom_commands"].includes(hash)) {
      setActiveTab(hash as any);
    }
  }, [location.hash]);

  useEffect(() => {
    if (!selectedServerId || !isPro) return;
    const unsub = onSnapshot(
      query(
        collection(db, "recommendations"),
        where("serverId", "in", [selectedServerId, "global"]),
        where("status", "==", "pending")
      ),
      (snap) => {
        const recs: any[] = [];
        snap.forEach((d) => {
          recs.push({ id: d.id, ...d.data() });
        });
        setRecommendations(
          recs.sort(
            (a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()
          )
        );
      }, (err) => console.error(err)
    );
    return () => unsub();
  }, [selectedServerId, isPro]);

  useEffect(() => {
    // Only clear ERRORS after a timeout.
    // Keep the "Synced" success state visible so the user knows it's done.
    if (syncResult && !syncResult.success) {
      const timer = setTimeout(() => setSyncResult(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [syncResult]);

  const handleSyncCommands = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await user?.getIdToken();
      const res = await fetch(`/api/register-commands?serverId=${selectedServerId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
        setSyncResult({ 
          success: data.success, 
          message: "Commands synced!",
          details: data.details
        });
        
        if (data.details.added.length > 0) {
          toast.success(`Added ${data.details.added.length} commands: ${data.details.added.join(', ')}`);
        }
        if (data.details.updated.length > 0) {
          toast.success(`Updated ${data.details.updated.length} commands: ${data.details.updated.join(', ')}`);
        }
        if (data.details.failed.length > 0) {
          data.details.failed.forEach((f: any) => {
            toast.error(`Failed to register /${f.name}: ${f?.error}`);
          });
        }
      } else if (data.success) {
        setSyncResult({ success: true, message: "Commands synced!" });
      } else {
        setSyncResult({
          success: false,
          message: data?.error || "Unknown error",
        });
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

    const fetchSettings = async () => {
      const docRef = doc(db, `servers/${selectedServerId}`);
      const docSnap = await getDoc(docRef);
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
          healthWidget: data.healthWidget || { enabled: false, channelId: "" },
        };
        setSettings(newSettings);
        resetSaveState(newSettings);
        if (data.lastCommandSync) {
          setSyncResult({ success: true, message: "Commands synced!" });
        }
      }

      const subRef = doc(db, `subscriptions/${selectedServerId}`);
      const subSnap = await getDoc(subRef);
      if (subSnap.exists()) {
        setSubscription(subSnap.data());
      }

      setLoading(false);
    };

    fetchSettings();

    auth.currentUser?.getIdToken().then(token => {
      fetch(`/api/discord/roles/${selectedServerId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : { roles: [] })
        .then(data => data.roles && setDiscordRoles(data.roles))
        .catch(console.error);

      fetch(`/api/discord/channels/${selectedServerId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : { channels: [] })
        .then(data => data.channels && setDiscordChannels(data.channels))
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
        handleFirestoreError(error, OperationType.GET, `subscriptions/${user.uid}`);
      }
    );

    const q = query(collection(db, `servers/${selectedServerId}/rules`));
    const unsubscribe = onSnapshot(q, {
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
        handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/rules`);
      },
    });

    return () => {
      unsubscribe();
      unsubUserSub();
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
          "Authorization": `Bearer ${token}`
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
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Connection restored! Bot is ${data.active ? 'active' : 'present but inactive'}.`);
        if (data.active && !optimisticActive) {
          setOptimisticActive(true);
        }
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
      const modRef = doc(db, "moderators", user.email);
      const serverRef = doc(db, "servers", selectedServerId);

      if (isCurrentlyActive) {
        setOptimisticActive(false);

        const res = await fetch(`/api/guilds/${selectedServerId}/activation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ active: false })
        });
        
        if (!res.ok) {
          const errData = await res.json();
          setOptimisticActive(true);
          setActivationError(errData.error || "Failed to deactivate server.");
          setToggling(false);
          return;
        }

        // Backend succeeded, now update Firestore locally if needed, or rely on backend
        const newIds = activeServerIds.filter((id) => id !== selectedServerId);
        await setDoc(
          modRef,
          { activeServerIds: newIds, activeServerId: newIds[0] || null },
          { merge: true },
        );
      } else {
        // Activate this server
        if (!isOwnedByMe && !isSharedServer) {
          setActivationError("You must claim this server first before activating.");
          setToggling(false);
          return;
        }
        // Shared server moderators can activate but not claim, which is fine

        let isBetaTest = false;
        const serverSubSnap = await getDoc(doc(db, "server_subscriptions", selectedServerId));
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
          const permRes = await fetch(`/api/discord/permissions/${selectedServerId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await permRes.json();
          if (data && data.permissions) {
            const requiredPerms = ["SendMessages", "ManageRoles", "ManageMessages", "ReadMessageHistory"];
            const missing = requiredPerms.filter(p => !data.permissions[p]);
            if (missing.length > 0) {
              setActivationError(`Missing permissions: ${missing.join(", ")}. Please update Bot's role in Discord Server settings.`);
              setToggling(false);
              return;
            }
          }
        } catch (err) {
          console.error("Failed to check bot permissions", err);
        }

        setOptimisticActive(true);
        const res = await fetch(`/api/guilds/${selectedServerId}/activation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ active: true })
        });

        if (!res.ok) {
          const errData = await res.json();
          setOptimisticActive(false);
          setActivationError(errData.error || "Failed to activate server.");
          setToggling(false);
          return;
        }

        const newIds = Array.from(new Set([...activeServerIds, selectedServerId]));
        await setDoc(
          modRef,
          { activeServerIds: newIds, activeServerId: newIds[0] || null },
          { merge: true },
        );
      }

      await refreshAccess();
    } catch (err) {
      console.error("Error toggling activation:", err);
      handleFirestoreError(err, OperationType.WRITE, `servers/${selectedServerId}`);
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
        "Unauthorized: You do not have Manage Server permissions for this guild.",
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
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          userId: user.uid,
          discordId: discordProfile.id,
          serverName: authorizedServers.find((s) => s.id === selectedServerId)?.name || "",
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
          "Authorization": `Bearer ${token}`
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
      await setDoc(doc(db, `servers/${selectedServerId}`), settings, {
        merge: true,
      });
      setIsSaved(true);
    } catch (error) {
      console.error("Error saving settings:", error);
      handleFirestoreError(error, OperationType.WRITE, `servers/${selectedServerId}`);
      toast.error("Failed to save settings.");
    }
    setSaving(false);
  };

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim() || !selectedServerId) return;

    const trimmed = newKeyword.trim();
    // Prevent duplicates
    if (!settings.keywords.includes(trimmed)) {
      const updatedKeywords = [...settings.keywords, trimmed];
      setSettings((prev) => ({
        ...prev,
        keywords: updatedKeywords,
      }));
      setNewKeyword("");
      
      try {
        await setDoc(doc(db, `servers/${selectedServerId}`), { keywords: updatedKeywords }, { merge: true });
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
    const updatedKeywords = settings.keywords.filter((k) => k !== keywordToRemove);
    setSettings((prev) => ({
      ...prev,
      keywords: updatedKeywords,
    }));
    
    try {
      await setDoc(doc(db, `servers/${selectedServerId}`), { keywords: updatedKeywords }, { merge: true });
      toast.success("Keyword removed");
    } catch (error) {
      console.error("Error removing keyword:", error);
      toast.error("Failed to remove keyword");
    }
  };

  const handleToggleAutoDelete = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedServerId) return;
    const isChecked = e.target.checked;
    setSettings((prev) => ({
      ...prev,
      autoDeleteOnKeywordMatch: isChecked,
    }));
    updateBaseline((old: any) => ({ ...old, autoDeleteOnKeywordMatch: isChecked }));
    
    try {
      await setDoc(doc(db, `servers/${selectedServerId}`), { autoDeleteOnKeywordMatch: isChecked }, { merge: true });
      toast.success("Setting updated");
    } catch (error) {
      console.error("Error updating setting:", error);
      toast.error("Failed to update setting");
      setSettings((prev) => ({
        ...prev,
        autoDeleteOnKeywordMatch: !isChecked,
      }));
      updateBaseline((old: any) => ({ ...old, autoDeleteOnKeywordMatch: !isChecked }));
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
      handleFirestoreError(error, OperationType.WRITE, `servers/${selectedServerId}/rules`);
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
      toast.success("Rule added successfully!");
    } catch (err: any) {
      console.error(err);
      setAddingRules((prev) => ({ ...prev, [ruleId]: "idle" }));
      toast.error(err.message || "Failed to add rule. Please try again.");
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!selectedServerId) return;
    try {
      await deleteDoc(doc(db, `servers/${selectedServerId}/rules`, ruleId));
    } catch (error) {
      console.error("Error deleting rule:", error);
      handleFirestoreError(error, OperationType.DELETE, `servers/${selectedServerId}/rules`);
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
           {[1,2,3,4,5].map(i => (
             <div key={i} className="h-10 w-32 bg-surface-container rounded-xl"></div>
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
    const clientId =
      import.meta.env.VITE_DISCORD_CLIENT_ID || "CLIENT_ID_PENDING";
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=1376805710918&scope=bot%20applications.commands`;

    return (
      <EmptyState
        title="No servers found"
        description={!discordProfile 
          ? "Connect your Discord account to sync your servers using the button on the top right."
          : "Invite SentinL to your server to get started."}
      >
        {discordProfile ? (
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

  const clientId =
    import.meta.env.VITE_DISCORD_CLIENT_ID || "CLIENT_ID_PENDING";
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=1376805710918&scope=bot%20applications.commands`;

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface mb-2">
            Bot Settings
          </h1>
          <p className="text-text-secondary font-medium max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed">
            Configure server moderation settings, view community DNA and custom
            commands.
          </p>
        </div>

        {tier !== "free" && (
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                {isBetaTester
                  ? "PRO (Beta Test Server) Active"
                  : userSubscription?.status === "trial" || subscription?.status === "trial" || isTrial
                  ? "Trial Active"
                  : isSharedServer && (tier === "premium" || tier === "pro_3" || tier === "pro_1")
                  ? "PRO (Shared) Active"
                  : tier === "premium" || tier === "pro_3" || tier === "pro_1"
                  ? "PRO Subscription Active"
                  : "PRO Subscription Active"}
              </span>
            </div>
            {((isBetaTester && subscription?.expiresAt) || 
              (userSubscription?.trialEnd || subscription?.trialEnd || userSubscription?.expiresAt || subscription?.expiresAt)) ? (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[9px] font-bold text-text-secondary/70 uppercase tracking-wider">
                  Active till{" "}
                  {isBetaTester && subscription?.expiresAt
                    ? new Date(subscription.expiresAt).toLocaleDateString()
                    : (userSubscription?.status === "trial" || subscription?.status === "trial" || isTrial) && (userSubscription?.trialEnd || subscription?.trialEnd)
                    ? new Date((userSubscription?.trialEnd || subscription?.trialEnd) as string).toLocaleDateString()
                    : new Date((userSubscription?.expiresAt || subscription?.expiresAt) as string).toLocaleDateString()}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </header>

      {/* Activation Status Banner */}
      <div className="bg-white/60 backdrop-blur-md border border-white/40 rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 shadow-xl shadow-primary/5">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="relative flex items-center justify-center shrink-0">
            {/* Breathing Backglow */}
            {isCurrentlyActive && (
              <div className="absolute inset-0 rounded-2xl bg-success/10 border border-success/20 shadow-[0_0_10px_rgba(34,197,94,0.25)] animate-pulse [animation-duration:3s]"></div>
            )}
            {/* Main Icon Container */}
            <div
              className={`relative z-10 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 border ${isCurrentlyActive ? "bg-white/10 border-success/20 shadow-inner backdrop-blur-sm" : "bg-danger/20 border-danger/20 shadow-inner"}`}
            >
              <Power
                className={`w-6 h-6 sm:w-7 sm:h-7 ${isCurrentlyActive ? "text-success drop-shadow-md" : "text-danger"}`}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg sm:text-xl font-extrabold text-on-surface tracking-tight leading-tight">
                Bot Activation Status
              </h3>
              <button
                onClick={handleForceSync}
                disabled={syncingBot}
                className={`p-1.5 rounded-full transition-all duration-300 ease-out active:scale-95 disabled:opacity-50 shadow-sm
                  ${isCurrentlyActive 
                    ? "bg-success/10 text-success hover:bg-success hover:text-white border border-success/20" 
                    : "bg-surface border border-outline-variant/30 text-text-secondary hover:text-on-surface hover:bg-surface-hover"}`}
                title="Sync Connection Status"
              >
                <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${syncingBot ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs sm:text-sm font-bold text-text-secondary mt-1 flex flex-col">
              <span>
                {isCurrentlyActive
                  ? "Bot is currently Active"
                  : "Bot is currently Inactive"}
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest opacity-60 mt-1">
                Utilization: {activeQuotaCount}/{maxSlots} Active Servers
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-start gap-2 w-full xl:w-auto mt-4 xl:mt-0">
          {/* 1. Claim/Unclaim */}
          {discordProfile && (
            <div className="flex flex-col items-center shrink-0">
              {isSharedServer ? (
                <button
                  disabled
                  className="px-4 py-2 shrink-0 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/10 border border-primary/30 text-primary opacity-80 cursor-not-allowed shadow-sm"
                >
                  Shared
                </button>
              ) : isOwnedByMe ? (
                <>
                  {showUnclaimConfirm ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-danger font-bold uppercase hidden sm:inline">
                        Sure?
                      </span>
                      <button
                        disabled={claiming}
                        onClick={() => {
                          setShowUnclaimConfirm(false);
                          handleUnclaimServer();
                        }}
                        className="px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-danger text-white hover:opacity-90 transition-all duration-300 ease-out shadow-md active:scale-95 disabled:opacity-50"
                      >
                        {claiming ? "Wait..." : "Yes"}
                      </button>
                      <button
                        disabled={claiming}
                        onClick={() => setShowUnclaimConfirm(false)}
                        className="px-3 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 text-on-surface hover:bg-surface-container transition-all duration-300 ease-out"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={claiming}
                      onClick={() => setShowUnclaimConfirm(true)}
                      className="px-4 py-2 shrink-0 rounded-full text-[10px] font-black uppercase tracking-widest bg-success/10 border border-success/30 text-success hover:bg-success/20 transition-all duration-300 ease-out shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      Claimed
                    </button>
                  )}
                </>
              ) : (
                <button
                  disabled={claiming}
                  onClick={handleClaimServer}
                  className="px-4 py-2 shrink-0 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all duration-300 ease-out shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {claiming ? "..." : "1. Claim"}
                </button>
              )}
              <span className="text-[8px] text-text-secondary uppercase tracking-widest text-center mt-1.5 opacity-70 font-semibold whitespace-nowrap">
                Claim Server
              </span>
            </div>
          )}

          <ChevronRight className="w-4 h-4 text-text-secondary/30 shrink-0 mt-2" />

          {/* 2. Invite/Remove */}
          <div className="flex flex-col items-center shrink-0">
            {botGuilds.includes(selectedServerId) ? (
              <>
                {showKickConfirm ? (
                  <div className="flex items-center gap-1 shrink-0 px-2">
                    <span className="text-[10px] text-danger font-bold uppercase hidden sm:inline mr-1">
                      Remove?
                    </span>
                    <button
                      disabled={toggling}
                      onClick={() => {
                        setShowKickConfirm(false);
                        handleKickBot();
                      }}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-danger text-white hover:opacity-90 transition-all duration-300 ease-out shadow-md active:scale-95 disabled:opacity-50"
                    >
                      {toggling ? "Wait..." : "Yes"}
                    </button>
                    <button
                      disabled={toggling}
                      onClick={() => setShowKickConfirm(false)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-outline-variant/30 text-on-surface hover:bg-surface-container transition-all duration-300 ease-out"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKickConfirm(true)}
                    disabled={toggling}
                    className="px-4 py-2 shrink-0 rounded-full text-[10px] font-black uppercase tracking-widest border border-success/30 bg-success/10 text-success hover:bg-success/20 transition-all duration-300 ease-out shadow-sm flex items-center gap-1.5 active:scale-95"
                  >
                    Bot Deployed
                  </button>
                )}
              </>
            ) : (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-4 py-2 shrink-0 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out shadow-sm flex items-center gap-1.5 active:scale-95 ${!(isOwnedByMe || isSharedServer) ? "bg-[#5865F2]/5 text-[#5865F2]/50 cursor-not-allowed pointer-events-none border border-[#5865F2]/10" : "bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20 border border-[#5865F2]/20"}`}
                onClick={(e) => {
                  if (
                    !(
                      isOwnedByMe || isSharedServer
                    )
                  ) {
                    e.preventDefault();
                    toast("You must claim the server first.");
                  }
                }}
              >
                2. Invite
              </a>
            )}
            <span className="text-[8px] text-text-secondary uppercase tracking-widest text-center mt-1.5 opacity-70 font-semibold whitespace-nowrap">
              Invite bot to server
            </span>
          </div>

          <ChevronRight className="w-4 h-4 text-text-secondary/30 shrink-0 mt-2" />

          {/* 3. Activate/Deactivate */}
          <div className="flex flex-col items-center shrink-0 relative group">
            <button
              disabled={
                isSharedServer ||
                toggling ||
                !botGuilds.includes(selectedServerId)
              }
              onClick={handleToggleActive}
              className={`px-4 py-2 shrink-0 rounded-full text-[10px] font-black border uppercase tracking-widest transition-all duration-300 ease-out active:scale-95 flex items-center gap-1.5 ${!botGuilds.includes(selectedServerId) || (isSharedServer && !isCurrentlyActive) ? "bg-surface-container border-outline-variant/30 text-text-secondary/50 cursor-not-allowed" : isCurrentlyActive ? "bg-success/10 border-success/30 text-success hover:bg-success/20 shadow-sm" : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 shadow-sm"}`}
            >
              {toggling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Power className="w-3 h-3" />
              )}
              {isCurrentlyActive ? "Active" : "3. Activate"}
            </button>
            <span className="text-[8px] text-text-secondary uppercase tracking-widest text-center mt-1.5 opacity-70 font-semibold whitespace-nowrap">
              Activate Bot
            </span>

            {/* Tooltip for disabled state */}
            {activationError && (
               <div className="absolute top-12 left-1/2 -translate-x-1/2 w-48 bg-danger text-white text-[10px] p-2 rounded-lg text-center z-50 shadow-xl flex items-center gap-2">
                 <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-danger rotate-45"></div>
                 <span className="font-semibold leading-tight">{activationError}</span>
                 <button onClick={() => setActivationError(null)} className="ml-auto hover:opacity-75 transition-opacity px-1"><span className="sr-only">Close</span>✕</button>
               </div>
            )}
            {isSharedServer ? (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 w-48 bg-gray-900 text-white text-xs p-2 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out text-center z-50 shadow-xl pointer-events-none">
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                This server's billing and activation are managed by the owner.
              </div>
            ) : (
              !botGuilds.includes(selectedServerId) && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-48 bg-gray-900 text-white text-xs p-2 rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 ease-out text-center z-50 shadow-xl pointer-events-none">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  Please complete <strong>Step 2. Invite</strong> and ensure the
                  bot has joined your server before activating.
                </div>
              )
            )}
          </div>

          <ChevronRight className="w-4 h-4 text-text-secondary/30 shrink-0 mt-2" />

          {/* 4. Sync Commands */}
          <div className="flex flex-col items-center shrink-0 relative">
            <button
              disabled={syncing || !isCurrentlyActive}
              onClick={handleSyncCommands}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 ease-out active:scale-95 flex items-center gap-1.5 ${!isCurrentlyActive ? "bg-surface-container border-outline-variant/30 text-text-secondary/50 cursor-not-allowed" : syncResult?.success ? "border-success/30 bg-success/10 text-success shadow-sm" : "border-outline-variant/30 text-on-surface hover:bg-white/50 shadow-sm"}`}
            >
              {syncing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>...</span>
                </>
              ) : syncResult?.success ? (
                <>
                  <ListChecks className="w-3 h-3" />
                  <span>Synced</span>
                </>
              ) : (
                <>
                  <Activity className="w-3 h-3" />
                  <span>4. Sync</span>
                </>
              )}
            </button>
            {syncResult && (
              <motion.span
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`absolute -bottom-4 text-[8px] whitespace-nowrap font-black uppercase tracking-widest ${syncResult.success ? "text-success" : "text-danger"}`}
              >
                {syncResult.success ? "Success" : "Failed"}
              </motion.span>
            )}
            <span className="text-[8px] text-text-secondary uppercase tracking-widest text-center mt-1.5 opacity-70 font-semibold whitespace-nowrap">
              Sync Slash Commands
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface-container/50 p-1.5 rounded-2xl w-fit border border-outline-variant/10">
        {[
          { id: "general", label: "General Settings" },
          { id: "dna", label: "Community DNA" },
          { id: "commands", label: "Command List" },
          { id: "onboarding", label: "Roles & Onboarding" },
          {
            id: "custom_commands",
            label: (
              <span className="flex items-center gap-1.5">
                Custom Commands
                {(!isPro) && (
                  <span
                    className={`ml-auto text-[8px] px-1.5 py-0.5 rounded font-bold ${
                      activeTab === "custom_commands"
                        ? "bg-white/20 text-white"
                        : "bg-surface-variant/50 text-text-secondary/80"
                    }`}
                  >
                    PRO
                  </span>
                )}
              </span>
            ),
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(
                tab.id as
                  | "general"
                  | "dna"
                  | "commands"
                  | "onboarding"
                  | "custom_commands",
              );
            }}
            className={`relative px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center gap-2.5 ${
              activeTab === tab.id
                ? "text-white"
                : (!isPro) && tab.id === "custom_commands"
                  ? "text-text-secondary/60 hover:text-text-secondary/80 hover:bg-surface-container/40 opacity-60"
                  : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
            }`}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="settings-active-tab"
                className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2.5">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {activeTab === "general" && (
          <div className="w-full border border-white/40 bg-white/80 backdrop-blur-md rounded-[2.5rem] overflow-hidden shadow-xl shadow-primary/5">
            <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30">
              <h2 className="text-xl font-extrabold text-on-surface tracking-tight">
                General Settings
              </h2>
              <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">
                Basic configuration for your server bot.
              </p>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-8">
              <div>
                <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1">
                  Language
                </label>
                <Select
                  value={settings.language}
                  onChange={(val) => setSettings({ ...settings, language: val })}
                  options={languages.map((lang) => ({ value: lang.code, label: `${lang.native} (${lang.name})` }))}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1 flex items-center justify-between">
                  <div>
                    Moderator Role
                    <Tooltip text="Users with this role bypass AI analysis and can execute moderator-level slash commands on this bot." />
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
                  Users with this role are authorized to run moderator-only
                  commands.
                </p>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest ml-1 flex items-center justify-between">
                  <div>
                    Log Channel
                    <Tooltip text="The ID of a private channel where SentinL will summarize incidents, flagged messages, and AI decisions." />
                  </div>
                </label>
                <ChannelSelector
                  channels={discordChannels}
                  value={settings.logChannelId}
                  onChange={(val) => setSettings({ ...settings, logChannelId: val })}
                  placeholder="Select log channel..."
                />
                <p className="text-[10px] text-text-secondary mt-2 ml-1 opacity-70">
                  Bot will post moderation logs and AI analysis reports to this
                  channel.
                </p>
              </div>

              <div className="pt-6 border-t border-outline-variant/20">
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
    <div className="flex flex-wrap items-center gap-1 bg-surface-container/50 p-1 rounded-2xl w-fit border border-outline-variant/10 ml-2">
      <button
        onClick={() => setDnaTab("rules")}
        className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out ${
          dnaTab === "rules"
            ? "text-primary"
            : "text-text-secondary/70 hover:text-primary hover:bg-white/50"
        }`}
      >
        {dnaTab === "rules" && (
          <motion.div
            layoutId="dna-tab-indicator"
            className="absolute inset-0 bg-white rounded-xl shadow-sm border border-outline-variant/10"
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative z-10">Custom Rules</span>
      </button>
      <button
        onClick={() => setDnaTab("suggestions")}
        className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out ${
          dnaTab === "suggestions"
            ? "text-primary"
            : "text-text-secondary/70 hover:text-primary hover:bg-white/50"
        }`}
      >
        {dnaTab === "suggestions" && (
          <motion.div
            layoutId="dna-tab-indicator"
            className="absolute inset-0 bg-white rounded-xl shadow-sm border border-outline-variant/10"
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          />
        )}
        <span className="relative z-10">Community DNA Suggestions</span>
      </button>
    </div>

    <AnimatePresence mode="wait">
      <motion.div
        key={dnaTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {dnaTab === "rules" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="flex flex-col gap-8 h-auto lg:h-[40rem]">
          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 shrink-0">
            <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary border border-primary/10">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-extrabold text-on-surface tracking-tight">
                  Custom Rules
                  <Tooltip text="Describe what is and isn't allowed in standard English. SentinL's AI will comprehend these nuances and moderate users accordingly." />
                </h2>
              </div>
            </div>
            <div className="p-8">
              <form onSubmit={handleAddRule} className="flex gap-4">
                <input
                  type="text"
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  placeholder="e.g. No toxicity please"
                  className="flex-1 min-w-0 bg-surface-container/50 border border-outline-variant/30 rounded-2xl px-5 py-4 text-sm text-on-surface placeholder:text-text-secondary/40 focus:outline-none focus:border-primary/50 focus:bg-white transition-all duration-300 ease-out shadow-inner font-medium"
                />
                <button
                  type="submit"
                  className="px-6 py-4 rounded-2xl bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all duration-300 ease-out shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 flex items-center shrink-0 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Apply
                </button>
              </form>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 flex-1 min-h-0">
            <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30 flex justify-between items-center shrink-0">
              <div>
                <h2 className="text-xl font-extrabold text-on-surface tracking-tight">
                  Keyword Pre-Filter
                  <Tooltip text="A hardcoded list of forbidden words. If a message contains these, it's flagged and dealt with immediately, skipping the AI analysis." />
                </h2>
                <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">
                  Configured keywords block messages before hitting AI.
                </p>
              </div>
            </div>
            <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1">
                  Add Keyword
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
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
                  {settings.keywords && settings.keywords.length > 0 ? (
                    settings.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high border border-outline-variant/20 text-xs font-semibold text-on-surface group"
                      >
                        {kw}
                        <button
                          onClick={() => handleRemoveKeyword(kw)}
                          className="text-text-secondary group-hover:text-danger focus:text-danger transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-text-secondary/60 italic font-medium">
                      No keywords configured
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
                      checked={settings.autoDeleteOnKeywordMatch}
                      onChange={handleToggleAutoDelete}
                      className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                    />
                    <div
                      className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.autoDeleteOnKeywordMatch ? "bg-primary border-primary shadow-md shadow-primary/20" : "bg-surface-container border-outline-variant peer-hover:border-primary/50"}`}
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
                      Auto-Delete on Keyword Match
                    </label>
                    <span className="text-[10px] text-text-secondary mt-1">
                      Automatically deletes messages that contain any active filter keywords, without invoking extreme threshold AI reasoning.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 h-auto lg:h-[40rem]">
          <div className="px-8 py-6 border-b border-outline-variant/20 bg-surface-container/30 shrink-0">
            <div className="flex justify-between items-center bg-primary/10 text-primary px-4 py-3 rounded-2xl border border-primary/20 mb-4 shadow-inner">
              <div className="flex items-center gap-3">
                <Brain className="w-5 h-5 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-widest">
                  AI Context Model
                </span>
              </div>
              <span className="text-[10px] uppercase font-black bg-primary/20 text-primary px-2 py-1 rounded-lg">
                Active
              </span>
            </div>
            <p className="text-xs text-text-secondary font-medium leading-relaxed mb-6">
              The AI uses these rules, alongside built-in moderation
              heuristics, to evaluate messages. Each rule acts as a "law." The
              AI is strict about enforcing them but retains contextual
              understanding (e.g., distinguishing between a joke and an
              attack).
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-lg bg-surface-container border border-outline-variant/30 text-[10px] font-black uppercase text-text-secondary tracking-widest flex items-center gap-2">
                Rules config
                <span className="w-5 h-5 bg-white rounded-md flex items-center justify-center text-primary shadow-sm border border-outline-variant/10">
                  {rules.length}
                </span>
              </span>
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
                    Add standard rules here to instruct the AI moderation model on what is strictly forbidden.
                  </p>
                </div>
              ) : (
                rules.map((rule) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={rule.id}
                    className="group flex gap-4 p-4 rounded-xl border border-outline-variant/20 bg-surface/50 hover:bg-white hover:border-primary/30 transition-all duration-300 ease-out"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 shadow-inner group-hover:bg-primary/5 transition-colors">
                      <Gavel className="w-4 h-4 text-primary opacity-70" />
                    </div>
                    <div className="flex-1 pt-1.5 min-w-0">
                      <p className="text-sm text-on-surface font-medium leading-relaxed break-words">
                        {rule.text}
                      </p>
                    </div>
                    {ruleToDelete === rule.id ? (
                      <div className="flex gap-2 shrink-0 h-fit mt-0.5">
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
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
        <div className="flex flex-col gap-8">
          {/* Pre-written Suggestions */}
          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 p-8">
            <div className="flex flex-col gap-2 mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner border border-primary/10">
                  <Wand2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-extrabold text-on-surface tracking-tight">
                  Pre-Written Suggestions
                </h3>
              </div>
              <p className="text-sm text-text-secondary pl-14">
                Populate your server's legal framework with pre-written,
                AI-optimized rules that handle sarcasm, banter, and veiled
                threats perfectly out of the box.
              </p>
            </div>
            <div className="space-y-4">
              {SUGGESTED_RULES.map((rule) => {
                const isRuleAdded = rules.map(r => r.text.trim().toLowerCase()).includes(rule.text.trim().toLowerCase());
                
                return (
                  <div
                    key={rule.id}
                    className="p-5 rounded-2xl border border-outline-variant/20 bg-surface-container/20 group hover:bg-white hover:border-primary/30 transition-all duration-300 ease-out"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-on-surface font-medium leading-relaxed">
                        <strong className="text-primary group-hover:underline block mb-1">
                          {rule.text.split(":")[0]}:
                        </strong>
                        {rule.text.split(":").slice(1).join(":")}
                      </p>
                      <button
                        title="Add Suggested Rule"
                        onClick={() => addSuggestionRule(rule.id, rule.text)}
                        disabled={
                          addingRules[rule.id] === "loading" ||
                          addingRules[rule.id] === "added" ||
                          isRuleAdded ||
                          !isPro
                        }
                        className={`h-10 px-4 rounded-xl font-black text-xs uppercase tracking-widest shrink-0 transition-all duration-300 ease-out border flex items-center justify-center shadow-inner ${
                          isRuleAdded || addingRules[rule.id] === "added"
                            ? "bg-primary text-white border-primary cursor-default opacity-80"
                            : "bg-surface-container-high text-on-surface border-outline-variant/30 hover:bg-primary hover:text-white hover:border-primary hover:shadow-primary/20 disabled:opacity-50 disabled:hover:bg-surface-container-high disabled:hover:text-on-surface disabled:cursor-not-allowed"
                        }`}
                      >
                        {addingRules[rule.id] === "loading" ? (
                          <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        ) : isRuleAdded || addingRules[rule.id] === "added" ? (
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4" /> Added
                          </div>
                        ) : (
                          "Add"
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* AI Recommended Rules based on Analysis */}
          <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5 p-8">
            <div className="flex flex-col mb-8 gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 shadow-inner border border-orange-500/10">
                  <Brain className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-extrabold text-on-surface tracking-tight">
                  AI Context Recommendations
                </h3>
              </div>
              <p className="text-sm text-text-secondary pl-14 leading-relaxed">
                Rules dynamically generated by observing your moderators' behaviour over the past week. (Requires continuous Pro subscription and high volume of false flags)
              </p>
            </div>

            <div className="space-y-4">
              {!isPro ? (
                <div className="p-10 rounded-3xl border border-primary/10 bg-gradient-to-b from-primary/5 to-transparent flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden">
                  <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] pointer-events-none text-primary">
                    <Brain className="w-48 h-48" />
                  </div>
                  <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center mb-5 shadow-sm border border-outline-variant/30 text-primary/70">
                    <Lock className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-extrabold text-on-surface tracking-tight mb-2">Pro Feature Locked</h4>
                  <p className="text-sm text-text-secondary font-medium max-w-md mx-auto leading-relaxed">
                    Upgrade to SentinL Pro to unlock dynamic, AI-generated community rule recommendations based on your moderation history.
                  </p>
                </div>
              ) : recommendations.length === 0 ? (
                <div className="p-10 rounded-3xl border border-outline-variant/20 bg-surface-container/30 flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center mb-5 border border-outline-variant/20 text-text-secondary/60 shadow-inner">
                    <Brain className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-extrabold text-on-surface tracking-tight mb-2">Awaiting Training Data</h4>
                  <p className="text-sm text-text-secondary mt-1 max-w-md mx-auto font-medium leading-relaxed">
                    Our models need more manual interventions (False Positives/Negatives via <code className="bg-surface-container px-1 py-0.5 rounded text-xs">/train</code>) from your moderators to identify patterns and generate rules.
                  </p>
                </div>
              ) : (
                <AnimatePresence>
                  {recommendations.map((rec) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, scale: 0.95, margin: 0, overflow: "hidden" }}
                      key={rec.id}
                      className="p-5 rounded-2xl border border-primary/20 bg-primary/5 shadow-inner"
                    >
                      <span className="px-2 py-1 bg-white text-primary rounded-md text-[9px] uppercase tracking-widest font-black shadow-sm mb-3 inline-block">
                        {rec.type || "Context Shift"}
                      </span>
                      <p className="text-sm text-on-surface font-semibold leading-relaxed mb-4">
                        {rec.text}
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleRecAction(rec.id, "add")}
                          className="flex-1 bg-primary text-white font-bold text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRecAction(rec.id, "dismiss")}
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
            <CommandsGuide />
          </div>
        )}

        {activeTab === "onboarding" && (
          <div className="w-full">
            <RolesManager />
          </div>
        )}

        {activeTab === "custom_commands" && (
          <div className="w-full">
            <CustomCommandsBuilder />
          </div>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
