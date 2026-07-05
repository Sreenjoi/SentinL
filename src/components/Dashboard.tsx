import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  deleteDoc,
  deleteField,
  documentId,
  or,
  and,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useServer } from "../context/ServerContext";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { CopyableId } from "./CopyableId";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  AlertTriangle,
  Clock,
  CheckCircle,
  ChevronRight,
  Users,
  MessageSquare,
  Activity,
  BarChart3,
  Settings,
  Zap,
  Link as LinkIcon,
  Trophy,
  Flag,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  Loader2,
  Crown,
  Star,
  FileText,
  Hash,
  Sparkles,
  ArrowRight,
  Bell,
  Target,
  Swords,
  Heart,
  FlameKindling,
  BadgeCheck,
  LayoutDashboard,
  Trash2,
  ListChecks,
} from "lucide-react";
import { Logo } from "./Logo";
import { toast } from "sonner";
import { HeaderMetaPills } from "./BrandedPageHeader";
import { getPlanDisplayLabel } from "../utils/planDisplay";

interface PendingFlag {
  id: string;
  messageId?: string;
  authorUsername: string;
  authorAvatar?: string;
  content: string;
  level: string;
  confidence: number;
  timestamp: any;
  flaggedAt?: any;
  channelId: string;
}

interface PendingReport {
  id: string;
  reporterId?: string;
  reporterUsername?: string;
  reportedUser?: string;
  reportedUserId?: string;
  reportedUsername?: string;
  targetId?: string;
  targetUsername?: string;
  reason: string;
  timestamp: any;
  status: string;
}

interface TopOffender {
  id: string;
  username: string;
  score: number;
  avatar?: string;
  authorUsername?: string;
  authorAvatar?: string;
}

interface RecentAction {
  id: string;
  authorUsername: string;
  authorId?: string;
  level: string;
  actionTaken: string;
  timestamp: any;
  detectionMethod?: string;
  reason?: string;
}

// Returns color class based on flag severity level
function levelColor(level: string): string {
  switch (level) {
    case "Extreme":
      return "text-red-600 bg-red-50 border-red-200";
    case "Inappropriate":
      return "text-orange-600 bg-orange-50 border-orange-200";
    case "Moderate":
      return "text-yellow-600 bg-yellow-50 border-yellow-200";
    case "Spam":
      return "text-blue-600 bg-blue-50 border-blue-200";
    default:
      return "text-text-secondary bg-surface-container border-outline-variant/30";
  }
}

// Returns action label for display
function actionLabel(action: string): string {
  switch (action) {
    case "auto_deleted":
      return "Auto-deleted";
    case "ban":
      return "Banned";
    case "timeout":
      return "Timed out";
    case "warn":
      return "Warned";
    case "deleted":
      return "Deleted";
    default:
      return "Resolved";
  }
}

// Returns health grade color
function gradeColor(grade: string): string {
  if (grade === "A+" || grade === "A") return "text-success";
  if (grade === "B") return "text-yellow-600";
  if (grade === "C") return "text-danger";
  return "text-text-secondary";
}

// Truncates text to maxLen characters with ellipsis
function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  return text.length > maxLen ? text.substring(0, maxLen) + "…" : text;
}

// Safely format time
function formatTime(ts: any): string {
  if (!ts) return "Just now";
  try {
    if (ts.toDate) return formatDistanceToNow(ts.toDate(), { addSuffix: true });
    if (ts.seconds)
      return formatDistanceToNow(new Date(ts.seconds * 1000), {
        addSuffix: true,
      });
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch (e) {
    return "Just now";
  }
}

function firestoreTimeToMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function discordSnowflakeToMillis(id?: string): number {
  if (!id || !/^\d+$/.test(id)) return 0;
  try {
    return Number((BigInt(id) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}

function pendingFlagSortMillis(flag: PendingFlag): number {
  return (
    firestoreTimeToMillis(flag.flaggedAt) ||
    discordSnowflakeToMillis(flag.messageId || flag.id) ||
    firestoreTimeToMillis(flag.timestamp)
  );
}

import { SentinLLoading } from "./SentinLLoading";
import { useSetupStatus } from "../hooks/useSetupStatus";

const SetupChecklist = lazy(() => import("./SetupChecklist").then(m => ({ default: m.SetupChecklist })));
const FirstRunSetupFlow = lazy(() => import("./FirstRunSetupFlow").then(m => ({ default: m.FirstRunSetupFlow })));

export default function Dashboard() {
  const navigate = useNavigate();
  const [user] = useAuthState(auth);

  const {
    selectedServerId,
    tier,
    isBetaTester,
    isTrial,
    botPermissions,
    activeQuotaCount,
    maxSlots,
    discordProfile,
    authorizedServers,
    isServerActiveGlobally,
    pendingFlagsCount,
    pendingReportsCount,
    isPro,
    dailyAICount,
    dailyAiLimit,
    isSharedServer,
    intentsWarning,
    botGuilds,
    loading: serverLoading,
    userTier,
    serverEntitlementExpiry,
    serverEntitlementStatus,
  } = useServer();

  // Data state
  const [pendingFlags, setPendingFlags] = useState<PendingFlag[]>([]);
  const pendingFlagsCountText = pendingFlagsCount.toString();
  const [pendingReports, setPendingReports] = useState<PendingReport[]>([]);
  const pendingReportsCountText = pendingReportsCount.toString();
  const [topOffenders, setTopOffenders] = useState<TopOffender[]>([]);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [healthData, setHealthData] = useState<any>(null);
  const [firstRunCompleted, setFirstRunCompleted] = useState(false);
  const [showSetupFlow, setShowSetupFlow] = useState(false);
  const [directServerSubscription, setDirectServerSubscription] = useState<any>(null);
  const [serverGrantExpiry, setServerGrantExpiry] = useState<any>(null);
  const [weeklyStats, setWeeklyStats] = useState({
    flags: 0,
    resolved: 0,
    blocked: 0,
  });
  const [loadingFlags, setLoadingFlags] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [filled, setFilled] = useState(false);
  const setupStatus = useSetupStatus();

  useEffect(() => {
    const t = setTimeout(() => setFilled(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!selectedServerId) {
      setDirectServerSubscription(null);
      setServerGrantExpiry(null);
      return;
    }

    const unsubServer = onSnapshot(
      doc(db, "servers", selectedServerId),
      (snap) => {
        setServerGrantExpiry(snap.exists() ? snap.data()?.betaExpiry || null : null);
      },
      () => setServerGrantExpiry(null),
    );

    const unsubSubscription = onSnapshot(
      doc(db, "subscriptions", selectedServerId),
      (snap) => {
        setDirectServerSubscription(snap.exists() ? snap.data() : null);
      },
      () => setDirectServerSubscription(null),
    );

    return () => {
      unsubServer();
      unsubSubscription();
    };
  }, [selectedServerId]);

  const parseDateLike = (value: any): Date | null => {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const serverPlanExpiry =
    parseDateLike(serverEntitlementExpiry) ||
    parseDateLike(directServerSubscription?.expiresAt) ||
    parseDateLike(directServerSubscription?.trialEnd) ||
    parseDateLike(serverGrantExpiry);
  const hasActiveExpiringPlan =
    !!tier && tier !== "free" && !!serverPlanExpiry && serverPlanExpiry.getTime() > Date.now();
  const serverPlanExpiryText = hasActiveExpiringPlan
    ? `${serverEntitlementStatus === "trial" || directServerSubscription?.status === "trial" ? "Trial ends" : "Plan expires"} ${serverPlanExpiry.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`
    : null;

  const effectiveHealthCount = healthData?.totalMessages || 0;

  // Effect 1 — Pending flags
  useEffect(() => {
    if (!selectedServerId) {
      setLoadingFlags(false);
      return;
    }
    setLoadingFlags(true);
    const q = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      where("status", "==", "pending"),
      orderBy("timestamp", "desc"),
      limit(25),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const flags = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as PendingFlag)
          .sort((a, b) => pendingFlagSortMillis(b) - pendingFlagSortMillis(a))
          .slice(0, 5);
        setPendingFlags(flags);
        setLoadingFlags(false);
      },
      (error) => {
        console.error("flaggedMessages snapshot error:", error);
        setLoadingFlags(false);
      }
    );
    return () => {
      unsub();
    };
  }, [selectedServerId]);

  // Effect 2 — Pending reports
  useEffect(() => {
    if (!selectedServerId) return;
    const q = query(
      collection(db, `servers/${selectedServerId}/reports`),
      where("status", "==", "pending"),
      orderBy("timestamp", "desc"),
      limit(5),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPendingReports(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PendingReport),
      );
    }, (error) => {
      console.error("reports snapshot error:", error);
    });
    return () => {
      unsub();
    };
  }, [selectedServerId]);

  // Effect 3 — Top offenders
  useEffect(() => {
    if (!selectedServerId || !isPro) return;
    const q = query(
      collection(db, `servers/${selectedServerId}/offenders`),
      orderBy("score", "desc"),
      limit(3),
    );
    const unsub = onSnapshot(q, (snap) => {
      setTopOffenders(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TopOffender),
      );
    }, (error) => {
      console.error("offenders snapshot error:", error);
    });
    return () => unsub();
  }, [selectedServerId, isPro]);

  // Effect 4 — Recent bot actions
  useEffect(() => {
    if (!selectedServerId) return;
    const q = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      orderBy("timestamp", "desc"),
      limit(50),
    );
    const unsub = onSnapshot(q, (snap) => {
      const allMessages = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as RecentAction,
      );
      const botActions = allMessages.filter(
        (a) =>
          a.actionTaken === "auto_deleted" ||
          a.actionTaken === "ban" ||
          a.actionTaken === "timeout",
      );
      setRecentActions(botActions.slice(0, 5));
    }, (error) => {
      console.error("recentActions snapshot error:", error);
    });
    return () => unsub();
  }, [selectedServerId]);

  // Effect 5 — Health widget data
  useEffect(() => {
    if (!selectedServerId) {
      setLoadingHealth(false);
      return;
    }
    setShowSetupFlow(false);
    setLoadingHealth(true);
    const unsub = onSnapshot(
      doc(db, `servers/${selectedServerId}`),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setHealthData(data.healthWidget || null);
          setFirstRunCompleted(data.onboarding?.firstRunCompleted === true);
        } else {
          setFirstRunCompleted(false);
        }
        setLoadingHealth(false);
      },
      () => setLoadingHealth(false),
    );
    return () => unsub();
  }, [selectedServerId]);

  // Effect 6 — Weekly stats
  useEffect(() => {
    if (!selectedServerId) return;
    const sevenDaysAgoDate = new Date();
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    const sevenDaysAgo = Timestamp.fromDate(sevenDaysAgoDate);
    const q = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      where("timestamp", ">=", sevenDaysAgo),
      limit(200),
    );
    const unsub = onSnapshot(q, (snap) => {
      let flags = 0,
        resolved = 0,
        blocked = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        flags++;
        if (data.status === "resolved") resolved++;
        if (
          data.actionTaken === "auto_deleted" ||
          data.actionTaken === "ban" ||
          data.actionTaken === "timeout"
        )
          blocked++;
      });
      setWeeklyStats({ flags, resolved, blocked });
    }, (err) => console.error("weekly stats snap error", err));
    return () => unsub();
  }, [selectedServerId]);

  const quickActions = [
    {
      label: "Mod Queue",
      description: "Review flagged messages",
      icon: ShieldAlert,
      path: "/moderation#queue",
      bgColor: "bg-danger/10",
      iconColor: "text-danger",
    },
    {
      label: "View Reports",
      description: "Manage user reports",
      icon: Flag,
      path: "/moderation#reports",
      bgColor: "bg-orange-50",
      iconColor: "text-orange-500",
    },
    {
      label: "Bot Settings",
      description: "Tune rules and filters",
      icon: Settings,
      path: "/settings",
      bgColor: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Analytics",
      description: "View server insights",
      icon: BarChart3,
      path: "/analytics",
      bgColor: "bg-secondary/10",
      iconColor: "text-secondary",
      locked: !isPro,
    },
    {
      label: "Leveling",
      description: "XP & rank rewards",
      icon: Trophy,
      path: "/leveling",
      bgColor: "bg-yellow-50",
      iconColor: "text-yellow-600",
      locked: !isPro,
    },
    {
      label: "Integrations",
      description: "Connect external services",
      icon: LinkIcon,
      path: "/integrations",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600",
      locked: !isPro,
    },
  ];

  const navigationCards = [
    {
      title: "Content Moderation",
      description: "Review flags, reports & offenders",
      icon: ShieldAlert,
      path: "/moderation",
      bgColor: "bg-danger/10",
      iconColor: "text-danger",
      badge:
        pendingFlagsCount > 0
          ? {
              text: `${pendingFlagsCountText} Pending`,
              color: "bg-danger/10 text-danger",
            }
          : null,
    },
    {
      title: "Bot Settings",
      description: "Tune rules, keywords, and server behavior",
      icon: Settings,
      path: "/settings",
      bgColor: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Analytics",
      description: "Message trends, moderation stats & insights",
      icon: BarChart3,
      path: "/analytics",
      bgColor: "bg-secondary/10",
      iconColor: "text-secondary",
      locked: !isPro,
    },
    {
      title: "Leveling & XP",
      description: "Manage ranks, rewards & leaderboards",
      icon: Trophy,
      path: "/leveling",
      bgColor: "bg-yellow-50",
      iconColor: "text-yellow-600",
      locked: !isPro,
    },
    {
      title: "Integrations",
      description: "Connect YouTube, Twitch & social platforms",
      icon: LinkIcon,
      path: "/integrations",
      bgColor: "bg-purple-50",
      iconColor: "text-purple-600",
      locked: !isPro,
    },
    {
      title: "Chat Summaries",
      description: "Generate AI summaries of channels",
      icon: FileText,
      path: "/summaries",
      bgColor: "bg-teal-50",
      iconColor: "text-teal-600",
    },
    {
      title: "Pricing & Plans",
      description: "View plans, upgrade or manage subscription",
      icon: Crown,
      path: "/pricing",
      bgColor: "bg-primary/10",
      iconColor: "text-primary",
      badge: userTier === "free"
        ? { text: "Upgrade Available", color: "bg-primary/10 text-primary" }
        : null,
    },
    {
      title: "My Profile",
      description: "Account settings and Discord connection",
      icon: Users,
      path: "/profile",
      bgColor: "bg-blue-50",
      iconColor: "text-blue-600",
    },
  ];

  if (!selectedServerId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center shadow-xl border-4 border-surface">
          <Logo className="w-12 h-12 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-on-surface">
            Select a Server
          </h2>
          <p className="text-sm text-text-secondary mt-2 max-w-xs">
            Choose a server from the dropdown above to see your dashboard.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Don't see your server? Make sure the bot is invited and the server is
          claimed in Bot Settings.
        </p>
      </div>
    );
  }

  if (serverLoading || loadingFlags || loadingHealth) {
    return <SentinLLoading message="Establishing secure connection" />;
  }

  const gradeColor = (g: string) => {
    switch (g) {
      case "A+":
      case "A":
        return "text-emerald-500 scale-110";
      case "B":
        return "text-yellow-500";
      case "C":
        return "text-orange-500";
      case "D":
      case "F":
        return "text-danger";
      default:
        return "text-text-muted";
    }
  };

  const selectedServerName =
    authorizedServers.find((s) => s.id === selectedServerId)?.name ||
    "your server";
  const planLabel = getPlanDisplayLabel({ tier, userTier, isBetaTester, isTrial, isSharedServer });

  const shouldShowFirstRunSetup =
    selectedServerId &&
    !setupStatus.loading &&
    (showSetupFlow || !firstRunCompleted);

  if (shouldShowFirstRunSetup) {
    return (
      <Suspense fallback={<div className="h-[520px] bg-surface-container/50 animate-pulse rounded-3xl" />}>
        <FirstRunSetupFlow
          serverName={selectedServerName}
          onCompleted={() => {
            setFirstRunCompleted(true);
            setShowSetupFlow(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="relative flex flex-col gap-6 md:gap-8 w-full pb-10"
    >
      {/* 1. Page Header */}
      <header className="relative overflow-hidden rounded-[2rem] bg-primary px-5 py-6 text-white shadow-[0_24px_70px_rgba(255,111,97,0.30)] sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.30),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.20),transparent_42%)]" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/20" />
        <div className="pointer-events-none absolute -bottom-24 right-12 h-52 w-52 rounded-full bg-white/10 blur-2xl" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="min-w-0">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/90 backdrop-blur-md">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Command Center
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
              Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/80">
              Overview for {selectedServerName}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black backdrop-blur-md transition-all duration-1000 ${
                  isServerActiveGlobally
                    ? "border-white/35 bg-white text-primary shadow-[0_14px_40px_rgba(43,29,28,0.18)]"
                    : "border-white/25 bg-white/10 text-white/80"
                }`}
              >
                {isServerActiveGlobally ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    SentinL Secure
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 text-white/70" />
                    SentinL Offline
                  </>
                )}
              </div>

              <HeaderMetaPills
                planLabel={planLabel}
                path={[`${activeQuotaCount}/${maxSlots} Server${maxSlots !== 1 ? "s" : ""}`]}
                className="text-[11px]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[1.75rem] border border-white/20 bg-white/15 p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
                    AI checks today
                  </p>
                  <p className="mt-1 text-2xl font-black text-white">
                    {dailyAICount || 0}
                    <span className="text-sm text-white/65">/{dailyAiLimit || 300}</span>
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-lg shadow-black/10">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${((dailyAICount || 0) / (dailyAiLimit || 300)) >= 1 ? "bg-danger" : "bg-white"}`}
                  style={{ width: filled ? `${Math.min(100, ((dailyAICount || 0) / (dailyAiLimit || 300)) * 100)}%` : "0%" }}
                />
              </div>
              <p className="mt-3 text-[11px] font-semibold text-white/70">
                Custom daily limits still control when SentinL falls back to keyword matching.
              </p>
            </div>
            {serverPlanExpiryText && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/75 backdrop-blur-xl">
                <Clock className="h-3.5 w-3.5" />
                {serverPlanExpiryText}
              </div>
            )}
          </div>
        </div>
      </header>

      {intentsWarning && (
        <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 flex items-start gap-3 w-full shadow-sm">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <h3 className="text-sm font-black text-danger uppercase tracking-widest mb-1">Moderation Disabled</h3>
            <p className="text-xs text-danger/80">
              SentinL cannot moderate normal messages until Discord allows it to read message text.
              Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="underline font-bold">Discord Developer Portal</a>, select your bot, go to the Bot tab, and enable "Message Content Intent".
            </p>
          </div>
        </div>
      )}

      {botGuilds?.includes(selectedServerId) && !isServerActiveGlobally && !intentsWarning && (
        <div className="bg-warning/10 border-[4px] border-warning shadow-[0_0_15px_rgba(251,146,60,0.5)] animate-pulse rounded-2xl p-4 flex items-start flex-col sm:flex-row gap-3 w-full">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-orange-600 uppercase tracking-widest mb-1">Bot Installed But Inactive</h3>
              <p className="text-xs text-orange-600/80">
                SentinL is installed but inactive. Activate it to start moderation.
              </p>
            </div>
          </div>
          <Link to="/settings#general/setup-activate-bot" className="sm:ml-auto mt-2 sm:mt-0 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center">
            Activate Server
          </Link>
        </div>
      )}

      {/* 2. Status Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          {botPermissions && !botPermissions.ManageMessages && (
            <Link
              to="/moderation#settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-warning/10 border-warning/30 text-orange-600 hover:bg-warning/20 transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              Missing Manage Messages: auto-delete disabled
            </Link>
          )}
          {botPermissions && !botPermissions.ModerateMembers && (
            <Link
              to="/moderation#settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-warning/10 border-warning/30 text-orange-600 hover:bg-warning/20 transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              Missing Moderate Members: timeout disabled
            </Link>
          )}
          {botPermissions && !botPermissions.ReadMessageHistory && (
            <Link
              to="/moderation#settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-warning/10 border-warning/30 text-orange-600 hover:bg-warning/20 transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              Missing Read Message History: context quality reduced
            </Link>
          )}
          {botPermissions && !botPermissions.EmbedLinks && (
            <Link
              to="/moderation#settings"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-warning/10 border-warning/30 text-orange-600 hover:bg-warning/20 transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              Missing Embed Links: log embeds may fail
            </Link>
          )}
        </div>
      </div>

      {/* 2.5 Server Setup Checklist */}
      <div className="flex items-center mb-5 mt-4">
        <div className="h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <ListChecks className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-[13px] font-black text-primary uppercase tracking-[0.24em]">
          Server Setup
        </h2>
        <div className="h-px bg-gradient-to-r from-primary/40 to-transparent flex-1 ml-4"></div>
      </div>
      <Suspense fallback={<div className="h-64 bg-surface-container/50 animate-pulse rounded-3xl" />}>
        <SetupChecklist onOpen={() => setShowSetupFlow(true)} />
      </Suspense>

      {/* 3. Top Overview Section */}
      <div className="flex items-center mb-5 mt-2">
        <div className="h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <Activity className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-[13px] font-black text-primary uppercase tracking-[0.24em]">
          Overview
        </h2>
        <div className="h-px bg-gradient-to-r from-primary/40 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top Left - 7-Day Summary */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-1 flex flex-col justify-between rounded-[1.5rem] border border-primary bg-primary p-5 text-white shadow-[0_18px_46px_rgba(255,111,97,0.26)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-white" />
              <span className="text-sm font-black text-white uppercase tracking-widest">
                Last 7 Day Stats
              </span>
            </div>
            <Link
              to={isPro ? "/analytics" : "/pricing"}
              className="text-[11px] font-bold text-white/85 hover:text-white flex items-center gap-1"
            >
              {isPro ? "View" : "Upgrade"} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 mb-4">
            <div className="flex min-h-[86px] flex-col items-center justify-center rounded-2xl border border-outline-variant/20 bg-white p-4 text-center">
              <div className="text-3xl font-black leading-none text-on-surface">
                {weeklyStats.flags}
              </div>
              <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                Scanned
              </div>
            </div>

            <div className="flex min-h-[86px] flex-col items-center justify-center rounded-2xl border border-outline-variant/20 bg-white p-4 text-center">
              <div className="text-3xl font-black leading-none text-success">
                {weeklyStats.blocked}
              </div>
              <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                Actions
              </div>
            </div>

            <div className="flex min-h-[86px] flex-col items-center justify-center rounded-2xl border border-outline-variant/20 bg-white p-4 text-center">
              <div className="text-3xl font-black leading-none text-on-surface">
                {weeklyStats.resolved}
              </div>
              <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                Resolved
              </div>
            </div>

            <div className="flex min-h-[86px] flex-col items-center justify-center rounded-2xl border border-outline-variant/20 bg-white p-4 text-center">
              <div className="text-3xl font-black leading-none text-orange-500">
                {pendingReportsCount}
              </div>
              <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                Reports
              </div>
            </div>
          </div>

          <p className="text-[11px] text-white/78 text-center pt-3 border-t border-white/20">
            {weeklyStats.blocked > 0
              ? `SentinL took action on ${weeklyStats.blocked} message${weeklyStats.blocked !== 1 ? "s" : ""} this week.`
              : "The bot hasn't taken any automated actions this week."}
          </p>
        </motion.div>

        {/* Top Right - 2x2 Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#queue")}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.12, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="group flex h-full min-h-[112px] cursor-pointer flex-col justify-between gap-3 rounded-[1.35rem] border border-white/65 bg-white/55 px-5 py-4 shadow-[0_10px_28px_rgba(43,29,28,0.06)] transition-all hover:border-primary hover:bg-primary hover:shadow-[0_20px_50px_rgba(255,111,97,0.22)]"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-danger/10 transition-colors group-hover:bg-white/20">
                <ShieldAlert className="w-5 h-5 text-danger transition-colors group-hover:text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40 transition-colors group-hover:text-white/70" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1 transition-colors group-hover:text-white">
                {pendingFlagsCountText}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest transition-colors group-hover:text-white/78">
                Pending Flags
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#reports")}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="group flex h-full min-h-[112px] cursor-pointer flex-col justify-between gap-3 rounded-[1.35rem] border border-white/65 bg-white/55 px-5 py-4 shadow-[0_10px_28px_rgba(43,29,28,0.06)] transition-all hover:border-primary hover:bg-primary hover:shadow-[0_20px_50px_rgba(255,111,97,0.22)]"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-orange-50 transition-colors group-hover:bg-white/20">
                <Flag className="w-5 h-5 text-orange-500 transition-colors group-hover:text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40 transition-colors group-hover:text-white/70" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1 transition-colors group-hover:text-white">
                {pendingReportsCountText}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest transition-colors group-hover:text-white/78">
                Open Reports
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation")}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.28, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="group flex h-full min-h-[112px] cursor-pointer flex-col justify-between gap-3 rounded-[1.35rem] border border-white/65 bg-white/55 px-5 py-4 shadow-[0_10px_28px_rgba(43,29,28,0.06)] transition-all hover:border-primary hover:bg-primary hover:shadow-[0_20px_50px_rgba(255,111,97,0.22)]"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-success/10 transition-colors group-hover:bg-white/20">
                <ShieldCheck className="w-5 h-5 text-success transition-colors group-hover:text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40 transition-colors group-hover:text-white/70" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1 transition-colors group-hover:text-white">
                {weeklyStats.blocked}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest transition-colors group-hover:text-white/78">
                Blocked (7d)
              </div>
            </div>
          </motion.div>
          
          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#health")}
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.36, duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className={"group flex h-full min-h-[112px] cursor-pointer flex-col justify-between gap-3 rounded-[1.35rem] border border-white/65 bg-white/55 px-5 py-4 shadow-[0_10px_28px_rgba(43,29,28,0.06)] transition-all hover:border-primary hover:bg-primary hover:shadow-[0_20px_50px_rgba(255,111,97,0.22)]"}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 transition-colors group-hover:bg-white/20">
                <Heart className="w-5 h-5 text-primary transition-colors group-hover:text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40 transition-colors group-hover:text-white/70" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <div className="text-2xl font-black text-on-surface leading-none transition-colors group-hover:text-white">
                   {healthData?.lastGrade && healthData?.lastGrade !== "N/A" ? `Grade : ${healthData.lastGrade}` : "Grade : N/A"}
                </div>
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase flex flex-col gap-1.5 mt-1 transition-colors group-hover:text-white/78">
                <div className="flex items-center gap-1">
                  {healthData?.lastGrade && healthData.lastGrade !== "N/A" ? (
                    healthData.lastGrade.includes('A') || healthData.lastGrade === 'S' || healthData.lastGrade === 'A+' ? (
                      <div className="flex items-center gap-1 tracking-widest">
                        <FlameKindling className="w-3 h-3 text-primary" />
                        <span className="text-primary font-bold">Streak : {healthData?.streakDays || 0}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-text-secondary tracking-normal normal-case transition-colors group-hover:text-white/80">Streak starts from grade A and above</span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold text-text-secondary tracking-widest transition-colors group-hover:text-white/80">Gathering Data ({effectiveHealthCount}/500)</span>
                  )}
                </div>
                {(!healthData?.lastGrade || healthData.lastGrade === "N/A") && (
                  <div className="h-1.5 w-32 bg-surface-container rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${Math.min((effectiveHealthCount / 500) * 100, 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 3.5. Quick Actions */}
      <div className="flex items-center mb-5 mt-8">
        <div className="h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <Zap className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-[13px] font-black text-primary uppercase tracking-[0.24em]">
          Quick Actions
        </h2>
        <div className="h-px bg-gradient-to-r from-primary/40 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(action.locked ? "/pricing" : action.path)}
              className="group flex items-center gap-3 rounded-2xl border border-transparent border-b-outline-variant/35 px-3 py-4 text-left transition-all hover:border-primary hover:bg-primary hover:shadow-[0_18px_42px_rgba(255,111,97,0.20)]"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-primary/10 text-primary border border-primary/15 transition-colors group-hover:border-white/20 group-hover:bg-white/20">
                <Icon className="w-5 h-5 text-primary transition-colors group-hover:text-white" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-black text-on-surface line-clamp-1 transition-colors group-hover:text-white">
                  {action.label}
                </span>
                <span className="text-xs font-semibold text-text-muted line-clamp-1 transition-colors group-hover:text-white/75">
                  {action.description}
                </span>
                {action.locked && (
                  <span className="sentinl-pro-badge mt-1 w-fit">
                    PRO
                  </span>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40 transition-colors group-hover:text-white/75" />
            </motion.button>
          );
        })}
      </div>

      {/* 4. Lists Grid */}
      <div className="flex items-center mb-5 mt-8">
        <div className="h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <ShieldAlert className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-[13px] font-black text-primary uppercase tracking-[0.24em]">
          Moderation
        </h2>
        <div className="h-px bg-gradient-to-r from-primary/40 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Left: Pending Flags */}
        <div className="flex flex-col">
          <div className="overflow-hidden flex flex-col h-[400px] rounded-[1.5rem] border border-white/70 bg-white/62 shadow-[0_14px_38px_rgba(43,29,28,0.07)] backdrop-blur-xl">
            <div className="flex items-center justify-between shrink-0 h-[72px] bg-primary px-5 text-white">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-white" />
                  Pending Flags
                </span>
              </div>
              <Link
                to="/moderation#queue"
                className="text-[11px] font-bold text-white/85 hover:text-white flex items-center gap-1"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="flex flex-col flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {pendingFlags.length === 0 ? (
                <div className="flex items-center gap-2 p-5 text-sm text-text-secondary font-medium h-full justify-center">
                  <Logo className="w-5 h-5 text-text-secondary/60" /> All clear —
                  no pending flags.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-outline-variant/10">
                  {pendingFlags.map((flag: any) => (
                    <motion.div
                      key={flag.id}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="group flex items-center justify-between rounded-2xl px-3 py-4 transition-all cursor-pointer hover:bg-primary hover:shadow-[0_16px_38px_rgba(255,111,97,0.18)]"
                      onClick={() => navigate("/moderation#queue")}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        {flag.authorAvatar ? (
                          <img
                            src={flag.authorAvatar}
                            alt={flag.authorUsername}
                            className="w-8 h-8 rounded-lg object-cover shadow-sm border border-outline-variant/30 hidden sm:block"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-surface-container hidden sm:flex items-center justify-center text-xs font-black text-primary border border-outline-variant/30">
                            {flag.authorUsername?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-on-surface truncate transition-colors group-hover:text-white">
                            @{flag.authorUsername}
                          </span>
                          <span className={`${levelColor(flag.level)} px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-widest self-start mt-0.5`}>
                            {(flag as any).reviewOnly || flag.detectionMethod === "ai_review_only" ? "Needs Review" : flag.level || "Flagged"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center justify-end px-2">
                        <p className="text-[13px] text-text-secondary italic font-medium truncate w-full text-right transition-colors group-hover:text-white/75" title={flag.content}>
                          "{flag.content}"
                        </p>
                      </div>

                      <div className="flex-shrink-0 ml-3">
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-white/75 transition-colors" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Recent Bot Actions */}
        <div className="flex flex-col">
          <div className="overflow-hidden flex flex-col h-[400px] rounded-[1.5rem] border border-white/70 bg-white/62 shadow-[0_14px_38px_rgba(43,29,28,0.07)] backdrop-blur-xl">
            <div className="flex items-center justify-between shrink-0 h-[72px] bg-primary px-5 text-white">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20">
                     <Logo className="w-5 h-5 text-white" />
                  </div>
                  Recent Bot Actions
                </span>
              </div>
              <Link
                to="/moderation"
                className="text-[11px] font-bold text-white/85 hover:text-white flex items-center gap-1"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            
            <div className="flex flex-col flex-1 overflow-y-auto min-h-0 custom-scrollbar">
              {recentActions.length === 0 ? (
                <div className="flex items-center gap-2 p-5 text-sm text-text-secondary font-medium h-full justify-center">
                  <Logo className="w-5 h-5 text-text-secondary/60" /> No automated actions yet.
                </div>
              ) : (
                <div className="flex flex-col">
                  {recentActions.slice(0, 20).map((action) => {
                    const actionLabel = action.actionTaken
                      ? action.actionTaken.replace("_", " ")
                      : "Unknown";
                    const triggerLabel =
                      action.level === "Keyword" ? "Keyword rule" : "Automated";
                    const timeLabel = action.timestamp
                      ? formatDistanceToNow(
                          new Date(
                            action.timestamp.seconds
                              ? action.timestamp.seconds * 1000
                              : action.timestamp,
                          ),
                          { addSuffix: true },
                        )
                      : "Unknown time";

                    return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="px-3 py-2.5 border-b border-outline-variant/10 last:border-0"
                    >
                      <div className="group relative overflow-hidden rounded-2xl border border-outline-variant/20 bg-white/75 px-3.5 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15">
                        <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-danger group-hover:bg-white/70" />
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-danger/15 bg-danger/10 text-danger shadow-inner transition-all duration-300 group-hover:border-white/25 group-hover:bg-white/20 group-hover:text-white">
                            <ShieldAlert className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="truncate text-sm font-black text-on-surface transition-colors group-hover:text-white">
                                  @{action.authorUsername || action.authorId || "Unknown"}
                                </span>
                                <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-outline-variant/70 group-hover:bg-white/60 sm:block" />
                                <span className="hidden truncate text-[10px] font-black uppercase tracking-widest text-danger transition-colors group-hover:text-white/80 sm:block">
                                  {actionLabel}
                                </span>
                              </div>
                              <span className="hidden shrink-0 text-[10px] font-bold text-text-secondary transition-colors group-hover:text-white/70 sm:inline-flex">
                                {timeLabel}
                              </span>
                            </div>

                            <p className="mt-1 line-clamp-2 break-words text-[12px] font-semibold italic leading-relaxed text-on-surface/85 transition-colors group-hover:text-white/90" title={action.reason || "Automatic filter triggered"}>
                              "{action.reason || "Automatic filter triggered"}"
                            </p>

                            <div className="mt-2 flex items-center gap-2 overflow-hidden">
                              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-secondary transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                                <ShieldAlert className="h-3 w-3 shrink-0" />
                                <span className="truncate sm:hidden">{actionLabel}</span>
                                <span className="hidden sm:inline">Actioned</span>
                              </span>
                              <span className="inline-flex min-w-0 rounded-full border border-outline-variant/20 bg-surface-container/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-secondary transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                                <span className="truncate">{triggerLabel}</span>
                              </span>
                              <span className="ml-auto shrink-0 text-[10px] font-bold text-text-secondary transition-colors group-hover:text-white/70 sm:hidden">
                                {timeLabel}
                              </span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-white/75" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden flex h-[260px] flex-col mb-6 rounded-[1.5rem] border border-white/70 bg-white/62 shadow-[0_14px_38px_rgba(43,29,28,0.07)] backdrop-blur-xl">
        <div className="flex items-center justify-between bg-primary px-5 py-5 text-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Flag className="h-4 w-4 text-white" />
              Open Reports
            </span>
          </div>
          <Link
            to="/moderation#reports"
            className="text-[11px] font-bold text-white/85 hover:text-white flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="min-h-0 flex-1 p-3.5">
          {pendingReports.length === 0 ? (
            <div className="flex h-full items-center gap-2 p-4 text-sm text-text-secondary font-medium">
              <Logo className="w-5 h-5 text-text-secondary/60" /> All clear —
              no open reports.
            </div>
          ) : (
            <div className="grid h-full grid-cols-5 gap-3 overflow-x-auto pb-1">
              {pendingReports.slice(0, 5).map((report: any) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="group flex h-full min-w-[160px] cursor-pointer flex-col justify-between rounded-2xl border border-outline-variant/20 bg-white px-3.5 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary hover:shadow-[0_16px_38px_rgba(255,111,97,0.18)]"
                  onClick={() => navigate("/moderation#reports")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 transition-all group-hover:bg-white/20 group-hover:text-white group-hover:border-white/25">
                      <Flag className="w-4 h-4 transition-colors" />
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-white/75" />
                  </div>

                  <div className="min-w-0">
                    <span className="block truncate text-sm font-black text-on-surface transition-colors group-hover:text-white">
                      @{report.reportedUsername || report.targetUsername || report.reportedUser || report.reportedUserId || report.targetId || "Unknown"}
                    </span>
                    <span className="mt-1 block truncate text-[10px] font-bold text-text-secondary transition-colors group-hover:text-white/72">
                      by @{report.reporterUsername || report.reporterId || "Unknown"}
                    </span>
                  </div>

                  <p className="line-clamp-3 text-[12px] font-semibold italic leading-relaxed text-text-secondary transition-colors group-hover:text-white/82">
                    "{report.reason || "No reason provided."}"
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 6. Navigation Cards Grid */}
      <div className="flex items-center mb-4 mt-8">
        <div className="h-7 w-7 rounded-xl bg-primary text-white flex items-center justify-center mr-3 shadow-lg shadow-primary/20">
          <Settings className="h-3.5 w-3.5" />
        </div>
        <h2 className="text-[13px] font-black text-primary uppercase tracking-[0.24em]">
          Manage SentinL
        </h2>
        <div className="h-px bg-gradient-to-r from-primary/40 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1 mb-8">
        {navigationCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.045, duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                
              >
                <Link
                  to={card.path}
                  className={`group flex items-start gap-4 rounded-2xl border border-transparent border-b-outline-variant/35 px-3 py-5 transition-all relative h-full hover:border-primary hover:bg-primary hover:shadow-[0_18px_42px_rgba(255,111,97,0.20)] ${card.locked ? "cursor-pointer" : ""}`}
                  onClick={(e) => {
                    if (card.locked) {
                      e.preventDefault();
                      navigate("/pricing");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.bgColor} shadow-sm transition-colors group-hover:bg-white group-hover:text-primary`}
                    >
                      <Icon className={`w-6 h-6 ${card.iconColor} transition-colors group-hover:text-primary`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-sm text-on-surface transition-colors group-hover:text-white">
                      {card.title}
                    </h3>
                    {card.locked ? (
                      <span className="sentinl-pro-badge flex shrink-0 items-center gap-1">
                        <Crown className="w-2.5 h-2.5" /> PRO
                      </span>
                    ) : (
                      <ArrowRight className="w-4 h-4 text-text-secondary/40 group-hover:text-white/75 group-hover:translate-x-1 transition-all shrink-0" />
                    )}
                    </div>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed transition-colors group-hover:text-white/72">
                      {card.description}
                    </p>
                  </div>
                  {card.badge && !card.locked && (
                    <div
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg w-fit mt-2 ${card.badge.color}`}
                    >
                      {card.badge.text}
                    </div>
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>

      {!isPro && (
        <div className="w-full mt-2">
          <div className="w-full rounded-[1.75rem] overflow-hidden border border-primary/20 mt-2 shadow-[0_18px_45px_rgba(43,29,28,0.08)]">
            <div className="bg-gradient-to-br from-primary via-primary to-[#ff8a7f] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">
                    Upgrade to unlock the full AI moderation suite
                  </h3>
                  <p className="text-xs text-white/80 mt-1.5 max-w-lg leading-relaxed">
                    Pro gives you adjustable flagging strictness,
                    automatic message deletion, context-aware moderation,
                    advanced analytics, custom bot commands, and social media
                    integrations — starting at $7.99/month.
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {[
                      "Auto-Delete",
                      "Confidence Tuning",
                      "Analytics",
                      "Custom Commands",
                      "Integrations",
                    ].map((f) => (
                      <span
                        key={f}
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-white border border-white/20"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <Link
                to="/pricing"
                className="flex items-center gap-2 px-6 py-3 bg-white text-primary rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/90 transition-colors shrink-0 shadow-lg shadow-black/10 whitespace-nowrap"
              >
                View Plans <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* End Modal Section */}
    </motion.div>
  );
}
