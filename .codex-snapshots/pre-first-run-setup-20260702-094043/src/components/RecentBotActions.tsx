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
      <div className="px-6 py-5 border-b border-outline-variant/30 flex justify-between items-center relative z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
             <Logo className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-black text-on-surface tracking-tight leading-none">Recent Bot Actions</h2>
            <p className="text-[11px] text-text-secondary mt-1.5 font-medium">Automated interventions by SentinL.</p>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary uppercase font-black text-[10px] tracking-widest">
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
            {actions.map((action, idx) => (
            <motion.div 
              layout
              key={action.id}
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, scale: 0.9, height: 0 }}
              transition={{ duration: 0.3 }}
              className="p-4 flex items-start gap-4 hover:bg-surface-container/30 transition-colors border-b border-outline-variant/10 last:border-0 group"
            >
              <div className="w-10 h-10 rounded-full flex-shrink-0 bg-danger/10 text-danger flex items-center justify-center border border-danger/20">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-baseline justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-on-surface truncate">@{action.authorUsername || "Unknown"}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider text-text-secondary border border-outline-variant/50 px-2 py-0.5 rounded-md bg-surface-container shrink-0">
                      {action.level === "Keyword" ? "Keyword Rule" : "AI Filter"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-text-secondary font-medium hidden sm:block">
                      {action.timestamp ? formatDistanceToNow(new Date(action.timestamp.seconds ? action.timestamp.seconds * 1000 : action.timestamp), { addSuffix: true }) : "Unknown time"}
                    </span>
                    <button
                      onClick={(e) => handleDeleteAction(action, e)}
                      disabled={deletingId === action.id}
                      className="p-1.5 rounded-lg text-text-secondary opacity-0 group-hover:opacity-100 placeholder:hover:opacity-100 hover:bg-danger/10 hover:text-danger focus:opacity-100 transition-all disabled:opacity-50"
                      title="Delete Entry"
                    >
                      {deletingId === action.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="bg-surface-container/50 border border-outline-variant/30 rounded-xl p-3 mb-2 mr-2">
                  <p className="text-[13px] text-on-surface font-medium italic break-words line-clamp-3">
                    "{action.content}"
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                   <ShieldAlert className="w-3.5 h-3.5 text-danger/70 shrink-0" />
                   <span className="text-[10px] uppercase font-bold tracking-widest text-danger/70 shrink-0">
                     {action.actionTaken === "auto_deleted" ? "MESSAGE AUTO-DELETED" : "USER WARNED"}
                   </span>
                   {(action.primaryCategory || action.reason) && (
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-outline-variant/50 shrink-0" />
                        <span className="text-[10px] text-text-secondary font-medium truncate hidden sm:block">
                          {action.primaryCategory ? `Rule: ${action.primaryCategory}` : `Reason: ${action.reason}`}
                        </span>
                      </div>
                   )}
                </div>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
