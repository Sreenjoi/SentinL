import React, { useEffect, useState, useRef } from "react";
import { useServer } from "../context/ServerContext";
import { db, auth } from "../firebase";
import { collection, query, where, orderBy, limit, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { Trash2, AlertTriangle, ChevronRight, ShieldAlert, ArrowUp, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Logo } from "./Logo";
import { EmptyState } from "./EmptyState";

export function RecentBotActions({ className }: { className?: string }) {
  const { selectedServerId, isPro } = useServer();
  const [actions, setActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const [hasNewActions, setHasNewActions] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedServerId) return;
    
    // We fetch recent flagged messages and filter locally to avoid complex composite index requirements
    const q = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: any[] = [];
      snapshot.forEach(doc => {
        msgs.push({ id: doc.id, ...doc.data() });
      });
      
      const automated = msgs.filter(m => m.actionTaken === "auto_deleted").slice(0, 10);
      
      setActions(prev => {
        if (prev.length > 0 && automated.length > 0 && prev[0].id !== automated[0].id) {
           if (listRef.current && listRef.current.scrollTop > 20) {
             setHasNewActions(true);
           }
        }
        return automated;
      });
      
      setLoading(false);
    }, (err) => console.error("RecentBotActions snap error", err));

    return () => unsub();
  }, [selectedServerId]);

  const handleScroll = () => {
    if (listRef.current && listRef.current.scrollTop <= 20) {
      setHasNewActions(false);
    }
  };

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    setHasNewActions(false);
  };

  const handleDeleteAction = async (msg: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(msg.id);
    try {
      const token = await auth.currentUser?.getIdToken();
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
          action: "delete_record",
          authorId: msg.authorId,
          reason: "Deleted from history",
          flaggedMessageId: msg.id
        }),
      });
      if (!res.ok) throw new Error("Failed to delete record");
      toast.success("Action entry deleted successfully from history.");
    } catch (err: any) {
      console.error("Failed to delete action", err);
      toast.error("Failed to delete action: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-outline-variant/30 rounded-[2rem] p-8 flex justify-center items-center h-full opacity-50">
        <Logo className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`relative h-full flex flex-col ${className !== undefined ? className : "glass-panel border border-outline-variant/30 rounded-[2rem] overflow-hidden shadow-sm"}`}>
      <div className="px-6 py-5 border-b border-primary/20 bg-primary text-white flex justify-between items-center relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center border border-white/20">
             <Logo className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-white tracking-tight leading-none">Recent Bot Actions</h2>
            <p className="text-[11px] text-white/75 mt-1.5 font-medium">Automated interventions by SentinL.</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/25 text-white uppercase font-black text-[10px] tracking-widest">
          {actions.length} ACTIONS
        </div>
      </div>
      <div 
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar relative z-10"
      >
        <AnimatePresence>
          {hasNewActions && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.2 }}
              className="sticky top-3 z-30 flex justify-center w-full pointer-events-none"
            >
              <button 
                onClick={scrollToTop}
                className="pointer-events-auto bg-primary text-white shadow-lg shadow-primary/30 rounded-full px-4 py-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
              >
                <ArrowUp className="w-3.5 h-3.5 animate-bounce" />
                New Actions
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {actions.length === 0 ? (
          <EmptyState 
            title="All clear!" 
            description="No recent automated actions by SentinL." 
          />
        ) : (
          <AnimatePresence>
            {actions.map((action, idx) => {
              const actionTime = action.timestamp
                ? formatDistanceToNow(
                    new Date(action.timestamp.seconds ? action.timestamp.seconds * 1000 : action.timestamp),
                    { addSuffix: true },
                  )
                : "Unknown time";
              const detectorLabel = action.level === "Keyword" ? "Keyword rule" : "AI moderation";
              const outcomeLabel =
                action.actionTaken === "auto_deleted"
                  ? "Message removed"
                  : "User warned";
              const ruleLabel = action.primaryCategory || action.reason || "Policy match";

              return (
            <motion.div
              layout
              key={action.id}
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, scale: 0.9, height: 0 }}
              transition={{ duration: 0.3 }}
              className="px-3 py-2.5 border-b border-outline-variant/10 last:border-0"
            >
              <div className="group relative overflow-hidden rounded-2xl border border-outline-variant/20 bg-white/75 px-3.5 py-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary hover:text-white hover:shadow-lg hover:shadow-primary/15">
                <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-danger group-hover:bg-white/70" />

                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-danger/15 bg-danger/10 text-danger shadow-inner transition-all duration-300 group-hover:border-white/25 group-hover:bg-white/20 group-hover:text-white">
                    <AlertTriangle className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <h3 className="truncate text-sm font-black text-on-surface transition-colors group-hover:text-white">
                          @{action.authorUsername || "Unknown user"}
                        </h3>
                        <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-outline-variant/70 group-hover:bg-white/60 sm:block" />
                        <span className="hidden truncate text-[10px] font-black uppercase tracking-widest text-danger transition-colors group-hover:text-white/80 sm:block">
                          {outcomeLabel}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-[10px] font-bold text-text-secondary transition-colors group-hover:text-white/70 sm:inline-flex">
                          {actionTime}
                        </span>
                        <button
                          onClick={(e) => handleDeleteAction(action, e)}
                          disabled={deletingId === action.id}
                          className="rounded-lg p-1.5 text-text-secondary opacity-100 transition-all hover:bg-danger/10 hover:text-danger focus:opacity-100 disabled:opacity-50 group-hover:text-white/75 group-hover:hover:bg-white/20 group-hover:hover:text-white"
                          title="Delete entry"
                          aria-label="Delete bot action entry"
                        >
                          {deletingId === action.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    <p className="mt-1 line-clamp-2 break-words text-[12px] font-semibold italic leading-relaxed text-on-surface/85 transition-colors group-hover:text-white/90">
                        "{action.content || "Message content unavailable"}"
                      </p>

                    <div className="mt-2 flex items-center gap-2 overflow-hidden">
                      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-secondary transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                        <ShieldAlert className="h-3 w-3 shrink-0" />
                        <span className="truncate sm:hidden">{outcomeLabel}</span>
                        <span className="hidden sm:inline">Actioned</span>
                      </span>
                      <span className="inline-flex min-w-0 rounded-full border border-outline-variant/20 bg-surface-container/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-secondary transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                        <span className="truncate">
                          {detectorLabel}
                        </span>
                      </span>
                      <span className="inline-flex min-w-0 rounded-full border border-outline-variant/20 bg-surface-container/60 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-text-secondary transition-all group-hover:border-white/25 group-hover:bg-white/15 group-hover:text-white">
                        <span className="truncate">
                          {ruleLabel}
                        </span>
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-bold text-text-secondary transition-colors group-hover:text-white/70 sm:hidden">
                      <span>{actionTime}</span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
