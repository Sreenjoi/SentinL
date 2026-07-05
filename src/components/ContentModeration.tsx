import React, { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useServer } from "../context/ServerContext";
import { useLocation } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, onSnapshot, collection, query, where, Timestamp, documentId } from "firebase/firestore";
import {
  AlertTriangle,
  X,
  ShieldAlert,
  Heart,
  SlidersHorizontal,
  Inbox,
  FileText,
  Gavel,
  UsersRound,
} from "lucide-react";
import { SentinLLoading } from "./SentinLLoading";
import { getPlanDisplayLabel } from "../utils/planDisplay";
import { BranchTabs, HeaderMetaPills } from "./BrandedPageHeader";

// Lazy load large admin views to reduce bundle size
const ModQueue = lazy(() => import("./ModQueue"));
const ReportsManager = lazy(() => import("./ReportsManager"));
const AppealsManager = lazy(() => import("./AppealsManager"));
const Offenders = lazy(() => import("./Offenders"));
const HealthScore = lazy(() => import("./HealthScore"));
const ModSettings = lazy(() => import("./ModSettings"));
const PermissionsWarning = lazy(() => import("./PermissionsWarning").then(m => ({ default: m.PermissionsWarning })));

type ContentModerationTab = "queue" | "reports" | "appeals" | "offenders" | "health" | "settings";
type ReportManagerTab = "queue" | "history" | "settings" | "analytics";

const contentModerationTabs: ContentModerationTab[] = ["queue", "reports", "appeals", "offenders", "health", "settings"];
const reportManagerTabs: ReportManagerTab[] = ["queue", "history", "settings", "analytics"];

const getContentTabFromHash = (hashValue: string): ContentModerationTab | null => {
  const [primary, secondary] = hashValue.replace("#", "").split("/");
  if (primary === "reports" && (!secondary || reportManagerTabs.includes(secondary as ReportManagerTab))) {
    return "reports";
  }
  if (contentModerationTabs.includes(primary as ContentModerationTab)) {
    return primary as ContentModerationTab;
  }
  if (reportManagerTabs.includes(primary as ReportManagerTab) && primary !== "queue") {
    return "reports";
  }
  return null;
};

const getReportTabFromHash = (hashValue: string): ReportManagerTab => {
  const [primary, secondary] = hashValue.replace("#", "").split("/");
  if (primary === "reports" && reportManagerTabs.includes(secondary as ReportManagerTab)) {
    return secondary as ReportManagerTab;
  }
  if (reportManagerTabs.includes(primary as ReportManagerTab) && primary !== "queue") {
    return primary as ReportManagerTab;
  }
  return "queue";
};

function HealthGradeBadge({ serverId, switchTab }: { serverId: string | null, switchTab: (tab: "health") => void }) {
  // Added state for grade and score
  const [grade, setGrade] = useState<string>("N/A");
  const [score, setScore] = useState<string>("N/A");
  const [messageCount, setMessageCount] = useState<number>(0);
  
  useEffect(() => {
    if (!serverId) return;
    const unsub = onSnapshot(doc(db, "servers", serverId), (docSnap) => {
      if (docSnap.exists()) {
        const hWidget = docSnap.data().healthWidget;
        setGrade(hWidget?.lastGrade && hWidget.lastGrade !== "N/A" ? hWidget.lastGrade : "N/A");
        setScore(hWidget?.lastScore && hWidget.lastScore !== "N/A" ? hWidget.lastScore : "N/A");
        setMessageCount(hWidget?.totalMessages || 0);
      }
    }, (err) => console.error("HealthGradeBadge error:", err));
    return () => unsub();
  }, [serverId]);

  return (
    <button 
      onClick={() => switchTab("health")}
      className="group rounded-[1.75rem] border border-white/20 bg-white/15 p-4 text-left shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] backdrop-blur-xl transition-all hover:bg-white/22 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
            Health Score
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black leading-none tracking-tight text-white transition-transform duration-300 group-hover:scale-105">
              {score}
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-white/65">
              {grade !== "N/A" ? `${grade} Grade` : "Gathering"}
            </span>
          </div>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-lg shadow-black/10">
          <Heart className="h-5 w-5" />
        </div>
      </div>
      {grade === "N/A" && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-white/65">
            <span>Learning baseline</span>
            <span>{messageCount}/500</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${Math.min((messageCount / 500) * 100, 100)}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}

export default function ContentModeration() {
  const { selectedServerId, tier, isBetaTester, isTrial, isPro, authorizedServers, isSharedServer } = useServer();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ContentModerationTab>(() => getContentTabFromHash(location.hash) || "queue");
  const [activeReportTab, setActiveReportTab] = useState<ReportManagerTab>(() => getReportTabFromHash(location.hash));
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [showRateLimitBanner, setShowRateLimitBanner] = useState<boolean>(true);

  useEffect(() => {
    if (!selectedServerId) {
      setIsRateLimited(false);
      setCooldownUntil(0);
      return;
    }

    let active = true;
    const fetchAiStatus = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/guilds/${selectedServerId}/ai-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        
        const cooldown = data.cooldownUntil || 0;
        if (cooldown > Date.now()) {
          setIsRateLimited(true);
          setCooldownUntil(cooldown);
          setShowRateLimitBanner(true);
        } else {
          setIsRateLimited(false);
          setCooldownUntil(0);
        }
      } catch (err) {
        console.error("ai status fetch error:", err);
      }
    };

    fetchAiStatus();
    const interval = setInterval(fetchAiStatus, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedServerId]);

  // Set interval to hide banner when cooldown expires
  useEffect(() => {
    if (!isRateLimited || !cooldownUntil) return;
    const checkCooldown = setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        setIsRateLimited(false); // auto hide
      }
    }, 1000);
    return () => clearInterval(checkCooldown);
  }, [isRateLimited, cooldownUntil]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextTab = getContentTabFromHash(window.location.hash);
      if (nextTab) {
        setActiveTab(nextTab);
      }
      if (nextTab === "reports") {
        setActiveReportTab(getReportTabFromHash(window.location.hash));
      }
    };
    
    // Listen for hash changes manually to ensure React Router doesn't swallow them
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const nextTab = getContentTabFromHash(location.hash);
    if (nextTab) {
      setActiveTab(nextTab);
    }
    if (nextTab === "reports") {
      setActiveReportTab(getReportTabFromHash(location.hash));
    }
  }, [location.hash]);


  const switchTab = (tab: ContentModerationTab) => {
    setActiveTab(tab);
    if (tab === "reports") {
      setActiveReportTab("queue");
    }
    window.history.replaceState(null, "", `#${tab}`);
  };

  const selectedServerName =
    (Array.isArray(authorizedServers)
      ? authorizedServers.find((server) => server.id === selectedServerId)?.name
      : undefined) || "your server";

  const planLabel =
    getPlanDisplayLabel({ tier, isBetaTester, isTrial, isSharedServer });
  const activeTabLabel =
    activeTab === "queue" ? "Moderation Queue" :
    activeTab === "reports" ? "Reports" :
    activeTab === "appeals" ? "Appeals" :
    activeTab === "offenders" ? "Repeat Offenders" :
    activeTab === "health" ? "Community Health" :
    "AI Settings";
  const reportSubTabLabel =
    activeTab === "reports"
      ? activeReportTab === "history"
        ? "Report History"
        : activeReportTab === "settings"
          ? "Settings"
          : activeReportTab === "analytics"
            ? "Insights"
            : "Active Reports"
      : null;
  const headerPath = ["queue", "reports", "appeals", "offenders"].includes(activeTab)
    ? ["Moderation", activeTabLabel, reportSubTabLabel]
    : [activeTabLabel];
  const activeSection = ["queue", "reports", "appeals", "offenders"].includes(activeTab)
    ? "moderation"
    : activeTab === "health"
      ? "health"
      : "settings";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="flex flex-col gap-8 relative"
    >
      <AnimatePresence>
        {isRateLimited && showRateLimitBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-4 right-4 z-[100] max-w-sm bg-danger text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 border border-red-400"
          >
            <AlertTriangle className="h-6 w-6 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <h4 className="font-bold text-sm">AI checks are temporarily slowed</h4>
              <p className="text-xs text-red-50 mt-1 leading-relaxed">
                SentinL is temporarily slowing AI checks. Basic protection will keep running, and full AI checks will resume automatically.
              </p>
            </div>
            <button 
              onClick={() => setShowRateLimitBanner(false)}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedServerId && (
        <Suspense fallback={<div className="h-10 animate-pulse bg-surface-container/50 rounded-lg"></div>}>
          <PermissionsWarning 
            serverId={selectedServerId} 
            required={["BanMembers", "KickMembers", "ManageMessages", "ModerateMembers"]} 
          />
        </Suspense>
      )}
      <header className="relative overflow-hidden rounded-[2rem] bg-primary px-5 py-6 text-white shadow-[0_24px_70px_rgba(255,111,97,0.30)] sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.30),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.20),transparent_42%)]" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/20" />
        <div className="pointer-events-none absolute -bottom-24 right-12 h-52 w-52 rounded-full bg-white/10 blur-2xl" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="min-w-0">
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl md:text-6xl">
              Content Moderation
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-white/80">
              Review flags, reports, appeals, repeat offenders, and moderation behavior for {selectedServerName}.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <HeaderMetaPills planLabel={planLabel} path={headerPath} className="text-[11px]" />
            </div>
          </div>

          <HealthGradeBadge serverId={selectedServerId} switchTab={switchTab} />
        </div>
      </header>

      <div className="flex w-full flex-col gap-3">
      <BranchTabs
        active={activeSection}
        onChange={(section) => {
          if (section === "moderation") {
            if (!["queue", "reports", "appeals", "offenders"].includes(activeTab)) {
              switchTab("queue");
            }
            return;
          }
          switchTab(section);
        }}
        items={[
          { id: "moderation", label: "Moderation", icon: ShieldAlert },
          { id: "health", label: "Community Health", icon: Heart },
          { id: "settings", label: "AI Settings", icon: SlidersHorizontal },
        ]}
      />

      <div className="flex flex-col z-10">
      {["queue", "reports", "appeals", "offenders"].includes(activeTab) && (
        <div className="relative z-20 ml-4 flex w-full max-w-[calc(100%-1rem)] flex-col transition-all duration-300 sm:ml-6 sm:max-w-[calc(100%-1.5rem)] lg:ml-8 lg:max-w-[calc(100%-2rem)]">
          <BranchTabs
            level="sub"
            active={activeTab as "queue" | "reports" | "appeals" | "offenders"}
            onChange={(tab) => switchTab(tab)}
            items={[
              { id: "queue", label: "Moderation Queue", icon: ShieldAlert },
              { id: "reports", label: "Reports", icon: FileText },
              { id: "appeals", label: "Appeals", icon: Gavel },
              { id: "offenders", label: "Repeat Offenders", icon: UsersRound, badge: !isPro ? (isBetaTester ? "BETA" : "PRO") : undefined },
            ]}
          />
          <div 
            id="reports-tertiary-portal" 
            className={`ml-4 max-w-[calc(100%-1rem)] transition-all duration-300 empty:hidden pt-2 sm:ml-5 sm:max-w-[calc(100%-1.25rem)] lg:ml-6 lg:max-w-[calc(100%-1.5rem)]`} 
          />
        </div>
      )}
      </div>

      <div className={`transition-all duration-300 ease-in-out flex-1 flex flex-col relative z-10 ${!["queue", "reports", "appeals", "offenders"].includes(activeTab) ? "mt-0" : "mt-6"}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col gap-8 md:gap-10 flex-1"
          >
            <Suspense fallback={<SentinLLoading />}>
              {activeTab === "queue" && <ModQueue hideHeader={true} />}
              {activeTab === "reports" && <ReportsManager hideHeader={true} onTabChange={setActiveReportTab} />}
              {activeTab === "appeals" && <AppealsManager hideHeader={true} />}
              {activeTab === "offenders" && <Offenders hideHeader={true} />}
              {activeTab === "health" && <HealthScore />}
              {activeTab === "settings" && <ModSettings />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
      </div>
    </motion.div>
  );
}

// Trigger reload
