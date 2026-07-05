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
      className="group relative overflow-hidden rounded-[2rem] bg-primary p-5 text-white shadow-xl shadow-primary/20 flex flex-col h-full"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_12%,rgba(255,255,255,0.30),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.22),transparent_48%)]" />
      <div className="relative z-10 flex flex-col gap-5 h-full">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/65">Pending Appeal</p>
            <h3 className="mt-1 text-lg font-black leading-tight tracking-tight text-white line-clamp-1">
              Appeal by: {appeal.username || "Unknown user"}
            </h3>
            <p className="mt-1 text-[11px] font-bold text-white/72 break-all">
              Appeal ID: {appeal.caseId || "Unknown appeal"}
            </p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/18 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)]">
            <ShieldAlert className="h-5 w-5" />
          </div>
        </div>

        <div className="grid gap-3 text-sm">
          <div className="rounded-2xl bg-white p-4 text-on-surface shadow-sm">
            <span className="block text-[10px] font-black uppercase tracking-widest text-primary">Original Reason</span>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-on-surface line-clamp-3">
              {appeal.reason || "No original reason was recorded."}
            </p>
          </div>

          {appeal.evidenceSnippet && (
            <div className="rounded-2xl bg-white p-4 text-on-surface shadow-sm">
              <span className="block text-[10px] font-black uppercase tracking-widest text-primary">Message Evidence</span>
              <p className="mt-1.5 text-xs font-semibold italic leading-relaxed text-text-secondary line-clamp-4">
                {appeal.evidenceSnippet}
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-white p-4 text-on-surface shadow-sm">
            <span className="block text-[10px] font-black uppercase tracking-widest text-primary">Member Appeal</span>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-on-surface break-words">
              {appeal.appealText || "No additional comments provided."}
            </p>
          </div>
        </div>

        <div className="mt-auto space-y-3">
          <input
            type="text"
            placeholder="Optional review note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-2xl border border-white/70 bg-white px-4 py-3 text-xs font-semibold text-on-surface placeholder:text-text-secondary/70 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/70"
          />
          <div className="flex gap-2">
            <button
              disabled={isSubmitting}
              onClick={() => handleAction("uphold")}
              className="flex-1 rounded-2xl bg-white/18 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35)] transition-all hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 flex justify-center items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Uphold
            </button>
            <button
              disabled={isSubmitting}
              onClick={() => handleAction("overturn")}
              className="flex-1 rounded-2xl bg-white py-3 text-[10px] font-black uppercase tracking-widest text-primary shadow-sm transition-all hover:bg-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50 flex justify-center items-center gap-1.5"
            >
              <XCircle className="w-3.5 h-3.5" /> Overturn
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
