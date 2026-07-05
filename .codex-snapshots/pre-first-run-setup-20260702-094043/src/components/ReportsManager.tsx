import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { EmptyState } from "./EmptyState";
import { formatDistanceToNow, format } from "date-fns";
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  orderBy,
  where,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import { Select } from "./Select";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Flag,
  Search,
  Filter,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  User,
  MessageSquare,
  AlertCircle,
  MoreVertical,
  Shield,
  Trash2,
  Ban,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Settings,
  Bell,
  BarChart3,
  Loader2,
  ListChecks,
  Check,
  Save,
  Archive,
} from "lucide-react";
import { PermissionGateModal } from "./PermissionGateModal";
import { useSaveState } from "../hooks/useSaveState";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Logo } from "./Logo";

import { CopyableId } from "./CopyableId";

// ... skipping to the exact section
import { ReportStatus } from "../types";

export interface Report {
  id: string;
  reporterId: string;
  reporterUsername?: string;
  reportedUserId: string;
  reportedUsername?: string;
  reportedMessageId?: string;
  reportedMessageContent?: string;
  reason: string;
  messageLink?: string;
  status: ReportStatus;
  actionTaken?: string | null;
  moderatorId?: string;
  moderatorNotes?: string;
  timestamp: any;
  resolvedAt?: any;
  assigneeId?: string;
}

interface ReportSettings {
  cooldown: number;
  notifyReporter: boolean;
  modLogChannelId?: string;
}

export default function ReportsManager({
  hideHeader,
}: { hideHeader?: boolean } = {}) {
  const { selectedServerId, tier, isBetaTester, loading: serverLoading, botPermissions, isTrial , isPro} = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (hideHeader) {
      setPortalNode(document.getElementById("reports-tertiary-portal"));
    }
  }, [hideHeader]);

  const [activeTab, setActiveTab] = useState<
    "queue" | "history" | "settings" | "analytics"
  >(() => {
    const hash = window.location.hash.replace("#", "");
    if (["queue", "history", "settings", "analytics"].includes(hash)) {
      return hash as any;
    }
    return "queue";
  });
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (["queue", "history", "settings", "analytics"].includes(hash)) {
      setActiveTab(hash as any);
    }
  }, [location.hash]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (["queue", "history", "settings", "analytics"].includes(hash)) {
        setActiveTab(hash as any);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const [settings, setSettings] = useState<ReportSettings>({
    cooldown: 300,
    notifyReporter: true,
  });
  const { isSaved, setIsSaved, hasChanges, hasChangesRef, resetSaveState, updateBaseline } = useSaveState(settings);
  const [savingSettings, setSavingSettings] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ReportStatus>("all");

  useEffect(() => {
    if (!selectedServerId) return;

    const reportsRef = collection(db, `servers/${selectedServerId}/reports`);
    const q = statusFilter === "all"
      ? query(reportsRef, orderBy("timestamp", "desc"), limit(100))
      : query(reportsRef, where("status", "==", statusFilter), orderBy("timestamp", "desc"), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Report[];
      setReports(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/reports`));

    const sRef = doc(db, `servers/${selectedServerId}/settings/reports`);
    const unsubSettings = onSnapshot(sRef, (sSnap) => {
      if (sSnap.exists()) {
        const newData = sSnap.data() as ReportSettings;
        if (hasChangesRef.current) {
          updateBaseline(() => newData);
        } else {
          setSettings(newData);
          resetSaveState(newData);
        }
      }
    }, (err) => console.error("Report settings snap error", err));

    return () => {
      unsubscribe();
      unsubSettings();
    };
  }, [selectedServerId, statusFilter]);

  useEffect(() => {
    // If reports update, also update the selectedReport if it exists so UI reflects assignment
    if (selectedReport) {
      const updated = reports.find((r) => r.id === selectedReport.id);
      if (updated) setSelectedReport(updated);
    }
  }, [reports]);

  const handleAssign = async (reportId: string) => {
    if (!selectedServerId) return;
    try {
      await updateDoc(
        doc(db, `servers/${selectedServerId}/reports`, reportId),
        {
          assigneeId: auth.currentUser?.uid || "Dashboard Admin",
        },
      );
    } catch (err: any) {
      console.error("Error signing report:", err);
      handleFirestoreError(err, OperationType.UPDATE, `servers/${selectedServerId}/reports`);
      // Fallback alert is fine for Dashboard panel usage
      toast(`Failed to assign report: ${err.message}`);
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!selectedServerId) return;
    if (confirm("Are you sure you want to archive this report?")) {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/guilds/${selectedServerId}/reports/${reportId}/archive`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to archive report");
        }

        setSelectedReport(null);
        toast("Report archived successfully.");
      } catch (err: any) {
        console.error("Error archiving report:", err);
        toast(`Failed to archive report: ${err.message}`);
      }
    }
  };

  const handleAction = async (
    reportId: string,
    action: "dismiss" | "warn" | "timeout" | "ban" | "delete_message",
    reason: string,
  ) => {
    if (!selectedServerId) return;

    if (action === "ban" && botPermissions && !botPermissions.BanMembers) {
      setMissingPermModal("Ban Members");
      return;
    }
    if (action === "timeout" && botPermissions && !botPermissions.ModerateMembers) {
      setMissingPermModal("Moderate Members");
      return;
    }
    if (action === "delete_message" && botPermissions && !botPermissions.ManageMessages) {
      setMissingPermModal("Manage Messages");
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(
        `/api/guilds/${selectedServerId}/reports/${reportId}/resolve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action,
            reason,
            modifierId: auth?.currentUser?.uid || "Dashboard Admin",
          }),
        },
      );

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      const data = await response.json();
      if (!data.success)
        throw new Error(data?.error || "Failed to resolve report");

      setSelectedReport(null);
    } catch (err: any) {
      console.error("Error taking action:", err);
      toast(`Failed to resolve report: ${err.message}`);
    }
  };

  const toggleReportsSetting = async (field: Extract<keyof typeof settings, string>, value: boolean) => {
    if (!selectedServerId) return;
    const newSettings = { ...settings, [field]: value };
    setSettings(newSettings);
    updateBaseline((old: any) => ({ ...old, [field]: value }));
    try {
      await setDoc(doc(db, `servers/${selectedServerId}/settings/reports`), newSettings, { merge: true });
      toast.success("Setting updated.", { id: `${field}-toast`, duration: 2000 });
    } catch (err: any) {
      console.error(`Error toggling ${field}:`, err);
      toast.error("Failed to update setting.", { id: `${field}-toast` });
      setSettings(prev => ({ ...prev, [field]: !value }));
      updateBaseline((old: any) => ({ ...old, [field]: !value }));
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedServerId) return;
    setSavingSettings(true);
    try {
      await setDoc(
        doc(db, `servers/${selectedServerId}/settings/reports`),
        settings,
      );
      setIsSaved(true);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSavingSettings(false);
    }
  };

  if (serverLoading || loading)
    return (
      <div className="space-y-6 sm:space-y-8 pb-32 animate-pulse">
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 overflow-hidden mt-6 mb-8 relative">
          <div className="flex-1 space-y-4">
            <div className="h-10 w-64 bg-surface-container rounded-xl"></div>
            <div className="h-4 w-96 bg-surface-container rounded-md"></div>
          </div>
          <div className="hidden lg:flex gap-4">
             <div className="w-48 h-24 bg-surface-container rounded-3xl"></div>
             <div className="w-48 h-24 bg-surface-container rounded-3xl"></div>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 mb-8 bg-surface-container/20 p-2 rounded-2xl border border-white/40">
           <div className="w-32 h-10 bg-surface-container rounded-xl"></div>
           <div className="w-32 h-10 bg-surface-container rounded-xl"></div>
        </div>
        <div className="bg-white/60 backdrop-blur-md rounded-3xl shadow-xl shadow-primary/5 border border-white/60 overflow-hidden relative min-h-[500px]">
           <div className="p-4 sm:p-6 pb-0 border-b border-outline-variant/10 flex items-center justify-between">
              <div className="h-8 w-48 bg-surface-container rounded-md"></div>
              <div className="h-10 w-64 bg-surface-container rounded-xl"></div>
           </div>
           <div className="p-4 sm:p-6 space-y-4">
              <div className="h-24 w-full bg-surface-container rounded-2xl"></div>
              <div className="h-24 w-full bg-surface-container rounded-2xl"></div>
              <div className="h-24 w-full bg-surface-container rounded-2xl"></div>
           </div>
        </div>
      </div>
    );

  const filteredReports = reports.filter((r) => {
    if (activeTab === "queue" && r.status !== "pending") return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.reason?.toLowerCase().includes(q) ||
        r.reportedUserId?.includes(q) ||
        r.reporterId?.includes(q) ||
        r.reportedUsername?.toLowerCase().includes(q) ||
        r.reporterUsername?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getSignalVolume = () => {
    const volume = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    reports.forEach((r) => {
      let d = r.timestamp?.seconds
        ? new Date(r.timestamp.seconds * 1000)
        : new Date(r.timestamp);
      if (!isNaN(d.getTime())) {
        const diffTime = Math.abs(today.getTime() - d.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays < 7) {
          volume[6 - diffDays]++;
        }
      }
    });

    const labels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(
        d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
      );
    }

    const maxVolume = Math.max(...volume, 1);
    return { volume, labels, maxVolume };
  };

  const getCommonViolations = () => {
    if (reports.length === 0) return [];

    const reasons: Record<string, number> = {};
    reports.forEach((r) => {
      if (!r.reason) return;
      const words = r.reason.trim().split(" ").slice(0, 3).join(" ");
      const key =
        words.charAt(0).toUpperCase() +
        words.slice(1).toLowerCase() +
        (r.reason.split(" ").length > 3 ? "..." : "");
      reasons[key] = (reasons[key] || 0) + 1;
    });

    const sorted = Object.entries(reasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const colors = ["bg-danger", "bg-warning", "bg-primary"];

    return sorted.map((item, i) => ({
      label: item[0],
      color: colors[i],
      percent: Math.round((item[1] / reports.length) * 100),
    }));
  };

  const signalVolumeData = getSignalVolume();
  const violationsData = getCommonViolations();

  return (
    <div className="space-y-8 pb-32">
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      <header
        className={`flex flex-col md:flex-row ${hideHeader ? "justify-start" : "justify-between"} items-start md:items-center gap-6 ${hideHeader ? "w-full" : "bg-white/60 backdrop-blur-xl p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white shadow-xl shadow-primary/5"}`}
      >
        {!hideHeader && (
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-danger-container/20 rounded-2xl flex items-center justify-center text-danger border border-danger/10 shadow-inner">
              <Flag className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight">
                Reports Management
              </h1>
              <p className="text-text-secondary text-[9px] sm:text-[11px] font-black uppercase tracking-widest mt-1">
                Manage and review server reports.
              </p>
            </div>
          </div>
        )}
        {hideHeader && portalNode
          ? createPortal(
              <nav className="flex w-full gap-1 items-center justify-between">
                {[
                  { id: "queue", label: "Active Reports", icon: Clock },
                  { id: "history", label: "Report History", icon: ListChecks },
                  { id: "analytics", label: "Insights", icon: BarChart3 },
                  { id: "settings", label: "Settings", icon: Settings },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      window.history.replaceState(null, "", `#${tab.id}`);
                    }}
                    className={`flex-1 relative px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-300 ease-out flex items-center justify-center gap-1.5 ${
                      activeTab === tab.id
                        ? "text-primary bg-surface/50 shadow-sm border border-outline-variant/10"
                        : "text-text-secondary/80 hover:text-primary hover:bg-surface-container/50"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="reports-sub-tab"
                        className="absolute inset-0 bg-white rounded-lg shadow-sm border border-outline-variant/10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-1">
                      <tab.icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                      {tab.id === "queue" &&
                        reports.filter((r) => r.status === "pending").length > 0 && (
                          <span className="bg-danger text-white text-[8px] px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                            {reports.filter((r) => r.status === "pending").length}
                          </span>
                        )}
                    </span>
                  </button>
                ))}
              </nav>,
              portalNode
            )
          : !hideHeader && (
              <nav className="flex w-full mt-2 items-center justify-between gap-1 bg-surface-container/30 border border-outline-variant/5 rounded-2xl p-1.5 ml-2">
                {[
                  { id: "queue", label: "Active Reports", icon: Clock },
                  { id: "history", label: "Report History", icon: ListChecks },
                  { id: "analytics", label: "Insights", icon: BarChart3 },
                  { id: "settings", label: "Settings", icon: Settings },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      window.history.replaceState(null, "", `#${tab.id}`);
                    }}
                    className={`flex-1 relative px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all duration-300 ease-out flex items-center justify-center gap-1.5 ${
                      activeTab === tab.id
                        ? "text-primary bg-primary/5 shadow-sm border border-primary/10"
                        : "text-text-secondary/80 hover:text-primary hover:bg-surface-container/50"
                    }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="reports-sub-tab"
                        className="absolute inset-0 bg-primary/10 rounded-lg border border-primary/10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-1">
                      <tab.icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      {tab.id === "queue" &&
                        reports.filter((r) => r.status === "pending").length > 0 && (
                          <span className="bg-danger text-white text-[8px] px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                            {reports.filter((r) => r.status === "pending").length}
                          </span>
                        )}
                    </span>
                  </button>
                ))}
              </nav>
            )}
      </header>

      {activeTab === "queue" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* List View */}
          <div
            className={`${selectedReport ? "hidden lg:block lg:col-span-1" : "col-span-full"}`}
          >
            <div className="bg-white/40 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] border border-white/60 overflow-hidden shadow-xl shadow-primary/5">
              <div className="sticky top-0 z-20 p-4 sm:p-6 border-b border-outline-variant/20 bg-surface-container/90 backdrop-blur-3xl flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-primary transition-colors duration-300 ease-out" />
                  <input
                    type="text"
                    placeholder="Search reports..."
                    className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl pl-12 pr-4 py-3 sm:py-3.5 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all duration-300 ease-out"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Mobile / Side List View */}
              <div className={`divide-y divide-outline-variant/10 ${selectedReport ? "block" : "block sm:hidden"}`}>
              <AnimatePresence>
                {filteredReports.map((report, idx) => (
                  <motion.div
                    key={report.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                    exit={{ opacity: 0, scale: 0.95, overflow: 'hidden', transition: { duration: 0.2, ease: "easeIn" } }}
                    onClick={() => setSelectedReport(report)}
                    className="p-5 active:bg-white/60 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-danger-container/20 flex items-center justify-center text-danger border border-danger/10 shadow-inner">
                          <Flag className="w-4 h-4" />
                        </div>
                        <span className="font-extrabold text-sm text-on-surface tracking-tight">
                          @{report.reportedUsername || report.reportedUserId}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          report.status === "pending"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : report.status === "dismissed"
                              ? "bg-surface-container text-text-secondary border-outline-variant/30"
                              : "bg-success/10 text-success border-success/20"
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-text-secondary line-clamp-2 mb-3">
                      {report.reason}
                    </p>
                    <div className="flex items-center justify-between text-[9px] font-black text-text-secondary uppercase tracking-widest">
                      <span title={format(new Date(report.timestamp?.seconds * 1000 || report.timestamp), "yyyy-MM-dd HH:mm:ss")}>
                        {formatDistanceToNow(new Date(report.timestamp?.seconds * 1000 || report.timestamp), { addSuffix: true })}
                      </span>
                      <ChevronRight className="w-4 h-4 opacity-40" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
                {filteredReports.length === 0 && (
                  <EmptyState 
                    title="All clear! No pending issues."
                    description="Your server is operating normally. User reports will appear here."
                  />
                )}
              </div>

              {/* Tablet/Desktop Table View */}
              <div className={`overflow-x-auto ${selectedReport ? "hidden" : "hidden sm:block"}`}>
                {filteredReports.length === 0 ? (
                  <EmptyState 
                    title="All clear! No pending issues."
                    description="Your server is operating normally. User reports will appear here."
                  />
                ) : (
                  <table className="w-full text-left text-sm min-w-[700px] md:min-w-0">
                    <thead className="sticky sm:top-[99px] lg:top-[99px] z-10 bg-surface-container/90 backdrop-blur-md text-text-secondary uppercase text-[9px] font-black tracking-[0.2em] border-b border-outline-variant/10 shadow-sm">
                      <tr>
                        <th className="px-6 sm:px-8 py-5">Reporter & Reason</th>
                        <th className="px-6 sm:px-8 py-5">Status</th>
                        <th className="px-6 sm:px-8 py-5">Timestamp</th>
                        <th className="px-6 sm:px-8 py-5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      <AnimatePresence>
                      {filteredReports.map((report, idx) => (
                        <motion.tr
                          key={report.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                          onClick={() => setSelectedReport(report)}
                          className={`hover:bg-white/60 cursor-pointer transition-all duration-300 group ${selectedReport?.id === report.id ? "bg-white/80" : ""}`}
                        >
                          <td className="px-6 sm:px-8 py-6 min-w-0">
                            <div className="flex justify-start items-start gap-3">
                              <div className="shrink-0 mt-0.5">
                                <div className="w-9 h-9 rounded-xl bg-danger-container/20 flex items-center justify-center text-danger group-hover:scale-110 transition-transform duration-300 ease-out shadow-inner border border-danger/10">
                                  <Flag className="w-5 h-5" />
                                </div>
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <div className="text-on-surface font-bold text-sm tracking-tight truncate max-w-[120px] sm:max-w-none">
                                    @{report.reportedUsername || report.reportedUserId}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(report.reportedUserId);
                                      toast.success("User ID copied");
                                    }}
                                    title="Copy User ID"
                                    className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out inline-flex shrink-0"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                </div>
                                <div className="text-[10px] flex flex-col items-start gap-0.5 mt-0.5">
                                  <span className="text-text-secondary font-semibold">
                                    ID: <span className="font-mono">{report.reportedUserId}</span>
                                  </span>
                                  <span
                                    className="text-text-secondary font-medium cursor-help"
                                    title={report.timestamp ? format(new Date(report.timestamp?.seconds * 1000 || report.timestamp), "yyyy-MM-dd HH:mm:ss") : ""}
                                  >
                                    {report.reason}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 sm:px-8 py-6 text-center sm:text-left whitespace-nowrap">
                            <span
                              className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm ${
                                report.status === "pending"
                                  ? "bg-primary-container/30 text-primary border border-primary/20"
                                  : report.status === "dismissed"
                                    ? "bg-surface-container text-text-secondary border border-outline-variant/30"
                                    : "bg-success-container/30 text-success border border-success/20"
                              }`}
                            >
                              {report.status}
                            </span>
                          </td>
                          <td className="px-6 sm:px-8 py-6 text-[11px] font-black text-text-secondary uppercase tracking-widest whitespace-nowrap">
                            <span title={format(new Date(report.timestamp?.seconds * 1000 || report.timestamp), "yyyy-MM-dd HH:mm:ss")}>
                              {formatDistanceToNow(new Date(report.timestamp?.seconds * 1000 || report.timestamp), { addSuffix: true })}
                            </span>
                          </td>
                          <td className="px-6 sm:px-8 py-6 text-right">
                            <ChevronRight className="w-5 h-5 text-text-secondary group-hover:text-primary group-hover:translate-x-1 transition-all duration-300 ease-out ml-auto opacity-40 group-hover:opacity-100" />
                          </td>
                        </motion.tr>
                      ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Detail View */}
          <AnimatePresence>
            {selectedReport && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="lg:col-span-2 bg-white/60 backdrop-blur-xl rounded-[2rem] sm:rounded-[2.5rem] border border-white shadow-2xl shadow-primary/5 flex flex-col h-fit overflow-hidden sticky top-8"
              >
                <div className="p-6 sm:p-8 border-b border-primary/20 flex justify-between items-center bg-primary">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <button
                      onClick={() => setSelectedReport(null)}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/20 text-white hover:bg-white/30 transition-all duration-300 ease-out"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight flex items-center gap-2 sm:gap-3">
                        Report Details: {selectedReport.id.substring(0, 8)}
                        <span
                          className={`text-[9px] sm:text-[10px] uppercase font-black px-2 py-0.5 rounded-md tracking-wider ${selectedReport.status === "pending" ? "bg-white/20 text-white border border-white/30" : "bg-white/20 text-white border border-white/30"}`}
                        >
                          {selectedReport.status}
                        </span>
                      </h3>
                      <p className="text-[9px] font-black text-white/80 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
                        {selectedReport.status === "pending" ? (
                          selectedReport.assigneeId ? (
                            <span className="text-primary font-bold">
                              Assigned to:{" "}
                              {selectedReport.assigneeId ===
                              (auth.currentUser?.uid || "Dashboard Admin")
                                ? "You"
                                : selectedReport.assigneeId.substring(0, 10)}
                            </span>
                          ) : (
                            "Unassigned"
                          )
                        ) : (
                          "Resolved"
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedReport.status === "pending" &&
                      !selectedReport.assigneeId && (
                        <button
                          onClick={() => handleAssign(selectedReport.id)}
                          className="px-4 sm:px-5 h-10 sm:h-12 bg-white hover:bg-white/90 text-primary rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-sm shadow-black/5 hover:shadow-md hover:scale-[1.02] active:scale-95 flex items-center gap-2"
                        >
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Take Report</span><span className="sm:hidden">Take</span>
                        </button>
                      )}
                    <button onClick={() => handleDelete(selectedReport.id)} className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-2xl border border-white/20 flex items-center justify-center text-white hover:bg-white/30 hover:border-white/40 transition-all duration-300 ease-out active:scale-90 shadow-sm" title="Archive Report">
                      <Archive className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6 sm:space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="bg-white/40 p-4 sm:p-5 rounded-2xl border border-outline-variant/20 shadow-inner">
                      <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-3 ml-1">
                        Reporter
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-container/20 flex items-center justify-center text-primary shadow-sm space-y-4 shadow-xl shadow-primary/5">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-on-surface tracking-tight text-sm truncate max-w-[120px]">
                              @
                              {selectedReport.reporterUsername ||
                                selectedReport.reporterId}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selectedReport.reporterId);
                                toast.success("User ID copied");
                              }}
                              title="Copy User ID"
                              className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out inline-flex shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[9px] text-text-secondary font-medium truncate mt-0.5">
                            UID: <CopyableId id={selectedReport.reporterId} />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/40 p-4 sm:p-5 rounded-2xl border border-outline-variant/20 shadow-inner">
                      <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-3 ml-1">
                        Reported User
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-danger-container/20 flex items-center justify-center text-danger shadow-sm">
                          <Logo className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-on-surface tracking-tight text-sm truncate max-w-[120px]">
                              @
                              {selectedReport.reportedUsername ||
                                selectedReport.reportedUserId}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(selectedReport.reportedUserId);
                                toast.success("User ID copied");
                              }}
                              title="Copy User ID"
                              className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out inline-flex shrink-0"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-[9px] text-text-secondary font-medium truncate mt-0.5">
                            UID: <CopyableId id={selectedReport.reportedUserId} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-surface-container/20 p-5 sm:p-6 rounded-3xl border border-outline-variant/10 space-y-3 sm:space-y-4 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300 ease-out">
                      <MessageSquare className="w-10 sm:w-12 h-10 sm:h-12" />
                    </div>
                    <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest leading-none">
                      Reason
                    </div>
                    <p className="text-on-surface font-semibold italic leading-relaxed text-xs sm:text-sm">
                      "{selectedReport.reason}"
                    </p>
                  </div>

                  {selectedReport.reportedMessageContent && (
                    <div className="bg-surface-container/20 p-5 sm:p-6 rounded-3xl border border-outline-variant/10 space-y-4 sm:space-y-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest leading-none">
                          Reported Message
                        </div>
                        {selectedReport.messageLink && (
                          <a
                            href={selectedReport.messageLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-black text-primary flex items-center gap-1.5 hover:underline tracking-widest"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> JUMP TO
                            MESSAGE
                          </a>
                        )}
                      </div>
                      <div className="bg-white/80 p-4 sm:p-5 rounded-2xl border border-outline-variant/10 text-xs sm:text-sm font-medium text-on-surface relative shadow-inner">
                        <span className="absolute -left-2 top-4 w-4 h-4 bg-white rotate-[-45deg] border-l border-t border-outline-variant/10" />
                        {selectedReport.reportedMessageContent}
                      </div>
                    </div>
                  )}

                  {selectedReport.status === "pending" ? (
                    <div className="pt-6 sm:pt-8 border-t border-outline-variant/10">
                      <div className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em] mb-4 ml-1">
                        Take Action
                      </div>

                      <div className="mb-6">
                        <textarea
                          placeholder="Optional: Enter moderator note..."
                          className="w-full bg-surface-container/30 border border-outline-variant/30 rounded-2xl p-4 text-xs sm:text-sm font-medium text-on-surface focus:outline-primary/50 min-h-[50px] max-h-[200px] resize-none overflow-y-auto"
                          id="modReasonInput"
                          onChange={(e) => {
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
                        {[
                          {
                            action: "dismiss",
                            icon: CheckCircle,
                            label: "Dismiss",
                            color: "success",
                          },
                          {
                            action: "warn",
                            icon: AlertTriangle,
                            label: "Warn",
                            color: "warning",
                          },
                          {
                            action: "timeout",
                            icon: Clock,
                            label: "Mute",
                            color: "primary",
                          },
                          {
                            action: "ban",
                            icon: Ban,
                            label: "Ban",
                            color: "danger",
                          },
                          {
                            action: "delete_message",
                            icon: Trash2,
                            label: "Purge",
                            color: "danger",
                          },
                        ].map((btn) => (
                          <button
                            key={btn.action}
                            onClick={() => {
                              const reasonInput = document.getElementById(
                                "modReasonInput",
                              ) as HTMLTextAreaElement;
                              const userReason = reasonInput?.value.trim();
                              handleAction(
                                selectedReport.id,
                                btn.action as any,
                                userReason ||
                                  `${btn.label} issued for violation.`,
                              );
                            }}
                            className="flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-outline-variant/20 bg-white/40 hover:bg-white hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 ease-out group active:scale-95"
                          >
                            <div
                              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300 ease-out bg-surface-container/50 text-text-secondary group-hover:bg-${btn.color}/10 group-hover:text-${btn.color}`}
                            >
                              <btn.icon className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ease-out group-hover:scale-110" />
                            </div>
                            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-center truncate w-full">
                              {btn.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="pt-6 sm:pt-8 border-t border-outline-variant/10">
                      <div className="bg-success-container/10 p-5 sm:p-6 rounded-3xl border border-success/20 overflow-hidden relative group">
                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:rotate-12 transition-transform duration-300 ease-out">
                          <CheckCircle className="w-20 sm:w-24 h-20 sm:h-24 text-success" />
                        </div>
                        <div className="flex items-center gap-2.5 text-success font-black text-[10px] sm:text-xs uppercase tracking-widest mb-6">
                          <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5" />
                          Report Resolved
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 relative z-10">
                          <div>
                            <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest block mb-2 opacity-60">
                              Action Taken
                            </span>
                            <div className="text-[10px] font-black text-on-surface uppercase tracking-widest bg-success/10 px-3 py-1 rounded-lg w-fit border border-success/20 shadow-sm">
                              {selectedReport.actionTaken}
                            </div>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest block mb-2 opacity-60">
                              Verified By
                            </span>
                            <div className="text-xs sm:text-sm font-extrabold text-on-surface tracking-tight">
                              @{selectedReport.moderatorId || "Central-AI"}
                            </div>
                          </div>
                          <div className="col-span-full">
                            <span className="text-[9px] font-black text-text-secondary uppercase tracking-widest block mb-2 opacity-60">
                              Moderator Notes
                            </span>
                            <p className="text-[11px] sm:text-xs font-semibold text-on-surface italic bg-white/40 p-3 rounded-xl border border-outline-variant/10">
                              "
                              {selectedReport.moderatorNotes ||
                                "No notes appended to this file."}
                              "
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : activeTab === "history" ? (
        <div className="space-y-8">
          {/* Filter Bar */}
          <div className="bg-white/40 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] border border-white/60 p-4 sm:p-6 shadow-xl shadow-primary/5 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 group w-full sm:w-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary group-focus-within:text-primary transition-colors duration-300 ease-out" />
              <input
                type="text"
                placeholder="Search history..."
                className="w-full bg-white/60 border border-outline-variant/20 rounded-2xl pl-12 pr-4 py-3 sm:py-3.5 text-sm font-bold focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all duration-300 ease-out"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              className="w-[160px]"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "all", label: "All Status" },
                { value: "approved", label: "Approved" },
                { value: "dismissed", label: "Dismissed" },
                { value: "actioned", label: "Actioned" }
              ]}
            />
          </div>

          {/* Timeline view */}
          <div className="space-y-6">
            {filteredReports.length === 0 ? (
              <div className="py-24 text-center align-middle bg-white/40 backdrop-blur-md rounded-[2rem] sm:rounded-[2.5rem] border border-white/60 shadow-xl shadow-primary/5">
                <EmptyState 
                  title="History is empty."
                  description="No past reports match your filters."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredReports.map((report) => (
                  <div key={report.id} className="relative bg-white/80 backdrop-blur-md border border-white/40 shadow-xl shadow-primary/5 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 rounded-[2.5rem] p-6 lg:p-8 flex flex-col overflow-hidden group">
                    <div className={`absolute -right-16 -top-16 w-40 h-40 rounded-full blur-3xl opacity-20 transition-all duration-500 group-hover:opacity-40 group-hover:scale-110 ${
                      report.status === "dismissed" ? "bg-text-secondary" :
                      report.status === "pending" ? "bg-primary" : "bg-success"
                    }`} />
                    
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3 relative z-10 w-full">
                        <div className={`w-12 h-12 rounded-[1.25rem] flex shrink-0 items-center justify-center border shadow-inner ${
                          report.status === "dismissed" ? "bg-surface-container text-text-secondary border-outline-variant/30" :
                          report.status === "pending" ? "bg-primary-container/30 text-primary border-primary/20" :
                          "bg-success-container/30 text-success border-success/20"
                        }`}>
                          {report.status === "dismissed" ? <Ban className="w-5 h-5" /> :
                           report.status === "pending" ? <Clock className="w-5 h-5" /> :
                           <CheckCircle className="w-5 h-5" />}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`px-2.5 py-1 w-fit rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-sm border ${
                            report.status === "dismissed" ? "bg-surface-container border-outline-variant/20 text-text-secondary block" :
                            report.status === "pending" ? "bg-primary-container/30 border-primary/20 text-primary block" :
                            "bg-success-container/30 border-success/20 text-success block"
                          }`}>
                            {report.status}
                          </span>
                          <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mt-2 truncate w-full flex items-center gap-1.5" title={format(new Date(report.timestamp?.seconds * 1000 || report.timestamp), "yyyy-MM-dd HH:mm:ss")}>
                            <Clock className="w-3 h-3 shrink-0" />
                            {formatDistanceToNow(new Date(report.timestamp?.seconds * 1000 || report.timestamp), { addSuffix: true })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative z-10 space-y-5 flex-1">
                      <div className="bg-surface-container/30 border border-outline-variant/10 rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden group/target">
                        <div className="absolute top-0 right-0 p-2 opacity-5 scale-150 transform translate-x-2 -translate-y-2 group-hover/target:rotate-12 transition-all duration-300">
                          <Logo className="w-12 h-12" />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-danger-container/20 flex shrink-0 items-center justify-center text-danger/80">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-0.5">Action Against</div>
                          <div className="font-extrabold text-sm text-on-surface truncate">@{report.reportedUsername || report.reportedUserId}</div>
                        </div>
                      </div>

                      <div className="flex-1 bg-white/40 border border-outline-variant/10 rounded-2xl p-4 shadow-inner">
                          <div className="text-[9px] font-black text-text-secondary uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3" /> Reason
                          </div>
                          <p className="text-sm font-semibold text-on-surface line-clamp-3 italic">
                            "{report.reason}"
                          </p>
                      </div>
                    </div>

                    <div className="mt-6 pt-5 border-t border-outline-variant/10 flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-2 text-xs font-bold text-text-secondary truncate pr-3">
                        <span className="w-6 h-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-primary"><User className="w-3 h-3" /></span>
                        <span className="truncate">@{report.reporterUsername || report.reporterId}</span>
                      </div>
                      {(report as any).actionTaken && (
                        <div className="text-[8px] uppercase font-black tracking-widest px-2.5 py-1.5 bg-surface-container rounded-md text-on-surface border border-outline-variant/20 shrink-0 shadow-sm whitespace-nowrap">
                          {(report as any).actionTaken}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "settings" ? (
        <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-xl shadow-primary/5 w-full">
          <div className="px-6 sm:px-8 py-5 sm:py-6 border-b border-outline-variant/20 bg-surface-container/30">
            <div className="flex items-center gap-3">
              <h2 className="text-lg sm:text-xl font-extrabold text-on-surface tracking-tight">
                Report Settings
              </h2>
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-text-secondary uppercase tracking-widest mt-1">
              Adjust cooldowns and notification preferences.
            </p>
          </div>
          <div className="p-6 sm:p-8 space-y-8 sm:space-y-10">
            <div className="space-y-4 sm:space-y-6 pt-2 sm:pt-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[12px] sm:text-sm font-extrabold text-on-surface uppercase tracking-widest border-b-2 border-primary pb-1 inline-block">
                  Report Functionality
                </h3>
              </div>

              <div className="space-y-6 sm:space-y-8 pl-1">
                <div>
                  <label className="block text-[10px] font-black uppercase text-text-secondary mb-3 tracking-widest">
                    Report Cooldown (Seconds)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      className="w-full bg-surface-container/50 border border-outline-variant/20 rounded-2xl px-5 py-4 font-black text-sm focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all duration-300 ease-out shadow-sm text-on-surface cursor-pointer"
                      value={settings.cooldown}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          cooldown: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center pt-2 group">
                  <div className="relative flex items-center cursor-pointer">
                    <input
                      id="notifyReporter"
                      type="checkbox"
                      checked={settings.notifyReporter}
                      onChange={(e) => toggleReportsSetting("notifyReporter", e.target.checked)}
                      className="peer h-6 w-6 opacity-0 absolute cursor-pointer z-10"
                    />
                    <div
                      className={`h-6 w-6 rounded-lg border-2 transition-all duration-300 ease-out flex items-center justify-center ${settings.notifyReporter ? "bg-orange-500 border-orange-500 shadow-md shadow-orange-500/20" : "bg-surface-container border-outline-variant peer-hover:border-orange-500/50"}`}
                    >
                      {settings.notifyReporter && (
                        <Check className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    <label
                      htmlFor="notifyReporter"
                      className="text-sm font-bold text-on-surface cursor-pointer select-none"
                    >
                      Notify Reporter
                    </label>
                    <p className="text-[10px] font-medium text-text-secondary uppercase tracking-widest mt-1 opacity-60">
                      Send a DM to users when their report is actioned.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 sm:pt-8 border-t border-outline-variant/20">
              <motion.button animate={isSaved ? { scale: [1, 1.05, 1], transition: { duration: 0.3 } } : {}} whileTap={{ scale: hasChanges ? 0.95 : 1 }}
                onClick={handleSaveSettings}
                disabled={savingSettings || (!hasChanges && !isSaved)}
                className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-lg flex items-center justify-center gap-2 ${
                  isSaved
                    ? "bg-emerald-500 shadow-emerald-500/20 text-white hover:bg-emerald-600"
                    : !hasChanges
                      ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30"
                      : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
                } ${savingSettings ? "opacity-50 cursor-wait" : ""}`}
              >
                {savingSettings ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSaved ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                {savingSettings
                  ? "Verifying..."
                  : isSaved
                    ? "Changes Secured"
                    : "Save Changes"}
              </motion.button>
            </div>
          </div>
        </div>
      ) : activeTab === "analytics" ? (
        <div className="space-y-6 sm:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5 group hover:shadow-2xl transition-all duration-300">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4 border border-primary/20 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-black text-text-secondary uppercase tracking-widest mb-1">Total Reports</p>
              <h3 className="text-4xl font-black text-on-surface">{reports.length}</h3>
            </div>
            
            <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5 group hover:shadow-2xl transition-all duration-300">
              <div className="w-12 h-12 bg-warning/10 rounded-2xl flex items-center justify-center text-warning mb-4 border border-warning/20 group-hover:scale-110 transition-transform">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-black text-text-secondary uppercase tracking-widest mb-1">Pending Action</p>
              <h3 className="text-4xl font-black text-on-surface">
                {reports.filter(r => r.status === "pending").length}
              </h3>
            </div>
            
            <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5 group hover:shadow-2xl transition-all duration-300">
              <div className="w-12 h-12 bg-success/10 rounded-2xl flex items-center justify-center text-success mb-4 border border-success/20 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-6 h-6" />
              </div>
              <p className="text-xs sm:text-sm font-black text-text-secondary uppercase tracking-widest mb-1">Resolution Rate</p>
              <h3 className="text-4xl font-black text-on-surface">
                {reports.length > 0 ? Math.round(((reports.length - reports.filter(r => r.status === "pending").length) / reports.length) * 100) : 0}%
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5 lg:col-span-2">
              <h3 className="text-lg font-black text-on-surface tracking-tight mb-8">Report Volume (Last 7 Days)</h3>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={signalVolumeData.labels.map((label, idx) => ({ name: label, value: signalVolumeData.volume[idx] }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: "var(--color-text-secondary)", fontSize: 12, fontWeight: 600 }}
                      dy={10}
                    />
                    <Tooltip 
                      cursor={{ fill: "var(--color-surface-container)", opacity: 0.5 }}
                      contentStyle={{ 
                        borderRadius: '24px', 
                        border: '1px solid rgba(255,255,255,0.4)', 
                        background: 'rgba(255, 255, 255, 0.9)', 
                        backdropFilter: 'blur(10px)', 
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        fontWeight: 'bold',
                        color: 'var(--color-on-surface)',
                        padding: '12px 20px'
                      }}
                      itemStyle={{ color: 'var(--color-primary)', fontWeight: 900 }}
                    />
                    <Bar dataKey="value" name="Reports" fill="var(--color-primary)" radius={[8, 8, 8, 8]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] p-6 sm:p-8 shadow-xl shadow-primary/5">
              <h3 className="text-lg font-black text-on-surface tracking-tight mb-8">Common Violations</h3>
              <div className="space-y-6">
                {violationsData.length > 0 ? violationsData.map((v, i) => (
                  <div key={i} className="group cursor-default">
                    <div className="flex justify-between items-end mb-2">
                      <span className="font-bold text-on-surface text-sm line-clamp-1 pr-4">{v.label}</span>
                      <span className="font-black text-text-secondary text-sm">{v.percent}%</span>
                    </div>
                    <div className="h-3 w-full bg-surface-container rounded-full overflow-hidden shadow-inner">
                      <div 
                        className={`h-full rounded-full ${v.color} transition-all duration-1500 ease-out group-hover:opacity-80`} 
                        style={{ width: `${v.percent}%` }}
                      ></div>
                    </div>
                  </div>
                )) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 opacity-60">
                    <AlertCircle className="w-10 h-10 text-text-secondary mb-3" />
                    <p className="text-text-secondary font-bold text-sm">Not enough report data to identify patterns.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
