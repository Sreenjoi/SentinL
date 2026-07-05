import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChannelSelector } from "./ChannelSelector";
import { EmptyState, CompactEmptyState } from "./EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { collection, query, onSnapshot, where, doc, getDoc, updateDoc, getDocs } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "../firebase";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import {
  Activity,
  Users as UsersIcon,
  ShieldCheck,
  BarChart3,
  Download,
  Calendar,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  MoreHorizontal,
  ChevronDown,
  MessageSquare,
  Shield,
  ActivitySquare,
  List,
  Bot,
  User,
  ChevronRight,
  Settings,
  Plus,
  Check,
  Loader2,
  Sparkles,
  Wand2,
  Mail,
  Crown,
} from "lucide-react";
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import { ProGate } from "./ProGate";
import { useServer } from "../context/ServerContext";
import { Logo } from "./Logo";
import { toast } from "sonner";

const COLORS = ["#ff6f61", "#00d2d3", "#ba1a1a", "#00696b", "#a68986"];

interface MessageData {
  hour: string;
  total: number;
  attachments: number;
  channels: Record<string, any>;
}

interface MemberData {
  date: string;
  joins: number;
  leaves: number;
  total: number;
}

interface ModData {
  date: string;
  actions_Extreme?: number;
  actions_Inappropriate?: number;
  actions_Moderate?: number;
  actions_Spam?: number;
  total: number;
}

interface CommandData {
  date: string;
  [key: string]: any;
}

interface TrainingData {
  id: string;
  messageId?: string;
  content?: string;
  direction?: string;
  botResponse?: string;
  originalLevel?: string;
  correctedLevel: string;
  trainedBy: string;
  timestamp: string;
  serverId?: string;
}

import { useSaveState } from "../hooks/useSaveState";

export default function AdvancedAnalytics() {
  const { selectedServerId, tier, isBetaTester, isTrial , isPro} = useServer();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7); // days

  const location = useLocation();
  const navigate = useNavigate();

  const [activePage, setActivePage] = useState<"advanced" | "training">(() => {
    return window.location.hash === "#training" ? "training" : "advanced";
  });
  
  const [analyticsTab, setAnalyticsTab] = useState<"stats" | "digest">(() => {
    return window.location.hash === "#digest" ? "digest" : "stats";
  });

  useEffect(() => {
    if (location.hash === "#training") setActivePage("training");
    if (location.hash === "#digest") {
      setActivePage("advanced");
      setAnalyticsTab("digest");
    } else if (location.hash === "#stats") {
      setActivePage("advanced");
      setAnalyticsTab("stats");
    }
  }, [location.hash]);

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === "#training") {
        setActivePage("training");
      } else if (window.location.hash === "#digest") {
        setActivePage("advanced");
        setAnalyticsTab("digest");
      } else if (window.location.hash === "#stats") {
        setActivePage("advanced");
        setAnalyticsTab("stats");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestUndefined, setDigestUndefined] = useState(false);
  const [digestChannelId, setDigestChannelId] = useState("");
  
  const { isSaved: digestIsSaved, setIsSaved: setDigestIsSaved, hasChanges: digestHasChanges, resetSaveState: resetDigestSaveState, updateBaseline: updateDigestBaseline } = useSaveState([digestEnabled, digestChannelId]);

  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [savingDigest, setSavingDigest] = useState(false);
  const [pageDropdownOpen, setPageDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user] = useAuthState(auth);

  const [trainingData, setTrainingData] = useState<TrainingData[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [trainingTab, setTrainingTab] = useState<
    "analytics" | "log"
  >("analytics");
  const [data, setData] = useState<{
    messages: MessageData[];
    members: MemberData[];
    moderation: ModData[];
    commands: CommandData[];
    summary: any;
  }>({
    messages: [],
    members: [],
    moderation: [],
    commands: [],
    summary: null,
  });

  const [dateRangeOpen, setDateRangeOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setPageDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedServerId) return;
    const loadDigestAndChannels = async () => {
      const snap = await getDoc(doc(db, "servers", selectedServerId));
      if (snap.exists()) {
        const data = snap.data();
        const enabled = data.weeklyDigestEnabled === true;
        const channelId = data.digestChannelId || "";
        setDigestEnabled(enabled);
        setDigestUndefined(data.weeklyDigestEnabled === undefined);
        setDigestChannelId(channelId);
        resetDigestSaveState([enabled, channelId]);
      }
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`/api/discord/channels/${selectedServerId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const cdata = await res.json();
            if (cdata.channels) setChannels(cdata.channels);
          } else if (res.status === 404) {
             setChannels([]);
          } else {
            console.error("Failed to fetch channels:", await res.text());
          }
        } catch (e) {
          console.error("Error fetching channels:", e);
        }
      }
    };
    loadDigestAndChannels();
  }, [selectedServerId, user]);

  const toggleDigestEnabled = async (checked: boolean) => {
    if (!selectedServerId || !isPro) return;
    setDigestEnabled(checked);
    updateDigestBaseline((old: any[]) => [checked, old[1]]);
    try {
      await updateDoc(doc(db, "servers", selectedServerId), {
        weeklyDigestEnabled: checked,
      });
      toast.success("Setting updated.", { duration: 2000 });
    } catch (e) {
      console.error(e);
      toast.error("Failed to update setting.");
      setDigestEnabled(!checked);
      updateDigestBaseline((old: any[]) => [!checked, old[1]]);
    }
  };

  const saveDigestSettings = async () => {
    if (!selectedServerId || !isPro) return;
    setSavingDigest(true);
    try {
      await updateDoc(doc(db, "servers", selectedServerId), {
        weeklyDigestEnabled: digestEnabled,
        digestChannelId: digestChannelId,
      });
      setDigestIsSaved(true);
      toast.success(
        digestEnabled ? "Weekly Digest settings saved!" : "Weekly Digest has been disabled."
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update digest settings.");
    } finally {
      setSavingDigest(false);
    }
  };

  const fetchData = async () => {
    if (!selectedServerId || !isPro) {
      setData({
        messages: [],
        members: [],
        moderation: [],
        commands: [],
        summary: null,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const minDelay = new Promise(resolve => setTimeout(resolve, 600));
      const token = user ? await user.getIdToken() : "";
      const headers = { Authorization: `Bearer ${token}` };

      // In a real worker environment, we would fetch from the worker URL.
      // Since I am in the same environment, I'll simulate the worker API fetch or hit /api/analytics
      const fetchJson = async (url: string, headers: any) => {
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return { error: `HTTP ${res.status}` };
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            return await res.json();
          }
          return { error: "Not a JSON response" };
        } catch (e) {
          return { error: "Fetch failed" };
        }
      };

      const [msgRes, memRes, modRes, cmdRes, sumRes] = await Promise.all([
        fetchJson(
          `/api/analytics/messages?serverId=${selectedServerId}&period=${period}d`,
          headers,
        ),
        fetchJson(
          `/api/analytics/members?serverId=${selectedServerId}&period=${period}d`,
          headers,
        ),
        fetchJson(
          `/api/analytics/moderation?serverId=${selectedServerId}&period=${period}d`,
          headers,
        ),
        fetchJson(
          `/api/analytics/commands?serverId=${selectedServerId}&period=${period}d`,
          headers,
        ),
        fetchJson(
          `/api/analytics/summary?serverId=${selectedServerId}`,
          headers,
        ),
      ]);

      setData({
        messages: Array.isArray(msgRes) ? msgRes : [],
        members: Array.isArray(memRes) ? memRes : [],
        moderation: Array.isArray(modRes) ? modRes : [],
        commands: Array.isArray(cmdRes) ? cmdRes : [],
        summary: sumRes && !sumRes?.error ? sumRes : null,
      });

      try {
        const q = query(
          collection(db, "trainingFeedback"),
          where("serverId", "==", selectedServerId),
        );
        const snapshot = await getDocs(q);
        const fbData: TrainingData[] = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          fbData.push({
             id: doc.id,
             messageId: d.originalMessageId,
             content: d.originalContent,
             direction: d.moderatorReason,
             botResponse: d.botResponse,
             originalLevel: d.originalVerdict,
             correctedLevel: d.correctedSeverity,
             trainedBy: d.moderatorId,
             timestamp: d.timestamp?.toDate
               ? d.timestamp.toDate().toISOString()
               : d.timestamp,
             serverId: d.serverId,
          });
        });
        fbData.sort(
          (a, b) =>
            new Date(b.timestamp || 0).getTime() -
            new Date(a.timestamp || 0).getTime(),
        );
        setTrainingData(fbData);
      } catch (e: any) {
        handleFirestoreError(e, OperationType.GET, "trainingFeedback");
      }

      await minDelay;
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedServerId, period]);

  const [exportingChartId, setExportingChartId] = useState<string | null>(null);

  const exportToPDF = async (elementId: string, fileName: string) => {
    if (!isPro) return;
    const element = document.getElementById(elementId);
    if (!element) {
      toast.error("Could not locate report content.");
      return;
    }
    
    setExportingChartId(elementId);
    const downloadToast = toast.loading(`Generating PDF: ${fileName}...`);
    
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas")
      ]);
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${fileName}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      
      toast.success("Report downloaded!", { id: downloadToast });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate PDF.", { id: downloadToast });
    } finally {
      setExportingChartId(null);
    }
  };

  const levelCounts = (Array.isArray(trainingData) ? trainingData : []).reduce(
    (acc, curr) => {
      acc[curr.correctedLevel] = (acc[curr.correctedLevel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const trainingChartData = [
    { name: "Extreme", count: levelCounts["Extreme"] || 0, fill: "#ba1a1a" },
    {
      name: "Inappropriate",
      count: levelCounts["Inappropriate"] || 0,
      fill: "#ff6f61",
    },
    { name: "Moderate", count: levelCounts["Moderate"] || 0, fill: "#a68986" },
    { name: "Spam", count: levelCounts["Spam"] || 0, fill: "#8c716d" },
    { name: "Safe", count: levelCounts["Safe"] || 0, fill: "#00d2d3" },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }} 
      className="space-y-6 pb-20 relative"
    >
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
              Analytics
            </h1>
            {(!isPro) && (
              <span className="text-[10px] bg-primary/10 text-primary px-2.5 py-1 rounded-md font-bold uppercase tracking-widest mt-1 sm:mt-0">
                PRO
              </span>
            )}
          </div>
          <p className="text-text-secondary font-medium max-w-2xl text-sm md:text-base">
            Server growth metrics, AI heuristics visualization, and moderation
            effectiveness reports.
          </p>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 relative z-[100]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 bg-surface-container/50 p-1.5 rounded-2xl w-fit border border-outline-variant/10">
            <button
              onClick={() => { setActivePage("advanced"); window.history.replaceState(null, "", "#stats"); }}
              className={`relative px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1.5 ${
                activePage === "advanced"
                  ? "text-white"
                  : !isPro
                    ? "text-text-secondary/60 hover:text-text-secondary/80 hover:bg-surface-container/40"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activePage === "advanced" && (
                <motion.div
                  layoutId="analytics-active-page"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
              Server Analytics
              {!isPro && (
                <span
                  className={`ml-1 text-[8px] px-1.5 py-0.5 rounded font-bold ${
                    activePage === "advanced"
                      ? "bg-white/20 text-white"
                      : "bg-surface-variant/50 text-text-secondary/80"
                  }`}
                >
                  {isBetaTester ? 'PRO (Beta Test Server)' : 'PRO'}
                </span>
              )}
              </span>
            </button>
            <button
              onClick={() => { setActivePage("training"); window.history.replaceState(null, "", "#training"); }}
              className={`relative px-4 sm:px-6 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1.5 ${
                activePage === "training"
                  ? "text-white"
                  : !isPro
                    ? "text-text-secondary/60 hover:text-text-secondary/80 hover:bg-surface-container/40"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
              }`}
            >
              {activePage === "training" && (
                <motion.div
                  layoutId="analytics-active-page"
                  className="absolute inset-0 bg-primary rounded-xl shadow-lg shadow-primary/20"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
              Training Analytics
              {!isPro && (
                <span
                  className={`ml-1 text-[8px] px-1.5 py-0.5 rounded font-bold ${
                    activePage === "training"
                      ? "bg-white/20 text-white"
                      : "bg-surface-variant/50 text-text-secondary/80"
                  }`}
                >
                  {isBetaTester ? 'PRO (Beta Test Server)' : 'PRO'}
                </span>
              )}
              </span>
            </button>
          </div>

          {activePage === "advanced" && (
            <div className="flex flex-wrap items-center gap-1 bg-surface-container/50 p-1 rounded-2xl w-fit border border-outline-variant/10 ml-2">
              <button
                onClick={() => { setAnalyticsTab("stats"); window.history.replaceState(null, "", "#stats"); }}
                className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                  analyticsTab === "stats"
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
                }`}
              >
                {analyticsTab === "stats" && (
                  <motion.div
                    layoutId="analytics-sub-tab"
                    className="absolute inset-0 bg-white rounded-xl shadow-md"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                Stats
                </span>
              </button>
              <button
                onClick={() => { setAnalyticsTab("digest"); window.history.replaceState(null, "", "#digest"); }}
                className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                  analyticsTab === "digest"
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
                }`}
              >
                {analyticsTab === "digest" && (
                  <motion.div
                    layoutId="analytics-sub-tab"
                    className="absolute inset-0 bg-white rounded-xl shadow-md"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                Weekly Digest
                </span>
              </button>
            </div>
          )}

          {activePage === "training" && (
            <div className="flex flex-wrap items-center gap-1 bg-surface-container/50 p-1 rounded-2xl w-fit border border-outline-variant/10 ml-2">
              <button
                onClick={() => setTrainingTab("analytics")}
                className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                  trainingTab === "analytics"
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
                }`}
              >
                {trainingTab === "analytics" && (
                  <motion.div
                    layoutId="training-sub-tab"
                    className="absolute inset-0 bg-white rounded-xl shadow-md"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">Metrics</span>
              </button>
              <button
                onClick={() => setTrainingTab("log")}
                className={`relative px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ease-out flex items-center gap-1 ${
                  trainingTab === "log"
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary hover:bg-surface-container/50"
                }`}
              >
                {trainingTab === "log" && (
                  <motion.div
                    layoutId="training-sub-tab"
                    className="absolute inset-0 bg-white rounded-xl shadow-md"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">Full Log</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 w-full sm:w-auto relative z-[60]">
          <div className="flex items-center bg-white/80 backdrop-blur-md border border-white/40 rounded-full shadow-md shadow-primary/5 p-1 w-full sm:w-auto justify-end relative z-[60]">
            {activePage === "advanced" && analyticsTab === "stats" && (
              <>
                <div className="relative flex-1 sm:flex-none">
                  <ProGate isPro={isPro} featureName="Time Period" featureDescription="View historical stats across custom date ranges in Pro" className="block w-full">
                    <button
                      onClick={() => setDateRangeOpen(!dateRangeOpen)}
                      disabled={!isPro}
                      className={`w-full flex justify-between sm:justify-start items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-on-surface hover:bg-surface-container transition-all duration-300 ease-out active:scale-95 ${!isPro ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span>Time Period: {period}D</span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-300 ease-out text-text-secondary ${dateRangeOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </ProGate>

                  <AnimatePresence>
                    {dateRangeOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 mt-3 w-48 bg-white/95 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl z-[9999] overflow-hidden py-2"
                      >
                        {[7, 30, 90].map((days) => (
                          <button
                            key={days}
                            onClick={() => {
                              setPeriod(days);
                              setDateRangeOpen(false);
                            }}
                            className={`w-full text-left px-5 py-3 text-sm transition-all duration-300 ease-out ${period === days ? "text-primary font-black bg-primary/5" : "text-text-secondary hover:bg-surface-container hover:text-primary font-bold"}`}
                          >
                            Last {days} Days
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="w-px h-5 bg-outline-variant/30 mx-1 shrink-0" />
              </>
            )}

            <ProGate isPro={isPro} featureName="Manual Refresh" featureDescription="Refresh deep analytics on demand in Pro" className="flex items-center">
              <button
                onClick={fetchData}
                disabled={!isPro || loading}
                className={`p-2 rounded-full text-primary hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 ${!isPro || loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </ProGate>
          </div>

          {lastUpdatedAt && (
            <span className="text-[10px] font-medium text-text-secondary px-2">
              Last updated: {lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activePage + analyticsTab + trainingTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
        {activePage === "advanced" ? (
          analyticsTab === "stats" ? (
          <div>
            {/* Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <ProGate isPro={isPro} featureName="Message Stats" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-6 shadow-2xl shadow-text-secondary/5 overflow-hidden relative group h-full hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 bg-primary-container/20 text-primary rounded-2xl flex items-center justify-center border border-primary/10">
                    <MessageSquare className="w-6 h-6 fill-current" />
                  </div>
                </div>
                <div className="text-4xl font-black text-on-surface tracking-tighter mb-1">
                  {(Array.isArray(data.messages) ? data.messages : [])
                    .reduce(
                      (acc: number, curr: any) => acc + (curr.total || 0),
                      0,
                    )
                    ?.toLocaleString() || "0"}
                </div>
                <div className="text-[11px] font-black text-text-secondary uppercase tracking-widest text-primary/60">
                  Message Stats
                </div>
                <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-300 text-primary">
                  <MessageSquare className="w-40 h-40 fill-current" />
                </div>
              </div>
              </ProGate>

              <ProGate isPro={isPro} featureName="Community Density" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-6 shadow-2xl shadow-text-secondary/5 overflow-hidden relative group h-full hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 bg-secondary-container/20 text-secondary rounded-2xl flex items-center justify-center border border-secondary/10">
                    <UsersIcon className="w-6 h-6 fill-current" />
                  </div>
                  {data.members && data.members.length > 0 && (() => {
                    const latest = data.members[0].total || 0;
                    const oldest = data.members[data.members.length - 1].total || 0;
                    const diff = latest - oldest;
                    return diff !== 0 ? (
                      <span
                        className={`flex items-center gap-1 text-[11px] font-black px-3 py-1 rounded-full ${diff > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                      >
                        {diff > 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {Math.abs(diff)}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="text-4xl font-black text-on-surface tracking-tighter mb-1">
                  {data.members && data.members.length > 0
                    ? data.members[0].total.toLocaleString()
                    : data.summary?.currentMembers?.toLocaleString() || "0"}
                </div>
                <div className="text-[11px] font-black text-text-secondary uppercase tracking-widest text-secondary/60">
                  Community Density
                </div>
                <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-300 text-secondary">
                  <UsersIcon className="w-40 h-40 fill-current" />
                </div>
              </div>
              </ProGate>

              <ProGate isPro={isPro} featureName="Resolved Threats" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-6 shadow-2xl shadow-text-secondary/5 overflow-hidden relative group h-full hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 bg-primary-container/20 text-primary rounded-2xl flex items-center justify-center border border-primary/10">
                    <Shield className="w-6 h-6 fill-current" />
                  </div>
                  <span className="text-[10px] bg-primary/10 text-primary px-3 py-1.5 rounded-full font-black uppercase tracking-widest">
                    Active Guard
                  </span>
                </div>
                <div className="text-4xl font-black text-on-surface tracking-tighter mb-1">
                  {(Array.isArray(data.moderation) ? data.moderation : [])
                    .reduce(
                      (acc: number, curr: any) => acc + (curr.total || 0),
                      0,
                    )
                    ?.toLocaleString() || "0"}
                </div>
                <div className="text-[11px] font-black text-text-secondary uppercase tracking-widest text-primary/60">
                  Resolved Threat Events
                </div>
                <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-300 text-primary">
                  <ShieldCheck className="w-40 h-40 fill-current" />
                </div>
              </div>
              </ProGate>
            </div>

            {/* Main Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Message Activity Line Chart */}
              <ProGate isPro={isPro} featureName="Visual Analytics" featureDescription="Unlock high-density charts and graphing metrics with Pro." className="block relative h-full">
              <div id="chart-messages" className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl shadow-text-secondary/5 h-full relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight leading-none mb-1">
                      Message Velocity
                    </h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      Message Activity
                    </p>
                  </div>
                  <ProGate isPro={isPro} featureName="Export Report" featureDescription="Export your engagement metrics as a PDF report in Pro" className="block">
                    <button
                      onClick={() => exportToPDF("chart-messages", "Message_Velocity")}
                      disabled={!isPro || exportingChartId === "chart-messages"}
                      className={`p-3 bg-primary-container/20 text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-sm border border-primary/10 ${!isPro || exportingChartId === "chart-messages" ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                    >
                      {exportingChartId === "chart-messages" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  </ProGate>
                </div>
                <div className="h-72 w-full">
                  {!data.messages || data.messages.length === 0 ? (
                    <CompactEmptyState 
                      title="No Data Available"
                      description="Insufficient message traffic to generate insights."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={Array.isArray(data.messages) ? data.messages : []}
                      >
                      <defs>
                        <linearGradient
                          id="colorMsg"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ff6f61"
                            stopOpacity={0.2}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ff6f61"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d4c1bf"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="hour"
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) =>
                          val.split("T")[1]?.substring(0, 5) || val
                        }
                      />
                      <YAxis
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          borderRadius: "20px",
                          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05)",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total"
                        stroke="#ff6f61"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorMsg)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
              </ProGate>

              {/* Member Growth Chart */}
              <ProGate isPro={isPro} featureName="Density Evolution" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div id="chart-members" className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl shadow-text-secondary/5 h-full relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight leading-none mb-1">
                      Density Expansion
                    </h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      User Base Evolution
                    </p>
                  </div>
                  <ProGate isPro={isPro} featureName="Export Report" featureDescription="Export user growth metrics as a PDF report in Pro" className="block">
                    <button
                      onClick={() => exportToPDF("chart-members", "Density_Expansion")}
                      disabled={!isPro || exportingChartId === "chart-members"}
                      className={`p-3 bg-primary-container/20 text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-sm border border-primary/10 ${!isPro || exportingChartId === "chart-members" ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                    >
                      {exportingChartId === "chart-members" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  </ProGate>
                </div>
                <div className="h-72 w-full">
                  {!data.members || data.members.length === 0 ? (
                    <CompactEmptyState 
                      title="No Data Available"
                      description="Insufficient member traffic to generate insights."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={Array.isArray(data.members) ? data.members : []}
                      >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d4c1bf"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          borderRadius: "20px",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{
                          paddingTop: "20px",
                          fontSize: "11px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="total"
                        stroke="#00d2d3"
                        strokeWidth={4}
                        dot={false}
                        name="Total Community"
                      />
                      <Line
                        type="monotone"
                        dataKey="joins"
                        stroke="#ff6f61"
                        strokeWidth={3}
                        strokeDasharray="6 6"
                        name="New Ingress"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
              </ProGate>

              {/* Moderation Actions Bar Chart */}
              <ProGate isPro={isPro} featureName="Moderation Trends" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div id="chart-moderation" className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-8 shadow-2xl shadow-text-secondary/5 h-full relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight leading-none mb-1">
                      Resolution Trends
                    </h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      Moderation Stats
                    </p>
                  </div>
                  <ProGate isPro={isPro} featureName="Export Report" featureDescription="Export your moderation metrics as a PDF report in Pro" className="block">
                    <button
                      onClick={() => exportToPDF("chart-moderation", "Resolution_Trends")}
                      disabled={!isPro || exportingChartId === "chart-moderation"}
                      className={`p-3 bg-primary-container/20 text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-sm border border-primary/10 ${!isPro || exportingChartId === "chart-moderation" ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                    >
                      {exportingChartId === "chart-moderation" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  </ProGate>
                </div>
                <div className="h-72 w-full">
                  {!data.moderation || data.moderation.length === 0 ? (
                    <CompactEmptyState 
                      title="No Data Available"
                      description="Insufficient moderation events to generate insights."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={
                          Array.isArray(data.moderation) ? data.moderation : []
                        }
                        stackOffset="expand"
                      >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d4c1bf"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          borderRadius: "20px",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{
                          paddingTop: "20px",
                          fontSize: "11px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      />
                      <Bar
                        dataKey="actions_Extreme"
                        name="Extreme"
                        stackId="a"
                        fill="#ba1a1a"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="actions_Inappropriate"
                        name="Inappropriate"
                        stackId="a"
                        fill="#ff6f61"
                      />
                      <Bar
                        dataKey="actions_Moderate"
                        name="Moderate"
                        stackId="a"
                        fill="#00d2d3"
                      />
                      <Bar
                        dataKey="actions_Spam"
                        name="Spam"
                        stackId="a"
                        fill="#a68986"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
              </ProGate>

              {/* Peak Hours Chart */}
              <ProGate isPro={isPro} featureName="Peak Hours" featureDescription="View complete historical telemetry numbers in Pro." className="block relative h-full">
              <div id="chart-peak-hours" className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-8 shadow-2xl shadow-text-secondary/5 h-full relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight leading-none mb-1">
                      Peak Hours
                    </h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      Community Pulse by Hour
                    </p>
                  </div>
                  <ProGate isPro={isPro} featureName="Export Report" featureDescription="Export your peak activity metrics as a PDF report in Pro" className="block">
                    <button
                      onClick={() => exportToPDF("chart-peak-hours", "Peak_Hours")}
                      disabled={!isPro || exportingChartId === "chart-peak-hours"}
                      className={`p-3 bg-primary-container/20 text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-sm border border-primary/10 ${!isPro || exportingChartId === "chart-peak-hours" ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                    >
                      {exportingChartId === "chart-peak-hours" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  </ProGate>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={
                        // Group messages by hour 0-23
                        Array.from({ length: 24 }, (_, i) => {
                          const hour = i.toString().padStart(2, "0");
                          const hourMsgs = (
                            Array.isArray(data.messages) ? data.messages : []
                          ).filter(
                            (m) => m.hour && m.hour.includes(`T${hour}`),
                          );
                          const avg = hourMsgs.length
                            ? hourMsgs.reduce((a, b) => a + (b.total || 0), 0) /
                              hourMsgs.length
                            : 0;
                          return { hour: `${hour}:00`, avg };
                        })
                      }
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d4c1bf"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="hour"
                        stroke="#8c716d"
                        tick={{ fill: "#8c716d", fontSize: 9, fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                        interval={3}
                      />
                      <YAxis
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#ff6f61", opacity: 0.05 }}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          borderRadius: "20px",
                        }}
                      />
                      <Bar dataKey="avg" fill="#ff6f61" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Command Usage */}
              <div id="chart-commands" className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-8 shadow-2xl shadow-text-secondary/5 lg:col-span-2 relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight leading-none mb-1">
                      Command Usage Trends
                    </h3>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      Command Usage
                    </p>
                  </div>
                  <ProGate isPro={isPro} featureName="Export Report" featureDescription="Export your command usage metrics as a PDF report in Pro" className="block">
                    <button
                      onClick={() => exportToPDF("chart-commands", "Command_Usage")}
                      disabled={!isPro || exportingChartId === "chart-commands"}
                      className={`p-3 bg-primary-container/20 text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 ease-out active:scale-95 shadow-sm border border-primary/10 ${!isPro || exportingChartId === "chart-commands" ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                    >
                      {exportingChartId === "chart-commands" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    </button>
                  </ProGate>
                </div>
                <div className="h-72 w-full">
                  {!data.commands || data.commands.length === 0 ? (
                    <CompactEmptyState 
                      title="No Data Available"
                      description="Insufficient command usage to generate insights."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                      data={Object.entries(
                        (Array.isArray(data.commands)
                          ? data.commands
                          : []
                        ).reduce((acc, curr) => {
                          for (const [k, v] of Object.entries(curr)) {
                            if (
                              k === "date" ||
                              k === "total" ||
                              k === "grantpremium"
                            )
                              continue;
                            acc[k] = (acc[k] || 0) + ((v as number) || 0);
                          }
                          return acc;
                        }, {} as any),
                      )
                        .map(([name, value]) => ({
                          name: `/${name}`,
                          value: value as number,
                        }))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 8)}
                      margin={{ left: 40 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="#8c716d"
                        tick={{
                          fill: "#8c716d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#ff6f61", opacity: 0.05 }}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.4)",
                          borderRadius: "20px",
                        }}
                      />
                      <Bar
                        dataKey="value"
                        fill="#ff6f61"
                        radius={[0, 8, 8, 0]}
                        barSize={20}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </div>
              </ProGate>
            </div>
          </div>
        ) : (
          <div className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-10 shadow-2xl shadow-text-secondary/5 relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary-container/20 flex items-center justify-center text-primary shadow-inner border border-primary/10">
                  <Mail className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-on-surface tracking-tight">
                    Weekly Digest
                  </h3>
                  <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mt-1">
                    Weekly Return on Investment Report
                  </p>
                </div>
              </div>
              <ProGate isPro={isPro} featureName="Weekly Digest" featureDescription="Enable detailed, automated weekly reports of key server metrics sent directly to your channel in Pro." className="block relative">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={digestEnabled}
                    onChange={(e) => toggleDigestEnabled(e.target.checked)}
                    disabled={savingDigest || !isPro}
                  />
                  <div className="w-14 h-8 bg-surface-container-high peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-orange-500 shadow-inner peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                </label>
              </ProGate>
            </div>
            
            <div className="mt-8 grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-sm font-black uppercase tracking-widest text-on-surface mb-3">
                  How it works
                </h4>
                {digestUndefined && isPro && !digestEnabled && (
                  <div className="mb-4 p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                    <p className="text-sm font-medium">
                      <strong>💡 Tip:</strong> This Pro feature is currently <strong>disabled</strong> on your server. Enable it below to receive comprehensive, automated server metric summaries every week!
                    </p>
                  </div>
                )}
                <p className="text-sm text-text-secondary leading-relaxed mb-4">
                  Every week, receive an automated report detailing your server's key metrics. The Weekly Digest provides a comprehensive overview of member growth, message volume trends, top active channels, and detailed moderation statistics, empowering you with actionable insights to track your community's health and ROI.
                </p>
                <p className="text-sm text-text-secondary leading-relaxed mb-4">
                  <strong>Silent Guardian:</strong> Prove the value of SentinL without constantly checking the dashboard. You save time, and your community stays peaceful while you sleep.
                </p>
                <div className="mt-4">
                  <label className="block text-[11px] font-extrabold uppercase tracking-widest text-text-secondary mb-2">
                    Delivery Channel
                  </label>
                  <ChannelSelector
                    channels={channels}
                    value={digestChannelId}
                    onChange={(val) => setDigestChannelId(val)}
                    placeholder="Select Channel (DM to Owner fallback)"
                  />
                </div>
                <ProGate isPro={isPro} featureName="Save Target Channel" featureDescription="Send the digest to automatic channels of your liking in Pro" className="block">
                  <button
                    onClick={saveDigestSettings}
                    disabled={savingDigest || !isPro || (!digestHasChanges && !digestIsSaved)}
                    className={`mt-6 w-full py-3 text-white font-bold rounded-xl transition-all ease-out disabled:hover:translate-y-0 ${
                      digestIsSaved ? "bg-emerald-500 shadow-emerald-500/20" : !digestHasChanges ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30" : "bg-primary hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 shadow-primary/20"
                    } ${savingDigest ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {savingDigest ? (
                      "Saving..."
                    ) : digestIsSaved ? (
                      "Saved"
                    ) : (
                      "Save Settings"
                    )}
                  </button>
                </ProGate>
              </div>
              
              <div className="bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-6 relative">
                 <div className="absolute -top-3 left-6 px-3 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-md">Preview</div>
                 <div className="flex items-start gap-4 mb-4 mt-2">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">S</div>
                    <div>
                      <div className="text-sm font-bold text-on-surface flex items-center gap-2">SentinL <span className="bg-[#5865F2] text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium"><Check className="w-3 h-3" /> BOT</span></div>
                      <div className="text-[11px] text-text-secondary mt-0.5">Today at 8:00 AM</div>
                    </div>
                 </div>
                 <div className="text-sm text-on-surface bg-surface-variant/30 rounded-xl p-4 border border-outline-variant/10">
                    <p className="mb-2"><strong>This week, SentinL blocked 14 toxic messages, stopped 2 spam raids, and your community score went up by +4 points.</strong></p>
                    <p>Your community was peaceful for 98% of the week.</p>
                 </div>
              </div>
            </div>
            
            {!isPro && (
               <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mt-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-[100px] pointer-events-none"></div>
                  <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-2">
                    <Crown className="w-4 h-4" /> Pro Feature
                  </h4>
                  <p className="text-sm text-text-secondary leading-relaxed max-w-3xl">
                    Unlock the PRO tier to receive automated Weekly Digest reports delivered directly to your server. Track member growth, monitor message volume, and analyze moderation metrics without ever having to manually check the dashboard.
                  </p>
               </div>
            )}
          </div>
          )
        ) : (
          <>
            {trainingTab === "analytics" ? (
              <ProGate isPro={isPro} featureName="Heuristic Analytics" featureDescription="Analyze model correction history in Pro." className="w-full block relative">
              <div className="bg-white/95 backdrop-blur-xl border border-outline-variant/20 rounded-[2.5rem] p-10 shadow-2xl shadow-text-secondary/5 relative group hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center gap-4 mb-10">
                  <div className="w-12 h-12 rounded-2xl bg-primary-container/20 flex items-center justify-center text-primary shadow-inner border border-primary/10">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-extrabold text-on-surface tracking-tight">
                      Heuristic Overrides
                    </h3>
                    <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mt-1">
                      AI Corrections Partitioned by Severity
                    </p>
                  </div>
                </div>

                <div className="h-96 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={trainingChartData}
                      margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#d4c1bf"
                        vertical={false}
                        opacity={0.5}
                      />
                      <XAxis
                        dataKey="name"
                        stroke="#8c716d"
                        tick={{
                          fill: "#64748B",
                          fontSize: 11,
                          fontWeight: 900,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={15}
                      />
                      <YAxis
                        stroke="#8c716d"
                        tick={{
                          fill: "#64748B",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                        allowDecimals={false}
                        axisLine={false}
                        tickLine={false}
                        dx={-10}
                      />
                      <Tooltip
                        cursor={{
                          fill: "rgba(56, 114, 255, 0.05)",
                          radius: 12,
                        }}
                        contentStyle={{
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(16px)",
                          borderColor: "rgba(255, 255, 255, 0.5)",
                          borderRadius: "24px",
                          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05)",
                          padding: "16px",
                          borderWidth: "1px",
                        }}
                        itemStyle={{
                          fontWeight: 800,
                          fontSize: "13px",
                          textTransform: "uppercase",
                        }}
                        labelStyle={{
                          fontWeight: 900,
                          color: "#1E293B",
                          marginBottom: "8px",
                          fontSize: "11px",
                          letterSpacing: "0.1em",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        radius={[12, 12, 4, 4]}
                        maxBarSize={80}
                        className="transition-all duration-300"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-12 flex items-center gap-4 p-6 rounded-3xl bg-surface-container/20 border border-outline-variant/10 max-w-2xl mx-auto">
                  <Logo className="w-6 h-6 text-primary shrink-0 opacity-100 drop-shadow-sm font-bold" strokeWidth={4} />
                  <p className="text-[13px] text-text-secondary font-medium leading-relaxed italic text-center mx-auto">
                    "This distribution map visualizes cumulative moderator
                    interventions. High volumes in specific tiers indicate
                    aggressive AI recalibration occurring in real-time."
                  </p>
                </div>
              </div>
              </ProGate>
            ) : (
              <ProGate isPro={isPro} featureName="Full Training Log" featureDescription="Review comprehensive history of all heuristic adjustments in Pro." className="w-full block relative">
              <div className="space-y-8">
                <div className="mb-2">
                  <h3 className="text-xl font-extrabold text-on-surface tracking-tight">
                    Full Training Log
                  </h3>
                  <p className="text-[11px] font-black text-text-secondary uppercase tracking-widest mt-1">
                    Review all adjustments to my moderation heuristics.
                  </p>
                </div>

                {trainingData.filter((d) => d.direction).length === 0 ? (
                  <div className="bg-white/40 backdrop-blur-md border border-white/40 rounded-[3rem] p-4 text-center shadow-xl shadow-primary/5">
                    <EmptyState 
                      title="No calibration data detected."
                      description="Heuristics are currently operating on factory defaults. Recalibrate per-server via context flagging."
                    />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {trainingData
                      .filter((d) => d.direction)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-[2.5rem] p-8 shadow-xl shadow-primary/5 flex flex-col gap-6 group hover:scale-[1.01] transition-all duration-300 ease-out"
                        >
                          <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-outline-variant/10 pb-6">
                            <div className="flex-1 w-full">
                              <div className="flex items-center gap-3 mb-4">
                                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] bg-primary/5 px-3 py-1 rounded-lg border border-primary/10 shadow-sm">
                                  Training Sample
                                </span>
                                <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest flex items-center gap-1.5 opacity-80">
                                  <Clock className="w-3 h-3" />{" "}
                                  {item.timestamp
                                    ? new Date(item.timestamp).toLocaleString(
                                        undefined,
                                        {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                        },
                                      )
                                    : "N/A"}
                                </span>
                              </div>
                              <div className="relative group/content">
                                <div className="absolute -left-1 top-2 bottom-2 w-1.5 bg-primary/20 rounded-full transition-all duration-300 ease-out group-hover/content:bg-primary" />
                                <p className="text-sm text-on-surface font-semibold tracking-tight italic bg-surface-container/30 px-6 py-4 rounded-2xl border border-outline-variant/10 leading-relaxed pl-8">
                                  "{item.content}"
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center justify-center gap-4 bg-white/40 p-4 rounded-[1.25rem] border border-outline-variant/10 shadow-inner min-w-[200px]">
                              <span className="text-[11px] font-black tracking-widest opacity-40 line-through text-text-secondary">
                                {item.originalLevel || "SAFE"}
                              </span>
                              <ChevronRight className="w-4 h-4 text-primary opacity-40" />
                              <span
                                className={`text-[13px] font-black uppercase tracking-[0.15em] px-4 py-2 rounded-xl border shadow-sm ${
                                  item.correctedLevel === "Extreme"
                                    ? "bg-danger/10 text-danger border-danger/20"
                                    : item.correctedLevel === "Inappropriate"
                                      ? "bg-warning/10 text-warning border-warning/20"
                                      : item.correctedLevel === "Moderate"
                                        ? "bg-success/10 text-success border-success/20"
                                        : "bg-surface-container text-text-secondary border-outline-variant/20"
                                }`}
                              >
                                {item.correctedLevel}
                              </span>
                            </div>
                          </div>

                          <div className="bg-surface-container/20 rounded-[2rem] p-8 border border-outline-variant/10 space-y-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:rotate-12 transition-transform duration-300 ease-out">
                              <Settings className="w-20 h-20" />
                            </div>

                            <div className="relative z-10">
                              <h4 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                <User className="w-3.5 h-3.5 opacity-40" />{" "}
                                Admin Command Reference
                              </h4>
                              <p className="text-[15px] text-on-surface font-extrabold leading-relaxed tracking-tight">
                                {item.direction}
                              </p>
                            </div>

                            <div className="mt-2 pt-6 border-t border-outline-variant/10 relative z-10">
                              <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <Logo className="w-4 h-4" /> Training Entry Log
                              </h4>
                              <div className="text-[13px] text-on-surface font-bold leading-relaxed bg-white/60 p-5 rounded-[1.5rem] border border-primary/20 shadow-xl shadow-primary/5">
                                {item.botResponse || "Acknowledged. I have updated my heuristics according to your directive."}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              </ProGate>
            )}
          </>
        )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
