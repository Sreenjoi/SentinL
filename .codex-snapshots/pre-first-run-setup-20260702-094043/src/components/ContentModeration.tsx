import React, { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useServer } from "../context/ServerContext";
import { useLocation } from "react-router-dom";
import { db, auth } from "../firebase";
import { doc, onSnapshot, collection, query, where, Timestamp, documentId } from "firebase/firestore";
import { AlertTriangle, X, Shield, Loader2 } from "lucide-react";
import { SentinLLoading } from "./SentinLLoading";

// Lazy load large admin views to reduce bundle size
const ModQueue = lazy(() => import("./ModQueue"));
const ReportsManager = lazy(() => import("./ReportsManager"));
const AppealsManager = lazy(() => import("./AppealsManager"));
const Offenders = lazy(() => import("./Offenders"));
const HealthScore = lazy(() => import("./HealthScore"));
const ModSettings = lazy(() => import("./ModSettings"));
const PermissionsWarning = lazy(() => import("./PermissionsWarning").then(m => ({ default: m.PermissionsWarning })));


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
      className="group flex flex-col items-center justify-center py-2.5 px-4 bg-surface-container/30 border border-outline-variant/30 hover:border-primary/40 hover:bg-surface-container/50 transition-all rounded-xl shadow-sm hover:shadow min-w-[100px]"
    >
      <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary/70 mb-1 group-hover:text-text-secondary transition-colors">Health Score</span>
      <span className={`text-3xl font-black tracking-tighter leading-none group-hover:scale-105 transition-transform duration-300 ${grade === "N/A" ? "text-text-secondary" : "text-primary"}`}>
        {score}
      </span>
      <div className={`mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded border w-full text-center uppercase tracking-wider ${grade === "N/A" ? "bg-surface-variant text-text-secondary border-outline-variant/50" : "bg-primary/10 text-primary border-primary/20"}`}>
        {grade !== "N/A" ? `${grade} Grade` : `Gathering (${messageCount}/500)`}
      </div>
      {grade === "N/A" && (
        <div className="h-1 w-full bg-surface-variant rounded-full overflow-hidden mt-1.5">
          <div className="h-full bg-text-secondary rounded-full transition-all duration-500" style={{ width: `${Math.min((messageCount / 500) * 100, 100)}%` }} />
        </div>
      )}
    </button>
  );
}

export default function ContentModeration() {
  const { selectedServerId, tier, isBetaTester, isTrial , isPro} = useServer();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<
    "queue" | "reports" | "appeals" | "offenders" | "health" | "settings"
  >(() => {
    const hash = location.hash.replace("#", "");
    if (["queue", "reports", "appeals", "offenders", "health", "settings"].includes(hash)) {
      return hash as any;
    }
    return "queue";
  });
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
      const hash = window.location.hash.replace("#", "");
      if (["queue", "reports", "appeals", "offenders", "health", "settings"].includes(hash)) {
        setActiveTab(hash as any);
      }
    };
    
    // Listen for hash changes manually to ensure React Router doesn't swallow them
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (["queue", "reports", "appeals", "offenders", "health", "settings"].includes(hash)) {
      setActiveTab(hash as any);
    }
  }, [location.hash]);


  const switchTab = (tab: "queue" | "reports" | "appeals" | "offenders" | "health" | "settings") => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  };

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
                AI checks are temporarily slowed because an AI provider is rate limited. SentinL will continue using safe fallback protection where available.
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
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
              Content Moderation
            </h1>
          </div>
          <p className="text-text-secondary font-medium max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed">
            Review flagged messages, manage user reports, and monitor repeat
            offenders across your server.
          </p>
        </div>
        
        {/* Dynamic Community Health Badge */}
        <div className="flex-shrink-0 flex items-center justify-end">
           <HealthGradeBadge serverId={selectedServerId} switchTab={switchTab} />
        </div>
      </header>

      <div className="flex items-center gap-1.5 sm:gap-2 bg-surface-container/50 p-1.5 rounded-2xl w-full md:w-fit max-w-full overflow-x-auto hide-scrollbar border border-outline-variant/10">
        <button
          onClick={() => {
            if (!["queue", "reports", "appeals", "offenders"].includes(activeTab)) {
              switchTab("queue");
            }
          }}
          className={`relative shrink-0 px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center ${
            ["queue", "reports", "appeals", "offenders"].includes(activeTab)
              ? "text-white"
              : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
          }`}
        >
          {["queue", "reports", "appeals", "offenders"].includes(activeTab) && (
            <motion.div
              layoutId="main-tab"
              className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">Moderation</span>
        </button>
        <button
          onClick={() => switchTab("health")}
          className={`relative shrink-0 px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center gap-1.5 ${
            activeTab === "health"
              ? "text-white"
              : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
          }`}
        >
          {activeTab === "health" && (
            <motion.div
              layoutId="main-tab"
              className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">Community Health</span>
        </button>
        <button
          onClick={() => switchTab("settings")}
          className={`relative shrink-0 px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center justify-center gap-1.5 ${
            activeTab === "settings"
              ? "text-white"
              : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
          }`}
        >
          {activeTab === "settings" && (
            <motion.div
              layoutId="main-tab"
              className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">AI Settings</span>
        </button>
      </div>

      <div className="flex flex-col z-10">
      {["queue", "reports", "appeals", "offenders"].includes(activeTab) && (
        <div className="flex flex-col ml-2 w-full md:w-max max-w-[calc(100vw-2rem)] relative transition-all duration-300 z-20 bg-surface-container/50 border border-outline-variant/10 rounded-2xl shadow-sm p-1 overflow-x-auto hide-scrollbar">
          <div className={`flex items-center gap-1 transition-all duration-300`}>
            <button
              onClick={() => switchTab("queue")}
              className={`relative shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                activeTab === "queue"
                  ? "text-primary"
                  : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activeTab === "queue" && (
                <motion.div
                  layoutId="sub-tab"
                  className="absolute inset-0 bg-white rounded-xl shadow-md"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">Moderation Queue</span>
            </button>
            <button
              onClick={() => switchTab("reports")}
              className={`relative shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                activeTab === "reports"
                  ? "text-primary"
                  : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activeTab === "reports" && (
                <motion.div
                  layoutId="sub-tab"
                  className="absolute inset-0 bg-white rounded-xl shadow-md"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">Reports</span>
            </button>
            <button
              onClick={() => switchTab("appeals")}
              className={`relative shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1.5 ${
                activeTab === "appeals"
                  ? "text-primary"
                  : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activeTab === "appeals" && (
                <motion.div
                  layoutId="sub-tab"
                  className="absolute inset-0 bg-white rounded-xl shadow-md"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                Appeals
              </span>
            </button>
            <button
              onClick={() => switchTab("offenders")}
              className={`relative shrink-0 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1.5 ${
                activeTab === "offenders"
                  ? "text-primary"
                  : !isPro
                    ? "text-text-secondary/60 hover:text-text-secondary/80 hover:bg-surface-container/40"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activeTab === "offenders" && (
                <motion.div
                  layoutId="sub-tab"
                  className="absolute inset-0 bg-white rounded-xl shadow-md"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                Repeat Offenders
                {!isPro && (
                  <span
                    className={`ml-1 text-[7px] px-1 py-0.5 rounded font-bold ${
                      activeTab === "offenders"
                        ? "bg-surface-variant text-text-secondary"
                        : "bg-surface-variant/50 text-text-secondary/80"
                    }`}
                  >
                    {isBetaTester ? 'PRO (Beta Test Server)' : 'PRO'}
                  </span>
                )}
              </span>
            </button>
          </div>
          <div 
            id="reports-tertiary-portal" 
            className={`transition-all duration-300 empty:hidden pt-1 mt-1 border-t border-outline-variant/10`} 
          />
        </div>
      )}

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
              {activeTab === "reports" && <ReportsManager hideHeader={true} />}
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
