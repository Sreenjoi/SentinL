import { useState, useEffect, useMemo, useRef } from "react";
import { EmptyState } from "./EmptyState";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  setDoc,
  increment,
  or,
  and,
} from "firebase/firestore";
import { ProGate } from "./ProGate";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { formatDistanceToNow, format } from "date-fns";
import {
  CheckCircle,
  Trash2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shield,
  Bot,
  Filter,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useServer } from "../context/ServerContext";
import { Select } from "./Select";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { CopyableId } from "./CopyableId";
import { Logo } from "./Logo";
import { PermissionGateModal } from "./PermissionGateModal";
import { RecentBotActions } from "./RecentBotActions";

interface FlaggedMessage {
  id: string; // Firestore Doc ID
  messageId?: string; // Discord Message ID
  serverId: string;
  channelId: string;
  authorId: string;
  authorUsername: string;
  authorAvatar?: string | null;
  content: string;
  level: string;
  confidence: number;
  reason: string;
  primaryCategory?: string;
  secondaryCategories?: string[];
  status: string;
  actionTaken: string;
  timestamp: any;
  detectionMethod?: string;
  matchedKeyword?: string;
  contextConsidered?: string;
  model_used?: string;
  isDeleted?: boolean;
  isWarned?: boolean;
  isApproved?: boolean;
}

function severityBorderColor(level: string): string {
  switch (level) {
    case "Extreme": return "border-l-danger";
    case "Inappropriate": return "border-l-orange-400";
    case "Moderate": return "border-l-success";
    case "Spam": return "border-l-blue-400";
    default: return "border-l-outline-variant/30";
  }
}

const formatModelUsed = (modelStr?: string) => {
  if (!modelStr) return "";
  const lower = modelStr.toLowerCase();
  
  if (lower.includes("keyword")) {
    return "Keyword Fallback";
  }
  if (lower.includes("groq_fallback")) {
    if (lower.includes("70b") || lower.includes("premium")) {
      return "Fallback Premium Analysis";
    }
    if (lower.includes("fast")) {
      return "Fallback Fast-Pass";
    }
    return "Fallback Deep Analysis";
  }
  if (lower.includes("cloudflare") || lower.includes("qwen")) {
    if (lower.includes("compact_linguistic")) {
      return "Linguistic Check";
    }
    if (lower.includes("fast")) {
      return "Fast-Pass Triage";
    }
    if (lower.includes("context")) {
      return "Context Analysis";
    }
    return "Deep Analysis";
  }
  if (lower.includes("premium") || lower.includes("70b")) {
    return "Premium Analysis";
  }
  if (lower.includes("primary_fast")) {
    return "Fast-Pass Triage";
  }
  if (lower.includes("primary") || lower.includes("llama")) {
    return "Deep Analysis";
  }
  return modelStr.toUpperCase().replace(/_/g, " ");
};

export default function ModQueue({
  hideHeader,
}: { hideHeader?: boolean } = {}) {
  const [user] = useAuthState(auth);
  const {
    selectedServerId,
    tier,
    isTrial,
    isBetaTester,
    loading: serverLoading,
    intentsWarning,
    botPermissions, isPro} = useServer();
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);
  const [messages, setMessages] = useState<FlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<{ id: string; action: string } | null>(null);
  const [serverStats, setServerStats] = useState({
    todayFlags: 0,
    totalFlags: 0,
  });
  const [trainingFeedback, setTrainingFeedback] = useState<
    Record<string, { text: string; timeoutId: any }>
  >({});
  const [trainedLevels, setTrainedLevels] = useState<Record<string, string>>(
    {},
  );
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [activeTrainingInput, setActiveTrainingInput] = useState<string | null>(
    null,
  );
  const [trainingDirections, setTrainingDirections] = useState<
    Record<string, string>
  >({});
  
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);
  const [flagFilter, setFlagFilter] = useState<string>("All");
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    setCurrentPage(1);
    if (!user || !selectedServerId) {
      setMessages([]);
      setServerStats({ todayFlags: 0, totalFlags: 0 });
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      where("status", "==", "pending")
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs: FlaggedMessage[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as FlaggedMessage);
      });
      msgs.sort((a, b) => {
        const timeA = a.timestamp?.toDate
          ? a.timestamp.toDate().getTime()
          : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate
          ? b.timestamp.toDate().getTime()
          : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      setMessages(msgs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "flaggedMessages");
    });

    const unsubscribeServer = onSnapshot(
      doc(db, "servers", selectedServerId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setServerStats({
            todayFlags: data.todayFlags || 0,
            totalFlags: data.totalFlags || 0,
          });
        } else {
          setServerStats({ todayFlags: 0, totalFlags: 0 });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `servers/${selectedServerId}`);
      }
    );

    return () => {
      unsubscribeMessages();
      unsubscribeServer();
    };
  }, [user, selectedServerId]);

  const handleExport = () => {
    if (!messages.length) {
      toast.error("No messages to export.");
      return;
    }
    const confirmed = window.confirm(
      "This export includes flagged message evidence and moderator reasons. Only download it if you are authorized to handle this server's moderation data."
    );
    if (!confirmed) return;

    const headers = "ID,Author,Content,Reason,Level,Status\n";
    const csv = messages.map(m => `${m.id},${m.authorId},"${m.content.replace(/"/g, '""')}","${m.reason?.replace(/"/g, '""') || ''}",${m.level},${m.status}`).join("\n");
    const blob = new Blob([headers + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mod-queue-${selectedServerId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported successfully.");
  };

  const handleAction = async (msg: FlaggedMessage, action: string) => {
    if (!isPro) {
      toast("Feature only available for PRO tier users.");
      return;
    }

    if (action === "deleted" && botPermissions && !botPermissions.ManageMessages) {
      setMissingPermModal("Manage Messages");
      return;
    }
    if (action === "timeout" && botPermissions && !botPermissions.ModerateMembers) {
      setMissingPermModal("Moderate Members");
      return;
    }

    setProcessing({ id: msg.id, action });
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/mod-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: msg.serverId,
          channelId: msg.channelId || "none",
          messageId: msg.messageId || "none",
          action: action === "deleted" ? "delete" : action === "timeout" ? "timeout" : action === "warned" ? "warn" : action,
          authorId: msg.authorId,
          reason: msg.reason || "Manual review",
          flaggedMessageId: msg.id
        }),
      });
      
      let data;
      const text = await res.text();
      try {
        data = res.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : { error: text };
      } catch (e) {
        data = { error: text };
      }

      if (!res.ok) {
         const errText = data?.error || data?.message || text || "Failed to perform action";
         console.error("Failed to perform action:", errText);
         toast.error("Action Failed:\n" + String(errText));
         setProcessing(null);
         return;
      } else {
        if (action === "warned") {
           toast.success("Warning sent to user via Discord DMs.");
        } else if (action === "deleted") {
           toast.success("Message deleted from Discord.");
        } else if (action === "timeout") {
           toast.success("User has been timed out.");
        } else if (action === "approved") {
           toast.success("Message approved.");
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessing(null);
    } catch (error) {
      console.error("Error updating message:", error);
      toast.error("Failed to update message. Check permissions.");
      setProcessing(null);
    }
  };

  const handleRemoveFromQueue = async (msgId: string) => {
    setProcessing({ id: msgId, action: "remove" });
    try {
      const msg = messages.find(m => m.id === msgId);
      if (!msg) {
        toast.error("Message not found.");
        setProcessing(null);
        return;
      }
      const token = await user?.getIdToken();
      const res = await fetch("/api/mod-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serverId: msg.serverId,
          channelId: msg.channelId || "none",
          messageId: msg.messageId || "none",
          action: "remove",
          authorId: msg.authorId,
          reason: "Removed from queue",
          flaggedMessageId: msg.id
        }),
      });
      
      if (!res.ok) {
         throw new Error("Failed to remove from queue");
      }
      
      toast.success("Removed from queue.");
      setProcessing(null);
    } catch (error) {
       console.error("Error removing from queue:", error);
       toast.error("Failed to remove from queue.");
       setProcessing(null);
    }
  };

  const submitTrainingDirection = async (
    msg: FlaggedMessage,
    correctedLevel: string,
  ) => {
    const direction = trainingDirections[msg.id] || "";
    if (direction.trim().length < 10) {
      toast("Please provide at least 10 characters for the reason.");
      return;
    }

    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messageId: msg.messageId || msg.id,
          correctSeverity: correctedLevel,
          reason: direction,
          originalContent: msg.content,
          originalVerdict: msg.level,
          originalReasoning: msg.reason,
          moderatorId: user?.uid,
          serverId: selectedServerId,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = res.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : { error: text };
      } catch (e) {
        data = { error: text };
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || text || "Failed to submit training");
      }

      if (trainingFeedback[msg.id]?.timeoutId) {
        clearTimeout(trainingFeedback[msg.id].timeoutId);
      }
      const timeoutId = setTimeout(() => {
        setTrainingFeedback((prev) => {
          const next = { ...prev };
          delete next[msg.id];
          return next;
        });
      }, 3000);
      timeoutsRef.current.push(timeoutId);
      setTrainingFeedback((prev) => ({
        ...prev,
        [msg.id]: { text: "Training Recorded", timeoutId },
      }));

      // Clear the input text for this specific message after successful training
      setTrainingDirections((prev) => {
        const next = { ...prev };
        delete next[msg.id];
        return next;
      });
    } catch (err) {
      toast.error("Failed to submit training: " + (err as any).message);
    }
    setActiveTrainingInput(null);
  };

  const filteredMessages = useMemo(
    () => messages.filter((msg) => flagFilter === "All" || (msg.level && msg.level.toLowerCase() === flagFilter.toLowerCase())),
    [messages, flagFilter]
  );
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMessages.length / itemsPerPage)),
    [filteredMessages.length, itemsPerPage]
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  
  const paginatedMessages = useMemo(
    () => filteredMessages.slice(
      (safeCurrentPage - 1) * itemsPerPage,
      safeCurrentPage * itemsPerPage
    ),
    [filteredMessages, safeCurrentPage, itemsPerPage]
  );

  if (serverLoading || loading) {
    return (
      <div className="flex flex-col gap-8 animate-pulse">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="h-10 w-48 bg-surface-container rounded-2xl"></div>
          <div className="h-10 w-32 bg-surface-container rounded-full"></div>
        </header>

        <div className="grid w-full grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="glass-panel p-5 sm:p-6 rounded-[2rem] lg:col-span-2 flex flex-col justify-center border border-outline-variant/30 shadow-sm min-h-[150px]">
            <div className="h-4 w-32 bg-surface-container rounded-md mb-6"></div>
            <div className="grid grid-cols-2 gap-4">
               <div><div className="h-3 w-20 bg-surface-container rounded-md mb-2"></div><div className="h-6 w-16 bg-surface-container rounded-md"></div></div>
               <div><div className="h-3 w-20 bg-surface-container rounded-md mb-2"></div><div className="h-6 w-16 bg-surface-container rounded-md"></div></div>
            </div>
          </div>
          <div className="glass-panel p-5 sm:p-6 rounded-[2rem] lg:col-span-3 flex flex-col justify-center border border-outline-variant/30 shadow-sm min-h-[150px]">
            <div className="h-4 w-40 bg-surface-container rounded-md mb-6"></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
               {[1,2,3,4].map(i => (
                 <div key={i} className="h-8 w-full bg-surface-container rounded-xl"></div>
               ))}
            </div>
          </div>
        </div>

        <div className="py-6 px-2 flex justify-between items-center sm:hidden">
            <div className="h-8 w-24 bg-surface-container rounded-2xl"></div>
            <div className="h-8 w-24 bg-surface-container rounded-2xl"></div>
        </div>

        <div className="w-full flex flex-col gap-5 sm:gap-6 mt-2 max-w-[1400px] mx-auto">
          {[1,2].map(i => (
            <div key={i} className="bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 p-4 sm:p-6 shadow-xl shadow-primary/5 min-h-[250px]">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 bg-surface-container rounded-2xl"></div>
                 <div className="space-y-2">
                    <div className="h-4 w-32 bg-surface-container rounded-md"></div>
                    <div className="h-3 w-24 bg-surface-container rounded-md"></div>
                 </div>
              </div>
              <div className="space-y-2 mb-6">
                 <div className="h-4 w-full bg-surface-container rounded-md"></div>
                 <div className="h-4 w-3/4 bg-surface-container rounded-md"></div>
              </div>
              <div className="h-10 w-full bg-surface-container rounded-2xl"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedServerId) {
    return (
      <div className="flex justify-center items-center h-64 text-text-secondary">
        Please select a server to view the moderation queue.
      </div>
    );
  }

  const getVisiblePages = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (safeCurrentPage <= 4) {
        pages.push(1, 2, 3, 4, 5, "...", totalPages);
      } else if (safeCurrentPage >= totalPages - 3) {
        pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, "...", totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="flex flex-col gap-8">
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />

      {!hideHeader && (
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="glass-panel px-4 py-2.5 rounded-2xl flex items-center gap-2.5 cursor-pointer w-fit">
            <div className="w-6 h-6 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary">
              <Logo className="w-4 h-4" />
            </div>
            <span className="font-bold text-sm text-on-surface">
              Moderation Queue
            </span>
            <span className="text-[10px] text-text-secondary">▼</span>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button onClick={handleExport} className="flex-1 sm:flex-none px-4 py-2 rounded-full text-xs font-bold border border-outline-variant text-text-secondary hover:text-primary hover:bg-surface-container transition-all duration-300 ease-out active:scale-95">
              Export Report
            </button>
          </div>
        </header>
      )}

      {intentsWarning && (
        <div className="bg-danger/5 border border-danger/20 rounded-2xl p-4 flex items-start gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-danger">
              Action Required: Privileged Intents Disallowed
            </h4>
            <p className="text-sm text-danger/80 mt-1">
              SentinL is currently running in <b>REDUCED MODE</b>. It cannot
              scan messages or flag anything to this queue because your Discord
              Developer Portal settings are blocking it. You MUST go to{" "}
              <a
                className="underline"
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noreferrer"
              >
                discord.com/developers
              </a>
              , select your bot, go to the <b>Bot</b> tab, and enable the{" "}
              <b>Message Content Intent</b> and <b>Server Members Intent</b>.
              Afterwards, reconnect the bot or refresh the dashboard.
            </p>
          </div>
        </div>
      )}

      {(!isPro) && (
        <p className="text-[11px] text-text-secondary/70 italic">
          * AI training and advanced moderation actions require a Pro
          subscription.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="relative h-[350px] overflow-hidden rounded-[2rem] border border-primary bg-primary p-5 text-white shadow-[0_18px_46px_rgba(255,111,97,0.26)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.14),transparent_28%),linear-gradient(135deg,rgba(0,0,0,0.10),transparent_48%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/72">
                  General Statistics
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  Queue health at a glance
                </h2>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15">
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[1.05fr_1.4fr]">
              <div className="flex min-h-0 flex-col justify-between rounded-[1.5rem] border border-white/20 bg-white/15 p-5 shadow-inner">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">
                    Today's Flags
                  </p>
                  <div className="mt-3 text-5xl font-black leading-none text-white">
                    {serverStats.todayFlags}
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold leading-relaxed text-white/72">
                  New moderation items created today.
                </p>
              </div>

              <div className="grid min-h-0 grid-cols-2 gap-3">
                <div className="rounded-[1.35rem] border border-white/20 bg-white/15 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/65">
                    Total Flags
                  </p>
                  <div className="mt-2 text-2xl font-black leading-none text-white">
                    {serverStats.totalFlags}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/20 bg-white/15 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/65">
                    AI Accuracy
                  </p>
                  <div className="mt-2 text-2xl font-black leading-none text-white">
                    {Array.isArray(messages) && messages.length > 0
                      ? Math.round(
                          messages.reduce((acc, m) => acc + m.confidence, 0) /
                            messages.length,
                        )
                      : 0}
                    %
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/20 bg-white/15 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/65">
                    Pending Review
                  </p>
                  <div className="mt-2 text-2xl font-black leading-none text-white">
                    {filteredMessages.length}
                  </div>
                </div>
                <div className="rounded-[1.35rem] border border-white/20 bg-white p-4 text-primary shadow-sm">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary/65">
                    Time Saved
                  </p>
                  <div className="mt-2 text-2xl font-black leading-none">
                    ~{serverStats.totalFlags * 2}m
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="h-[350px]">
          <RecentBotActions className="h-full glass-panel border border-outline-variant/30 rounded-[2rem] overflow-hidden shadow-sm" />
        </div>
      </div>

      <div className="bg-surface border border-outline-variant/30 rounded-[2rem] overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-primary/20 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-primary">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border border-white/20">
                 <Shield className="w-5 h-5 text-white" />
             </div>
             <div>
                 <h2 className="text-lg font-black text-white tracking-tight leading-none">Active Queue</h2>
                 <p className="text-[11px] text-white/80 mt-1.5 font-medium">Pending items waiting for your review.</p>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="px-4 py-1.5 rounded-full bg-black/20 border border-white/20 flex items-center gap-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-md">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff4d4d] animate-[pulse_1.5s_ease-in-out_infinite] shadow-[0_0_10px_rgba(255,77,77,0.8)]"></span>
              <span className="text-[11px] uppercase tracking-widest text-white font-black flex items-center gap-1.5 drop-shadow-md">
                LIVE <span className="opacity-40">|</span> <span className="tabular-nums">{filteredMessages.length} Pending</span>
              </span>
            </div>
          </div>
        </div>

        {messages.length === 0 ? (
          <EmptyState 
            title="All clear! No pending issues."
            description="Your server is calm and secure. Messages flagged for moderation will appear here."
          />
        ) : (
          <div className="overflow-x-auto w-full moderation-queue-container" style={{ overflowAnchor: "auto" }}>
            {/* Desktop and Tablet View */}
            <table className="w-full text-sm border-collapse hidden sm:table min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-surface-container/90 backdrop-blur-md">
                <tr>
                  <th className="text-left align-middle px-6 py-4 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                    Member
                  </th>
                  <th className="text-center align-middle px-6 py-4 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                    Message Content
                  </th>
                  <th className="text-center align-middle px-6 py-4 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                    <div className="flex items-center justify-center gap-2">
                      <span>AI Analysis</span>
                      <div className="relative flex items-center bg-surface-container-high border border-outline-variant/50 rounded-md hover:bg-surface-variant transition-colors duration-300 ease-out group">
                        <Filter className="w-3 h-3 text-text-secondary ml-1.5 group-hover:text-primary transition-colors duration-300 ease-out" />
                        <Select
                          value={flagFilter}
                          onChange={(val) => {
                            setFlagFilter(val);
                            setCurrentPage(1);
                          }}
                          className=""
                          size="sm"
                          options={[
                            { value: "All", label: "ALL" },
                            { value: "Extreme", label: "EXTREME" },
                            { value: "Inappropriate", label: "INAPPROP" },
                            { value: "Moderate", label: "MODERATE" },
                            { value: "Spam", label: "SPAM" },
                            { value: "Keyword", label: "KEYWORD" }
                          ]}
                        />
                      </div>
                    </div>
                  </th>
                  <th className="text-center align-middle px-6 py-4 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                    Resolution
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {paginatedMessages
                    .map((msg, idx) => {
                      const isKeyword = msg.detectionMethod === "keyword";
                      const isExtreme = msg.level === "Extreme";
                      const isInappropriate = msg.level === "Inappropriate";
                      const isModerate = msg.level === "Moderate";
                      const badgeClass = (msg as any).reviewOnly || msg.detectionMethod === "ai_review_only" ? "bg-surface-variant text-on-surface border-outline" : isKeyword
                        ? "bg-surface-variant text-on-surface-variant border-transparent"
                        : isExtreme
                          ? "bg-danger/10 text-danger border-danger/20"
                          : isInappropriate
                            ? "bg-warning/10 text-warning border-warning/20"
                            : isModerate
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-surface-variant text-on-surface-variant border-transparent";
                      const barColor = isKeyword
                        ? "bg-outline-variant"
                        : isExtreme
                          ? "bg-danger"
                          : isInappropriate
                            ? "bg-warning"
                            : isModerate
                              ? "bg-success"
                              : "bg-outline";

                      return (
                        <motion.tr
                          layout
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                          exit={{ opacity: 0, scale: 0.95, overflow: 'hidden', transition: { duration: 0.2, ease: "easeIn" } }}
                          key={msg.id}
                          className={`group hover:bg-surface-container/20 transition-colors duration-300 ease-out border-l-4 ${severityBorderColor(msg.level)}`}
                        >
                          <td className="px-6 py-5 border-b border-outline-variant/30 align-middle">
                            <div className="flex justify-start items-start gap-3">
                              <div className="shrink-0 mt-0.5">
                                {msg.authorAvatar ? (
                                  <img
                                    src={msg.authorAvatar}
                                    alt={msg.authorUsername}
                                    className="w-9 h-9 rounded-xl object-cover shadow-sm border border-outline-variant/30"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center text-xs font-extrabold text-primary border border-outline-variant/30">
                                    {msg.authorUsername?.[0]?.toUpperCase() ||
                                      "?"}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <div className="text-on-surface font-bold text-sm tracking-tight truncate max-w-[120px] sm:max-w-none">
                                    @{msg.authorUsername || msg.authorId}
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(msg.authorId);
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
                                    ID: <CopyableId id={msg.authorId} />
                                  </span>
                                  <span
                                    className="text-text-secondary font-medium cursor-help"
                                    title={msg.timestamp ? format(new Date(msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp), "yyyy-MM-dd HH:mm:ss") : ""}
                                  >
                                    {msg.timestamp ? formatDistanceToNow(new Date(msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp), { addSuffix: true }) : "Unknown time"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5 border-b border-outline-variant/30 align-middle max-w-[280px]">
                            <div className="flex items-center justify-center gap-2 text-center">
                              <span className="leading-relaxed text-on-surface text-[13px] font-medium italic break-words">
                                "
                                {msg.content.length > 100
                                  ? msg.content.substring(0, 100) + "..."
                                  : msg.content}
                                "
                              </span>
                              {msg.messageId && (
                                <a
                                  href={`https://discord.com/channels/${msg.serverId}/${msg.channelId}/${msg.messageId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out flex-shrink-0 mt-0.5"
                                  title="Go to Message"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5 border-b border-outline-variant/30 align-middle">
                            <div
                              className="flex items-center justify-center gap-1.5 cursor-pointer select-none"
                              onClick={() => toggleExpand(msg.id)}
                            >
                              <span
                                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${badgeClass}`}
                              >
                                {(msg as any).reviewOnly || msg.detectionMethod === "ai_review_only" ? "Needs Review" : isKeyword ? "Keyword Filtering" : msg.level}
                              </span>
                              <div className="text-text-secondary hover:text-primary transition-colors duration-300 ease-out focus:outline-none">
                                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedIds[msg.id] ? "rotate-180" : ""}`} />
                              </div>
                            </div>
                            <AnimatePresence initial={false}>
                              {expandedIds[msg.id] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pt-4 pb-2 flex flex-col items-center">
                                    {isKeyword ? (
                                      <div className="w-full h-1.5 bg-surface-variant rounded-full mb-2 overflow-hidden mx-auto max-w-[200px]">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                          style={{ width: "100%" }}
                                        ></div>
                                      </div>
                                    ) : (
                                      <div className="relative w-10 h-10 shrink-0 mb-2">
                                        <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
                                            className="text-surface-container" strokeWidth="3" />
                                          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor"
                                            className={msg.confidence >= 85 ? "text-danger" : msg.confidence >= 70 ? "text-orange-400" : "text-yellow-400"}
                                            strokeWidth="3" strokeDasharray={`${(msg.confidence / 100) * 94.2} 94.2`}
                                            strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-on-surface">
                                          {msg.confidence}
                                        </span>
                                      </div>
                                    )}
                                    <span className="font-mono text-text-secondary text-[11px] leading-tight block mt-2 text-center">
                                      {isKeyword ? (
                                        <>
                                          <span className="font-bold text-on-surface-variant block mb-1">
                                            MATCHED KEYWORD:
                                          </span>
                                          {msg.matchedKeyword}
                                        </>
                                      ) : (
                                        <div className="flex flex-col items-center text-center">
                                          {(msg.primaryCategory || (msg.secondaryCategories && msg.secondaryCategories.length > 0)) && (
                                            <div className="mb-3 w-full">
                                              {msg.primaryCategory && (
                                                <div className="mb-1.5">
                                                  <span className="font-bold text-on-surface-variant block mb-0.5">
                                                    PRIMARY RULE:
                                                  </span>
                                                  <span className="text-primary font-semibold">{msg.primaryCategory}</span>
                                                </div>
                                              )}
                                              {msg.secondaryCategories && msg.secondaryCategories.length > 0 && (
                                                <div className="text-[9px] opacity-70">
                                                  <span className="font-bold uppercase tracking-widest block mb-0.5">SECONDARY RULES:</span>
                                                  {msg.secondaryCategories.join(", ")}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          <span className="font-bold text-on-surface-variant block mb-1">
                                            REASON:
                                          </span>
                                          {msg.reason}
                                          {msg.contextConsidered && (
                                            <div className="mt-3 w-full">
                                              <span className="font-bold text-on-surface-variant/70 uppercase tracking-widest text-[9px] mb-1.5 block font-sans text-center">
                                                Context Considered:
                                              </span>
                                              <div className="whitespace-pre-wrap max-h-32 overflow-y-auto border-l-2 border-r-2 border-outline-variant/50 text-[10px] italic bg-surface-container/30 p-2 rounded-xl text-center">
                                                {msg.contextConsidered}
                                              </div>
                                            </div>
                                          )}
                                          {msg.model_used && (
                                            <div className="mt-3 flex items-center justify-center gap-1.5 opacity-60">
                                              <Logo className="w-3.5 h-3.5 text-primary" />
                                              <span className="font-bold uppercase tracking-widest text-[9px] font-sans">
                                                Using:{" "}
                                                {formatModelUsed(msg.model_used)}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </td>
                          <td className="px-6 py-5 border-b border-outline-variant/30 align-middle">
                              <div className="flex flex-col gap-3 transition-opacity duration-300 ease-out min-w-[320px]">
                              <div className="flex flex-wrap gap-2 items-center w-full">
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleAction(msg, "approved")}
                                  disabled={
                                    processing?.id === msg.id ||
                                    msg.actionTaken === "auto_deleted" ||
                                    msg.isDeleted ||
                                    msg.isWarned ||
                                    msg.actionTaken === "timeout" ||
                                    msg.isApproved
                                  }
                                  aria-label={`Approve flagged message from ${msg.authorUsername || "user"}`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                    msg.isApproved ? "bg-success/20 text-success opacity-80" : "bg-success/90 text-white hover:bg-success"
                                  } disabled:opacity-50 disabled:cursor-not-allowed ${!isPro ? "opacity-60 grayscale" : ""}`}
                                >
                                  {processing?.id === msg.id && processing?.action === "approved" ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Approving</> : msg.isApproved ? <><CheckCircle className="w-3.5 h-3.5"/> Approved</> : "Approve"}
                                </button>
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleAction(msg, "warned")}
                                  disabled={processing?.id === msg.id || msg.isApproved || msg.isWarned || msg.actionTaken === "timeout"}
                                  aria-label={`Warn ${msg.authorUsername || "user"} for this flagged message`}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c26e42] focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                    msg.isWarned ? "bg-[#c26e42]/20 text-[#c26e42] opacity-80" : "bg-[#c26e42] text-white hover:bg-[#b05e34]"
                                  } disabled:opacity-50 disabled:cursor-not-allowed ${!isPro ? "opacity-60 grayscale" : ""}`}
                                >
                                  {processing?.id === msg.id && processing?.action === "warned" ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Warning</> : msg.isWarned ? <><CheckCircle className="w-3.5 h-3.5"/> Warned</> : "Warn"}
                                </button>
                                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/10 bg-danger/5 p-1">
                                  <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleAction(msg, "timeout")}
                                    disabled={processing?.id === msg.id || msg.isApproved || msg.actionTaken === "timeout"}
                                    aria-label={`Timeout ${msg.authorUsername || "user"} for this flagged message`}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b35d32] focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                      msg.actionTaken === "timeout" ? "bg-[#b35d32]/20 text-[#b35d32] opacity-80" : "bg-[#b35d32] text-white hover:bg-[#a65128]"
                                    } disabled:opacity-50 disabled:cursor-not-allowed ${!isPro ? "opacity-60 grayscale" : ""}`}
                                  >
                                    {processing?.id === msg.id && processing?.action === "timeout" ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Timing out</> : msg.actionTaken === "timeout" ? <><CheckCircle className="w-3.5 h-3.5"/> Timed Out</> : "Timeout"}
                                  </button>
                                  {msg.actionTaken === "auto_deleted" ? (
                                    <span className="text-[10px] text-danger font-black uppercase tracking-widest bg-danger/10 px-3 py-1.5 rounded-lg border border-danger/20 flex items-center justify-center gap-1.5">
                                      <CheckCircle className="w-3.5 h-3.5"/> Auto-Deleted
                                    </span>
                                  ) : (
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => handleAction(msg, "deleted")}
                                      disabled={processing?.id === msg.id || msg.isApproved || msg.isDeleted}
                                      aria-label={`Delete flagged message from ${msg.authorUsername || "user"}`}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                        msg.isDeleted ? "bg-danger/20 text-danger opacity-80" : "bg-danger/90 text-white hover:bg-danger"
                                      } disabled:opacity-50 ${!isPro ? "opacity-60 grayscale" : ""}`}
                                    >
                                      {processing?.id === msg.id && processing?.action === "deleted" ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Deleting</> : msg.isDeleted ? <><CheckCircle className="w-3.5 h-3.5"/> Deleted</> : "Delete"}
                                    </button>
                                  )}
                                </div>
                                <div className="flex-1" />
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleRemoveFromQueue(msg.id)}
                                  disabled={processing?.id === msg.id}
                                  aria-label={`Remove flagged message from ${msg.authorUsername || "user"} from queue`}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                  title="Remove from Queue"
                                >
                                  {processing?.id === msg.id && processing?.action === "remove" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Trash2 className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              <AnimatePresence>
                                {trainingFeedback[msg.id] && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="text-[10px] text-success font-bold text-center w-full"
                                  >
                                    {trainingFeedback[msg.id].text}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              {true && (
                                <ProGate isPro={isPro} featureName="Manual AI Training" featureDescription="Provide feedback to the engine on Pro or Premium" className={`bg-surface-container/30 border border-outline-variant/30 rounded-xl p-3 flex flex-col gap-2 relative group-hover:border-outline-variant/60 transition-colors w-full overflow-hidden`}>
                                  <div className="flex flex-row items-center justify-between gap-3 w-full">
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Logo className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                      <span className="text-[9px] text-text-secondary uppercase tracking-widest font-black whitespace-nowrap">
                                        Training Feedback
                                      </span>
                                    </div>
                                    <div className="flex gap-1.5 flex-nowrap overflow-x-auto no-scrollbar mask-edges">
                                    {[
                                      "Safe",
                                      "Moderate",
                                      "Inappropriate",
                                      "Extreme",
                                    ].map((level) => (
                                      <button
                                        key={level}
                                        onClick={() => {
                                          if (!isPro) {
                                            toast("Feature only available for PRO tier users.");
                                            return;
                                          }
                                          if (activeTrainingInput === msg.id && trainedLevels[msg.id] === level) {
                                            setActiveTrainingInput(null);
                                            const newLevels = { ...trainedLevels };
                                            delete newLevels[msg.id];
                                            setTrainedLevels(newLevels);
                                          } else {
                                            setTrainedLevels({
                                              ...trainedLevels,
                                              [msg.id]: level,
                                            });
                                            setActiveTrainingInput(msg.id);
                                          }
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all duration-300 ease-out active:scale-95 shadow-sm
                                        ${
                                          trainedLevels[msg.id] === level &&
                                          activeTrainingInput === msg.id
                                            ? "bg-primary text-white border-primary"
                                            : "bg-surface text-text-secondary border-outline-variant hover:border-primary/50 hover:text-primary"
                                        }
                                      `}
                                      >
                                        {level}
                                      </button>
                                    ))}
                                  </div>
                                  </div>
                                  <AnimatePresence>
                                    {activeTrainingInput === msg.id && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-2 flex flex-col gap-2 overflow-hidden justify-end bg-surface-container/30 p-2 rounded-xl border border-outline-variant/30"
                                      >
                                        <textarea
                                          maxLength={500}
                                          placeholder="Add verbal direction..."
                                          value={
                                            trainingDirections[msg.id] || ""
                                          }
                                          onChange={(e) => {
                                            setTrainingDirections((prev) => ({
                                              ...prev,
                                              [msg.id]: e.target.value,
                                            }));
                                            e.target.style.height = "auto";
                                            e.target.style.height = `${e.target.scrollHeight}px`;
                                          }}
                                          onKeyDown={(e) =>
                                            e.key === "Enter" && !e.shiftKey &&
                                            submitTrainingDirection(
                                              msg,
                                              trainedLevels[msg.id]!,
                                            )
                                          }
                                          className="flex-1 min-h-[34px] max-h-[120px] resize-none overflow-y-auto bg-white border border-outline-variant/30 rounded-lg px-2.5 py-1.5 text-[11px] text-on-surface outline-none focus:border-primary transition-colors duration-300 ease-out custom-scrollbar"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() =>
                                            submitTrainingDirection(
                                              msg,
                                              trainedLevels[msg.id]!,
                                            )
                                          }
                                          className="self-end px-4 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary/90 transition-all duration-300 ease-out shrink-0 active:scale-95 shadow-sm"
                                        >
                                          Send
                                        </button>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </ProGate>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                </AnimatePresence>
              </tbody>
            </table>

            {/* Mobile View */}
            <div className="sm:hidden divide-y divide-outline-variant/20 bg-white/40 overflow-hidden moderation-queue-container" style={{ overflowAnchor: "auto" }}>
              <AnimatePresence mode="popLayout">
                {paginatedMessages
                  .map((msg, idx) => {
                    const isKeyword = msg.detectionMethod === "keyword";
                    const isExtreme = msg.level === "Extreme";
                    const isInappropriate = msg.level === "Inappropriate";
                    const isModerate = msg.level === "Moderate";

                    const badgeClass = (msg as any).reviewOnly || msg.detectionMethod === "ai_review_only" ? "bg-surface-variant text-on-surface border-outline" : isKeyword
                      ? "bg-surface-variant text-on-surface-variant border-transparent"
                      : isExtreme
                        ? "bg-danger/10 text-danger border-danger/20"
                        : isInappropriate
                          ? "bg-warning/10 text-warning border-warning/20"
                          : isModerate
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-surface-variant text-on-surface-variant border-transparent";

                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, x: -30, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: "auto", transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 + 0.1 } }}
                        exit={{ opacity: 0, x: -50, height: 0, margin: 0, padding: 0, overflow: 'hidden', transition: { duration: 0.2, ease: "easeIn" } }}
                        key={msg.id}
                        className={`p-4 flex flex-col gap-4 border-l-4 ${severityBorderColor(msg.level)}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                          {msg.authorAvatar ? (
                            <img
                              src={msg.authorAvatar}
                              alt={msg.authorUsername}
                              className="w-10 h-10 rounded-xl object-cover shadow-sm border border-outline-variant/30"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-xs font-black text-primary border border-outline-variant/30">
                              {msg.authorUsername?.[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-on-surface">
                                @{msg.authorUsername}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(msg.authorId);
                                  toast.success("User ID copied");
                                }}
                                title="Copy User ID"
                                className="text-text-secondary hover:text-primary transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex flex-col gap-0.5 text-[10px] text-text-secondary font-semibold mt-0.5">
                              <span>ID: <CopyableId id={msg.authorId} /></span>
                              <span className="cursor-help" title={msg.timestamp ? format(new Date(msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp), "yyyy-MM-dd HH:mm:ss") : ""}>
                                {msg.timestamp ? formatDistanceToNow(new Date(msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : msg.timestamp), { addSuffix: true }) : ""}
                              </span>
                            </div>
                          </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div
                              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${badgeClass}`}
                            >
                              {(msg as any).reviewOnly || msg.detectionMethod === "ai_review_only" ? "Needs Review" : isKeyword ? "Keyword" : msg.level}
                            </div>
                            <button
                              onClick={() => setExpandedIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                              className="text-text-secondary hover:text-primary transition-colors p-1"
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${expandedIds[msg.id] ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                        </div>

                      <div className="bg-surface-container/30 p-3.5 rounded-2.5xl border border-outline-variant/10 relative">
                        <p className="text-[13px] text-on-surface font-medium leading-relaxed italic">
                          "{msg.content}"
                        </p>
                        {msg.messageId && (
                          <a
                            href={`https://discord.com/channels/${msg.serverId}/${msg.channelId}/${msg.messageId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute top-2 right-2 text-text-secondary hover:text-primary transition-all p-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-2 w-full items-center">
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleAction(msg, "approved")}
                            disabled={processing?.id === msg.id || msg.actionTaken === "auto_deleted" || msg.isDeleted || msg.isWarned || msg.actionTaken === "timeout" || msg.isApproved}
                            aria-label={`Approve flagged message from ${msg.authorUsername || "user"}`}
                            className={`flex px-3 py-2 rounded-xl text-xs items-center justify-center gap-1.5 font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                              msg.isApproved ? "bg-success/20 text-success" : "bg-success/90 text-white shadow-sm"
                            } disabled:opacity-50 ${!isPro ? "opacity-60 grayscale" : ""}`}
                          >
                            {processing?.id === msg.id && processing?.action === "approved" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : msg.isApproved ? <><CheckCircle className="w-3.5 h-3.5"/> Approved</> : "Approve"}
                          </button>
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleAction(msg, "warned")}
                            disabled={processing?.id === msg.id || msg.isApproved || msg.isWarned || msg.actionTaken === "timeout"}
                            aria-label={`Warn ${msg.authorUsername || "user"} for this flagged message`}
                            className={`flex px-3 py-2 rounded-xl text-xs items-center justify-center gap-1.5 font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c26e42] focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                              msg.isWarned ? "bg-[#c26e42]/20 text-[#c26e42] border border-[#c26e42]/20" : "bg-[#c26e42] text-white shadow-sm"
                            } disabled:opacity-50 ${!isPro ? "opacity-60 grayscale" : ""}`}
                          >
                            {processing?.id === msg.id && processing?.action === "warned" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : msg.isWarned ? <><CheckCircle className="w-3.5 h-3.5"/> Warned</> : "Warn"}
                          </button>
                          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/10 bg-danger/5 p-1">
                            <button
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleAction(msg, "timeout")}
                              disabled={processing?.id === msg.id || msg.isApproved || msg.actionTaken === "timeout"}
                              aria-label={`Timeout ${msg.authorUsername || "user"} for this flagged message`}
                              className={`flex px-3 py-2 rounded-xl text-xs items-center justify-center gap-1.5 font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b35d32] focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                msg.actionTaken === "timeout" ? "bg-[#b35d32]/20 text-[#b35d32] border border-[#b35d32]/20" : "bg-[#b35d32] text-white shadow-sm"
                              } disabled:opacity-50 ${!isPro ? "opacity-60 grayscale" : ""}`}
                            >
                              {processing?.id === msg.id && processing?.action === "timeout" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : msg.actionTaken === "timeout" ? <><CheckCircle className="w-3.5 h-3.5"/> Timed Out</> : "Timeout"}
                            </button>
                            {msg.actionTaken === "auto_deleted" ? (
                              <span className="flex px-3 py-2 rounded-xl text-[10px] items-center justify-center gap-1.5 font-black uppercase tracking-widest shadow-none bg-danger/10 text-danger border border-danger/20">
                                <CheckCircle className="w-3.5 h-3.5"/> Auto-Deleted
                              </span>
                            ) : (
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleAction(msg, "deleted")}
                                disabled={processing?.id === msg.id || msg.isApproved || msg.isDeleted}
                                aria-label={`Delete flagged message from ${msg.authorUsername || "user"}`}
                                className={`flex px-3 py-2 rounded-xl text-xs items-center justify-center gap-1.5 font-black uppercase tracking-wider transition-all duration-300 ease-out active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                                  msg.isDeleted ? "bg-danger/20 text-danger" : "bg-danger/90 text-white shadow-sm"
                                } disabled:opacity-50 ${!isPro ? "opacity-60 grayscale" : ""}`}
                              >
                                {processing?.id === msg.id && processing?.action === "deleted" ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : msg.isDeleted ? <><CheckCircle className="w-3.5 h-3.5"/> Deleted</> : "Delete"}
                              </button>
                            )}
                          </div>
                          <div className="flex-1" />
                          <button
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleRemoveFromQueue(msg.id)}
                            disabled={processing?.id === msg.id}
                            aria-label={`Remove flagged message from ${msg.authorUsername || "user"} from queue`}
                            className="flex-shrink-0 flex items-center justify-center px-3 py-2 rounded-xl bg-surface-variant text-text-secondary hover:bg-danger/10 hover:text-danger disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            title="Remove from Queue"
                          >
                            {processing?.id === msg.id && processing?.action === "remove" ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>

                        {true && (
                          <ProGate isPro={isPro} featureName="Manual AI Training" featureDescription="Provide feedback to the machine learning models" className={`mt-1 pt-3 border-t border-outline-variant/20 relative w-full flex flex-col gap-2 overflow-hidden`}>
                             <div className="flex flex-row items-center justify-between gap-3 w-full">
                              <div className="text-[10px] text-text-secondary uppercase tracking-widest font-black shrink-0 whitespace-nowrap">
                                Train AI
                              </div>
                              <div className="flex gap-1.5 flex-nowrap overflow-x-auto no-scrollbar mask-edges">
                              {["Safe", "Moderate", "Inappropriate", "Extreme"].map((level) => (
                                <button
                                  key={level}
                                  onClick={() => {
                                    if (!isPro) {
                                      toast("Feature only available for PRO tier users.");
                                      return;
                                    }
                                    if (activeTrainingInput === msg.id && trainedLevels[msg.id] === level) {
                                      setActiveTrainingInput(null);
                                      const newLevels = { ...trainedLevels };
                                      delete newLevels[msg.id];
                                      setTrainedLevels(newLevels);
                                    } else {
                                      setTrainedLevels({ ...trainedLevels, [msg.id]: level });
                                      setActiveTrainingInput(msg.id);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                    trainedLevels[msg.id] === level && activeTrainingInput === msg.id
                                      ? "bg-primary text-white border-primary shadow-md"
                                      : "text-text-secondary border-outline-variant hover:border-primary/50"
                                  }`}
                                >
                                  {level}
                                </button>
                              ))}
                            </div>
                            </div>

                            <AnimatePresence>
                              {activeTrainingInput === msg.id && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="flex flex-col gap-2"
                                >
                                  <textarea
                                    maxLength={500}
                                    placeholder="Provide context for AI correction..."
                                    value={trainingDirections[msg.id] || ""}
                                    onChange={(e) => {
                                      setTrainingDirections(p => ({ ...p, [msg.id]: e.target.value }));
                                      e.target.style.height = "auto";
                                      e.target.style.height = `${e.target.scrollHeight}px`;
                                    }}
                                    className="w-full bg-white border border-outline-variant/30 rounded-xl px-3 py-2 text-[11px] outline-none focus:border-primary min-h-[60px] resize-none overflow-y-hidden"
                                  />
                                  <button
                                    onClick={() => submitTrainingDirection(msg, trainedLevels[msg.id]!)}
                                    className="w-full py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md"
                                  >
                                    Submit Training
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </ProGate>
                        )}
                        
                        <AnimatePresence initial={false}>
                          {expandedIds[msg.id] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-2 text-[11px] text-text-secondary flex flex-col gap-2 overflow-hidden"
                            >
                               {isKeyword ? (
                                  <div className="bg-surface-container/20 p-3 rounded-xl border border-outline-variant/30">
                                    <span className="font-bold text-on-surface-variant block mb-1 uppercase tracking-widest text-[9px]">Matched Keyword:</span>
                                    <span className="font-mono">{msg.matchedKeyword}</span>
                                  </div>
                               ) : (
                                  <div className="bg-surface-container/20 p-3 rounded-xl border border-outline-variant/30 flex flex-col gap-3">
                                    {(msg.primaryCategory || (msg.secondaryCategories && msg.secondaryCategories.length > 0)) && (
                                      <div>
                                        {msg.primaryCategory && (
                                          <div className="mb-2">
                                            <span className="font-bold text-on-surface-variant block mb-0.5 uppercase tracking-widest text-[9px]">Primary Rule:</span>
                                            <span className="text-primary font-semibold">{msg.primaryCategory}</span>
                                          </div>
                                        )}
                                        {msg.secondaryCategories && msg.secondaryCategories.length > 0 && (
                                          <div>
                                            <span className="font-bold text-on-surface-variant block mb-0.5 uppercase tracking-widest text-[9px]">Secondary Rules:</span>
                                            <span className="opacity-80">{msg.secondaryCategories.join(", ")}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    
                                    <div>
                                      <span className="font-bold text-on-surface-variant block mb-0.5 uppercase tracking-widest text-[9px]">Reason:</span>
                                      <span className="italic leading-relaxed">{msg.reason}</span>
                                    </div>
                                    
                                    {msg.contextConsidered && (
                                      <div>
                                        <span className="font-bold text-on-surface-variant block mb-1 uppercase tracking-widest text-[9px]">Context Considered:</span>
                                        <div className="bg-surface-variant/30 p-2 rounded-lg border-l-2 border-primary/40 italic">
                                          {msg.contextConsidered}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {msg.model_used && (
                                      <div className="flex items-center gap-1.5 opacity-60 mt-1">
                                        <Logo className="w-3 h-3 text-primary" />
                                        <span className="font-bold uppercase tracking-widest text-[9px]">
                                          Using: {formatModelUsed(msg.model_used)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                               )}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {!expandedIds[msg.id] && (
                          <div className="flex items-center gap-2 mt-1">
                            <Logo className="w-3 h-3 text-primary opacity-50" />
                            <span className="text-[10px] text-text-secondary font-bold truncate">
                              {isKeyword ? `Keyword: ${msg.matchedKeyword}` : `Reason: ${msg.reason}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
        
        {messages.length > 0 && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-outline-variant/30 flex justify-between items-center bg-surface-container/20">
            <span className="text-[11px] font-bold text-text-secondary">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-[11px] font-bold text-text-secondary hover:bg-surface-variant hover:text-on-surface disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Previous
              </button>
              
              <div className="flex gap-1 items-center mx-2">
                {getVisiblePages().map((page, index) => (
                  <button
                    key={index}
                    onClick={() => typeof page === 'number' && setCurrentPage(page)}
                    disabled={typeof page !== 'number' || page === safeCurrentPage}
                    className={`min-w-[28px] h-[28px] flex items-center justify-center rounded-md text-[11px] font-bold transition-colors ${
                      page === safeCurrentPage 
                        ? 'bg-primary/20 text-primary border border-primary/30' 
                        : typeof page === 'number'
                          ? 'text-text-secondary hover:bg-surface-variant hover:text-on-surface border border-transparent'
                          : 'text-text-secondary cursor-default'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-[11px] font-bold text-text-secondary hover:bg-surface-variant hover:text-on-surface disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
