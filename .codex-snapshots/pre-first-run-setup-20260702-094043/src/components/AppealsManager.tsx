import React, { useState, useEffect } from "react";
import { useServer } from "../context/ServerContext";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "../firebase";
import { ShieldAlert, CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { PermissionGateModal } from "./PermissionGateModal";
import { EmptyState } from "./EmptyState";

export default function AppealsManager({ hideHeader }: { hideHeader?: boolean }) {
  const { selectedServerId } = useServer();
  const [user] = useAuthState(auth);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingPermModal, setMissingPermModal] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedServerId || !user) {
      setLoading(false);
      return;
    }
    fetchAppeals();
  }, [selectedServerId, user]);

  const fetchAppeals = async () => {
    setLoading(true);
    try {
      // In a real implementation this might be an API call if Firestore rules restrict reading to all,
      // but if the user relies on a Firebase backend, we can query. The prompt instructed:
      // "GET /api/guilds/:serverId/appeals - returns moderation cases where status == appealed or appealStatus == submitted"
      // Let's implement this fetch using the backend API as specifically requested.
      const idToken = await user!.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/appeals`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Fetch appeals failed:", res.status, text);
        if (res.status === 403) setMissingPermModal("Manage Server");
        else toast.error("Failed to fetch appeals. Status: " + res.status);
        setAppeals([]);
        return;
      }

      const data = await res.json();
      const submittedAppeals = (data.appeals || []).filter((a: any) => a.appealStatus === "submitted");
      setAppeals(submittedAppeals);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load appeals.");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (caseId: string, action: "uphold" | "overturn", reviewNote: string) => {
    try {
      const idToken = await user!.getIdToken();
      const res = await fetch(`/api/guilds/${selectedServerId}/appeals/${caseId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ reviewNote }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          setMissingPermModal("Manage Server");
          return;
        }
        throw new Error("Action failed.");
      }

      toast.success(`Appeal successfully ${action === "uphold" ? "upheld" : "overturned"}.`);
      setAppeals(appeals.filter((a) => a.caseId !== caseId));
    } catch (err) {
      console.error(err);
      toast.error("Failed to perform action.");
    }
  };

  return (
    <div className="space-y-6 pb-32 relative">
      <PermissionGateModal missing={missingPermModal} onClose={() => setMissingPermModal(null)} />
      
      {!hideHeader && (
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white/60 backdrop-blur-xl p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-white shadow-xl shadow-primary/5 mb-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-warning-container/20 rounded-2xl flex items-center justify-center text-warning border border-warning/10 shadow-inner">
              <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-on-surface tracking-tight">
                  Appeals
                </h1>
              </div>
              <p className="text-text-secondary text-[9px] sm:text-[11px] font-black uppercase tracking-widest mt-1">
                Review user appeals for moderation actions.
              </p>
            </div>
          </div>
        </header>
      )}

      <div className="w-full">
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="w-8 h-8 rounded-full border-4 border-outline-variant/30 border-t-primary animate-spin" />
          </div>
        ) : appeals.length === 0 ? (
          <div className="py-12 bg-white/40 backdrop-blur-md rounded-[2.5rem] border border-white/60 shadow-xl shadow-primary/5">
            <EmptyState title="No Pending Appeals" description="There are currently no appeals awaiting review." />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {appeals.map((appeal) => (
                <AppealCard key={appeal.caseId} appeal={appeal} onAction={handleAction} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function AppealCard({ appeal, onAction }: { key?: React.Key; appeal: any; onAction: (id: string, act: "uphold"| "overturn", note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (action: "uphold" | "overturn") => {
    setIsSubmitting(true);
    await onAction(appeal.caseId, action, note);
    setIsSubmitting(false); // Only useful if the element doesn't unmount, but the parent filters it out on success
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] border border-white/40 shadow-xl shadow-primary/5 flex flex-col h-full"
    >
      <div className="flex justify-between items-start mb-4 gap-2">
        <div>
          <h3 className="text-sm font-bold text-on-surface line-clamp-1">{appeal.username}</h3>
          <p className="text-xs text-text-secondary mt-0.5 font-mono">{appeal.caseId}</p>
        </div>
        <span className="text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-full bg-surface-variant text-text-secondary">
          {appeal.actionTaken}
        </span>
      </div>

      <div className="space-y-3 mb-6 flex-1 text-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary block mb-1">Reason</span>
          <p className="text-on-surface line-clamp-2">{appeal.reason}</p>
        </div>
        {appeal.evidenceSnippet && (
          <div className="bg-surface-container/30 border border-outline-variant/10 p-2.5 rounded-xl">
             <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary block mb-1">Evidence</span>
             <p className="text-text-secondary italic text-xs">{appeal.evidenceSnippet}</p>
          </div>
        )}
        <div className="bg-primary/5 border border-primary/10 p-3 rounded-xl mt-4">
             <span className="text-[10px] font-black uppercase tracking-widest text-primary block mb-1">Appeal Text</span>
             <p className="text-on-surface text-sm break-words">{appeal.appealText || "No additional comments provided."}</p>
        </div>
      </div>

      <div className="mt-auto space-y-4">
        <div>
          <input
            type="text"
            placeholder="Optional review note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full text-xs px-3 py-2 bg-surface-container/50 border border-outline-variant/20 rounded-xl focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
           <button
             disabled={isSubmitting}
             onClick={() => handleAction("uphold")}
             className="flex-1 bg-surface-variant text-on-surface hover:bg-surface-container font-black text-[10px] uppercase tracking-widest py-2 rounded-xl transition-all flex justify-center items-center gap-1.5 disabled:opacity-50"
           >
             <CheckCircle className="w-3.5 h-3.5" /> Uphold
           </button>
           <button
             disabled={isSubmitting}
             onClick={() => handleAction("overturn")}
             className="flex-1 bg-danger text-white hover:opacity-90 font-black text-[10px] uppercase tracking-widest py-2 rounded-xl transition-all shadow-md shadow-danger/20 flex justify-center items-center gap-1.5 disabled:opacity-50"
           >
             <XCircle className="w-3.5 h-3.5" /> Overturn
           </button>
        </div>
      </div>
    </motion.div>
  );
}
