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
} from "lucide-react";
import { Logo } from "./Logo";
import { toast } from "sonner";

interface PendingFlag {
  id: string;
  authorUsername: string;
  authorAvatar?: string;
  content: string;
  level: string;
  confidence: number;
  timestamp: any;
  channelId: string;
}

interface PendingReport {
  id: string;
  reportedUser: string;
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
      limit(5),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPendingFlags(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PendingFlag),
        );
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
      description: "Configure rules & filters",
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
      description: "Configure rules, keywords & server behavior",
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
      className="flex flex-col gap-6 md:gap-8 w-full pb-10"
    >
      {/* 1. Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
            Dashboard
          </h1>
          <p className="text-text-secondary font-medium text-xs sm:text-sm mt-1">
            Overview for {selectedServerName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 self-start shrink-0">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold transition-all duration-1000 ${
              isServerActiveGlobally
                ? "bg-primary/10 border-primary/50 text-primary shadow-[0_0_15px_rgba(255,111,97,0.4)] animate-[pulse_3s_ease-in-out_infinite]"
                : "bg-surface-container border-outline-variant/30 text-text-muted"
            }`}
          >
            {isServerActiveGlobally ? (
              <>
                <ShieldCheck className="w-4 h-4 text-primary" />
                SentinL Secure
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 text-text-muted opacity-60" />
                SentinL Offline
              </>
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
              Moderation is disabled because Message Content Intent is not enabled in Discord Developer Portal.
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
        <div className="flex flex-col w-64 px-1 max-w-full">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-text-muted font-medium">AI calls used today:</span>
            <span className="text-[10px] font-bold text-text-secondary">{dailyAICount || 0}/{dailyAiLimit || 300}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-container border border-outline-variant/20 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out ${((dailyAICount || 0) / (dailyAiLimit || 300)) >= 1 ? 'bg-danger' : 'bg-primary'}`}
              style={{ width: filled ? `${Math.min(100, ((dailyAICount || 0) / (dailyAiLimit || 300)) * 100)}%` : '0%' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center rounded-full border bg-surface-container border-outline-variant/30 text-[11px] font-bold">
            <span
              className={`flex items-center gap-1.5 px-3 py-1.5 ${
                isTrial ? "text-primary" : isPro ? "text-primary" : "text-text-secondary"
              }`}
            >
              {isPro ? <Crown className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
              {isSharedServer && isPro ? "Pro (Shared)" : isTrial ? "Pro Trial" : tier === "pro_3" ? "Premium" : tier === "pro_1" ? "Pro" : tier === "premium" ? "Premium" : "Free"}
            </span>
            <div className="w-px h-3.5 bg-outline-variant/50"></div>
            <span className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-text-secondary text-center">
              {activeQuotaCount}/{maxSlots} Server{maxSlots !== 1 ? "s" : ""}
            </span>
          </div>
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
      <div className="flex items-center mb-5 mt-8">
        <div className="h-5 w-1.5 rounded-full bg-primary/80 mr-3"></div>
        <h2 className="text-[13px] font-black text-on-surface uppercase tracking-[0.2em]">
          Server Setup
        </h2>
        <div className="h-px bg-gradient-to-r from-on-surface/20 to-transparent flex-1 ml-4"></div>
      </div>
      <Suspense fallback={<div className="h-64 bg-surface-container/50 animate-pulse rounded-3xl" />}>
        <SetupChecklist onOpen={() => setShowSetupFlow(true)} />
      </Suspense>

      {/* 3. Top Overview Section */}
      <div className="flex items-center mb-5 mt-2">
        <div className="h-5 w-1.5 rounded-full bg-primary/80 mr-3"></div>
        <h2 className="text-[13px] font-black text-on-surface uppercase tracking-[0.2em]">
          Overview
        </h2>
        <div className="h-px bg-gradient-to-r from-on-surface/20 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Left - 7-Day Summary */}
        <div className="lg:col-span-1 bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <span className="text-sm font-black text-on-surface uppercase tracking-widest">
                Last 7 Day Stats
              </span>
            </div>
            <Link
              to={isPro ? "/analytics" : "/pricing"}
              className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
            >
              {isPro ? "View" : "Upgrade"} <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 mb-4">
            <div className="flex flex-col justify-center items-center p-4 rounded-2xl bg-surface-container/50 border border-outline-variant/15">
              <div className="text-3xl font-black text-on-surface">
                {weeklyStats.flags}
              </div>
              <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mt-1 text-center">
                Scanned
              </div>
            </div>

            <div className="flex flex-col justify-center items-center p-4 rounded-2xl bg-success/5 border border-success/15">
              <div className="text-3xl font-black text-success">
                {weeklyStats.blocked}
              </div>
              <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mt-1 text-center">
                Actions
              </div>
            </div>

            <div className="flex flex-col justify-center items-center p-4 rounded-2xl bg-surface-container/50 border border-outline-variant/15">
              <div className="text-3xl font-black text-on-surface">
                {weeklyStats.resolved}
              </div>
              <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mt-1 text-center">
                Resolved
              </div>
            </div>

            <div className="flex flex-col justify-center items-center p-4 rounded-2xl bg-orange-50 border border-orange-100">
              <div className="text-3xl font-black text-orange-500">
                {pendingReportsCount}
              </div>
              <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest mt-1 text-center">
                Reports
              </div>
            </div>
          </div>

          <p className="text-[11px] text-text-muted text-center pt-3 border-t border-outline-variant/20">
            {weeklyStats.blocked > 0
              ? `SentinL took action on ${weeklyStats.blocked} message${weeklyStats.blocked !== 1 ? "s" : ""} this week.`
              : "The bot hasn't taken any automated actions this week."}
          </p>
        </div>

        {/* Top Right - 2x2 Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#queue")}
            className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col justify-between gap-3 h-full min-h-[140px] card-shimmer"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-danger/10">
                <ShieldAlert className="w-5 h-5 text-danger" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1">
                {pendingFlagsCountText}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                Pending Flags
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#reports")}
            className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col justify-between gap-3 h-full min-h-[140px] card-shimmer"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-orange-50">
                <Flag className="w-5 h-5 text-orange-500" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1">
                {pendingReportsCountText}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                Open Reports
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation")}
            className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col justify-between gap-3 h-full min-h-[140px] card-shimmer"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-success/10">
                <ShieldCheck className="w-5 h-5 text-success" />
              </div>
              <ChevronRight className="w-4 h-4 text-text-secondary/40" />
            </div>
            <div>
              <div className="text-2xl font-black text-on-surface leading-none mb-1">
                {weeklyStats.blocked}
              </div>
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                Blocked (7d)
              </div>
            </div>
          </motion.div>
          
          <motion.div
            whileHover={{ y: -2 }}
            onClick={() => navigate("/moderation#health")}
            className={"bg-primary border border-primary rounded-3xl p-5 shadow-md shadow-primary/20 cursor-pointer hover:shadow-lg hover:shadow-primary/30 transition-all flex flex-col justify-between gap-3 h-full min-h-[140px] card-shimmer"}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/20">
                <Heart className="w-5 h-5 text-white" />
              </div>
              <ChevronRight className="w-4 h-4 text-white/60" />
            </div>
            <div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <div className="text-2xl font-black text-white leading-none">
                   {healthData?.lastGrade && healthData?.lastGrade !== "N/A" ? `Grade : ${healthData.lastGrade}` : "Grade : N/A"}
                </div>
              </div>
              <div className="text-xs font-semibold text-white/80 uppercase flex flex-col gap-1.5 mt-1">
                <div className="flex items-center gap-1">
                  {healthData?.lastGrade && healthData.lastGrade !== "N/A" ? (
                    healthData.lastGrade.includes('A') || healthData.lastGrade === 'S' || healthData.lastGrade === 'A+' ? (
                      <div className="flex items-center gap-1 tracking-widest">
                        <FlameKindling className="w-3 h-3 text-white" />
                        <span className="text-white font-bold">Streak : {healthData?.streakDays || 0}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-white/80 tracking-normal normal-case">Streak starts from grade A and above</span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold text-white/80 tracking-widest">Gathering Data ({effectiveHealthCount}/500)</span>
                  )}
                </div>
                {(!healthData?.lastGrade || healthData.lastGrade === "N/A") && (
                  <div className="h-1.5 w-32 bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${Math.min((effectiveHealthCount / 500) * 100, 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* 3.5. Quick Actions */}
      <div className="flex items-center mb-5 mt-8">
        <div className="h-5 w-1.5 rounded-full bg-primary/80 mr-3"></div>
        <h2 className="text-[13px] font-black text-on-surface uppercase tracking-[0.2em]">
          Quick Actions
        </h2>
        <div className="h-px bg-gradient-to-r from-on-surface/20 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {quickActions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={i}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(action.locked ? "/pricing" : action.path)}
              className="flex flex-col items-center justify-center gap-3 p-4 bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm hover:shadow-md transition-all h-[110px] card-shimmer"
            >
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${action.bgColor}`}>
                <Icon className={`w-5 h-5 ${action.iconColor}`} />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[11px] font-black text-on-surface line-clamp-1">
                  {action.label}
                </span>
                {action.locked && (
                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/15 mt-0.5 w-fit">
                    PRO
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 4. Lists Grid */}
      <div className="flex items-center mb-5 mt-8">
        <div className="h-5 w-1.5 rounded-full bg-orange-500 mr-3"></div>
        <h2 className="text-[13px] font-black text-on-surface uppercase tracking-[0.2em]">
          Moderation
        </h2>
        <div className="h-px bg-gradient-to-r from-on-surface/20 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Left: Pending Flags */}
        <div className="flex flex-col">
          <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="flex items-center justify-between p-5 bg-surface-container/30 border-b border-outline-variant/20 shrink-0 h-[72px]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                  🚨 Pending Flags
                </span>
              </div>
              <Link
                to="/moderation#queue"
                className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
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
                  {pendingFlags.slice(0, 20).map((flag: any) => (
                    <div
                      key={flag.id}
                      className="flex items-center justify-between p-4 hover:bg-surface-container/30 transition-colors cursor-pointer group"
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
                          <span className="text-sm font-bold text-on-surface truncate">
                            @{flag.authorUsername}
                          </span>
                          <span className={`${levelColor(flag.level)} px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-widest self-start mt-0.5`}>
                            {(flag as any).reviewOnly || flag.detectionMethod === "ai_review_only" ? "Needs Review" : flag.level || "Flagged"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center justify-end px-2">
                        <p className="text-[13px] text-text-secondary italic font-medium truncate w-full text-right" title={flag.content}>
                          "{flag.content}"
                        </p>
                      </div>

                      <div className="flex-shrink-0 ml-3">
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Recent Bot Actions */}
        <div className="flex flex-col">
          <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[400px]">
            <div className="flex items-center justify-between p-5 bg-surface-container/30 border-b border-outline-variant/20 shrink-0 h-[72px]">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                     <Logo className="w-5 h-5 text-primary" />
                  </div>
                  Recent Bot Actions
                </span>
              </div>
              <Link
                to="/moderation"
                className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
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
                <div className="flex flex-col divide-y divide-outline-variant/10">
                  {recentActions.slice(0, 20).map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between p-4 hover:bg-surface-container/30 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="w-8 h-8 rounded-lg bg-surface-container hidden sm:flex items-center justify-center text-xs font-black text-primary border border-outline-variant/30 shrink-0">
                          {action.authorUsername?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-on-surface truncate">
                            @{action.authorUsername || action.authorId || "Unknown"}
                          </span>
                          <span className={`${
                            action.actionTaken === "ban" ? "bg-danger/10 text-danger" : 
                            action.actionTaken === "kick" ? "bg-orange-500/10 text-orange-600" :
                            action.actionTaken === "timeout" ? "bg-yellow-500/10 text-yellow-600" :
                            action.actionTaken === "warn" ? "bg-primary/10 text-primary" :
                            "bg-surface-variant text-text-secondary"
                          } px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-widest self-start mt-0.5`}>
                            {action.actionTaken ? action.actionTaken.replace("_", " ") : "UNKNOWN"}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center justify-end px-2">
                        <p className="text-[13px] text-text-secondary italic font-medium truncate w-full text-right" title={action.reason || "Automatic filter triggered"}>
                          "{action.reason || "Automatic filter triggered"}"
                        </p>
                      </div>

                      <div className="flex-shrink-0 ml-3">
                        <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden flex flex-col mb-6">
        <div className="flex items-center justify-between p-5 bg-surface-container/30 border-b border-outline-variant/20">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
              🚩 Open Reports
            </span>
          </div>
          <Link
            to="/moderation#reports"
            className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1"
          >
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex flex-col gap-1 p-5 pt-3">
          {pendingReports.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-text-secondary font-medium">
              <Logo className="w-5 h-5 text-text-secondary/60" /> All clear —
              no open reports.
            </div>
          ) : (
            pendingReports.slice(0, 5).map((report: any) => (
              <div
                key={report.id}
                className="flex flex-col gap-4 p-5 rounded-2xl bg-surface hover:bg-surface-container/50 border border-outline-variant/30 transition-colors shadow-sm cursor-pointer group"
                onClick={() => navigate("/moderation#reports")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
                      <Flag className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-on-surface">
                        Target: @{report.targetUsername || report.targetId}
                      </span>
                      <span className="text-[10px] text-text-secondary font-semibold mt-0.5">
                        Reported by @{report.reporterUsername}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container/30 p-3.5 rounded-2xl border border-outline-variant/10 relative">
                  <p className="text-[13px] text-on-surface font-medium leading-relaxed italic line-clamp-2">
                    "{report.reason}"
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 6. Navigation Cards Grid */}
      <div className="flex items-center mb-4 mt-8">
        <div className="h-5 w-1.5 rounded-full bg-primary/80 mr-3"></div>
        <h2 className="text-[13px] font-black text-on-surface uppercase tracking-[0.2em]">
          Manage SentinL
        </h2>
        <div className="h-px bg-gradient-to-r from-on-surface/20 to-transparent flex-1 ml-4"></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {navigationCards.map((card, i) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={i}
                whileHover={{ y: -3, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                
              >
                <Link
                  to={card.path}
                  className={`flex flex-col gap-4 p-6 bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm hover:shadow-md transition-all block group relative h-full card-shimmer ${card.locked ? "cursor-pointer" : ""}`}
                  onClick={(e) => {
                    if (card.locked) {
                      e.preventDefault();
                      navigate("/pricing");
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.bgColor} shadow-sm`}
                    >
                      <Icon className={`w-6 h-6 ${card.iconColor}`} />
                    </div>
                    {card.locked && (
                      <span className="text-[9px] font-black px-2.5 py-1 bg-primary/10 text-primary rounded-full border border-primary/20 flex items-center gap-1 shrink-0">
                        <Crown className="w-2.5 h-2.5" /> PRO
                      </span>
                    )}
                    {!card.locked && (
                      <ArrowRight className="w-4 h-4 text-text-secondary/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-black text-sm text-on-surface group-hover:text-primary transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
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
          <div className="w-full rounded-3xl overflow-hidden border border-primary/20 mt-2">
            <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/10 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-black text-on-surface text-base">
                    Upgrade to unlock the full AI moderation suite
                  </h3>
                  <p className="text-xs text-text-secondary mt-1.5 max-w-lg leading-relaxed">
                    Pro gives you configurable AI confidence thresholds,
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
                        className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/15"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <Link
                to="/pricing"
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors shrink-0 shadow-lg shadow-primary/20 whitespace-nowrap"
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
