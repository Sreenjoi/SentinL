import React, { useState, useEffect } from "react";
import { EmptyState } from "./EmptyState";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { ProGate } from "./ProGate";
import { db } from "../firebase";
import { useServer } from "../context/ServerContext";
import { ShieldAlert, ExternalLink, Trophy, AlertOctagon } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { CopyableId } from "./CopyableId";
import { motion, AnimatePresence } from "motion/react";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { Logo } from "./Logo";

interface Offender {
  id: string; // The authorId
  authorUsername: string;
  authorAvatar?: string | null;
  score: number;
  flaggedCount: number;
  lastUpdated: string;
}

export default function Offenders({
  hideHeader,
}: { hideHeader?: boolean } = {}) {
  const { isPro, selectedServerId, tier, loading: serverLoading } = useServer();
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedServerId) {
      setOffenders([]);
      setLoading(false);
      return;
    }

    // Reference the offenders subcollection for the specifically selected server
    const q = query(
      collection(db, `servers/${selectedServerId}/offenders`),
      orderBy("score", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Offender[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Offender);
      });
      setOffenders(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.GET, `servers/${selectedServerId}/offenders`));

    return () => unsubscribe();
  }, [selectedServerId]);

  if (serverLoading || loading) {
    return (
      <div className="flex justify-center items-center h-64 text-text-secondary">
        Loading repeat offenders...
      </div>
    );
  }

  if (!selectedServerId) {
    return (
      <div className="flex justify-center items-center h-64 text-text-secondary">
        Please select a server to view offenders.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!hideHeader && (
        <header className="flex justify-between items-center mb-0 sm:mb-8">
          <div className="bg-white/80 backdrop-blur-md border border-white/40 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl flex items-center gap-3 shadow-xl shadow-primary/5">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-danger/20 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4 sm:w-5 sm:h-5 text-danger" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs sm:text-sm text-on-surface leading-none">
                  Repeat Offenders
                </span>
                {(!isPro) && (
                  <span className="text-[8px] sm:text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">
                    PRO
                  </span>
                )}
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-text-secondary uppercase tracking-widest mt-1">
                Highest rule-breakers
              </span>
            </div>
          </div>
        </header>
      )}

      <ProGate isPro={isPro} featureName="List of Repeat Offenders" featureDescription="View detailed lists of toxic behavior scores inside the Pro dashboard" className="transition-all duration-300 ease-in-out w-full text-left">
        <div className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl shadow-primary/5 overflow-hidden">
          <div className="px-6 sm:px-8 py-4 sm:py-6 border-b border-primary/20 flex justify-between items-center bg-primary">
            <div className="text-xs sm:text-sm font-black text-white flex items-center gap-2 sm:gap-2.5 tracking-tight uppercase">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white/90" /> Offender List
            </div>
            <span className="text-[9px] sm:text-[10px] font-black text-white bg-white/20 px-2.5 py-1 rounded-full border border-white/30">
              {offenders.length} TOTAL
            </span>
          </div>

          {offenders.length === 0 ? (
            <EmptyState 
              title="No Repeat Offenders"
              description="No users have broken the rules multiple times yet."
            />
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block sm:hidden divide-y divide-outline-variant/10">
                <AnimatePresence mode="popLayout">
                  {offenders.map((user, idx) => (
                    <motion.div
                      key={user.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.05 }}
                      className="p-5"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shadow-inner ${
                              idx === 0
                                ? "bg-primary text-white"
                                : idx === 1
                                  ? "bg-slate-400 text-white"
                                  : idx === 2
                                    ? "bg-amber-600 text-white"
                                    : "bg-surface-variant text-on-surface-variant"
                            }`}
                          >
                            #{idx + 1}
                          </div>
                          {user.authorAvatar ? (
                            <img
                              src={user.authorAvatar}
                              alt={user.authorUsername}
                              className="w-10 h-10 rounded-xl object-cover shadow-sm border border-outline-variant/30"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-surface-container rounded-xl flex items-center justify-center text-primary font-black border border-outline-variant/30 shadow-sm text-xs">
                              {user.authorUsername?.[0]?.toUpperCase() || "?"}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="font-extrabold text-sm text-on-surface truncate max-w-[120px]">@{user.authorUsername || user.id}</span>
                            <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest font-mono">UID: {user.id.substring(0, 12)}...</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(user.id);
                            toast.success("User ID copied");
                          }}
                          title="Copy User ID"
                          className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-container/50 px-3 py-2 rounded-xl border border-outline-variant/10 flex flex-col items-center">
                          <span className="text-sm font-black text-on-surface">{user.flaggedCount}</span>
                          <span className="text-[8px] font-black text-text-secondary uppercase tracking-tighter">Messages</span>
                        </div>
                        <div className="bg-danger/5 px-3 py-2 rounded-xl border border-danger/10 flex flex-col items-center">
                          <span className="text-sm font-black text-danger">{user.score}</span>
                          <span className="text-[8px] font-black text-danger uppercase tracking-tighter">Score</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Tablet/Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-container/50">
                      <th className="text-left px-8 py-5 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30 w-24">
                        Rank
                      </th>
                      <th className="text-left px-8 py-5 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                        User
                      </th>
                      <th className="text-center px-8 py-5 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                        Flagged Messages
                      </th>
                      <th className="text-center px-8 py-5 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                        Score
                      </th>
                      <th className="text-right px-8 py-5 text-[10px] uppercase tracking-widest text-text-secondary font-black border-b border-outline-variant/30">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {offenders.map((user, idx) => (
                        <motion.tr
                          key={user.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: idx * 0.05 }}
                          className="group hover:bg-surface-container/20 transition-all duration-300 ease-out border-b border-outline-variant/20 last:border-0"
                        >
                          <td className="px-8 py-6 align-middle">
                            <div
                              className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shadow-inner ${
                                idx === 0
                                  ? "bg-primary text-white shadow-primary/30"
                                  : idx === 1
                                    ? "bg-slate-400 text-white shadow-slate-300/30"
                                    : idx === 2
                                      ? "bg-amber-600 text-white shadow-amber-600/30"
                                      : "bg-surface-variant text-on-surface-variant"
                              }`}
                            >
                              #{idx + 1}
                            </div>
                          </td>
                          <td className="px-8 py-6 align-middle">
                            <div className="flex justify-start items-start gap-3">
                              <div className="shrink-0 mt-0.5">
                                {user.authorAvatar ? (
                                  <img
                                    src={user.authorAvatar}
                                    alt={user.authorUsername}
                                    className="w-9 h-9 rounded-xl object-cover shadow-sm border border-outline-variant/30"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="w-9 h-9 bg-surface-container rounded-xl flex items-center justify-center text-xs font-extrabold text-primary border border-outline-variant/30">
                                    {user.authorUsername?.[0]?.toUpperCase() || "?"}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <div className="text-on-surface font-bold text-sm tracking-tight truncate max-w-[120px] sm:max-w-none">
                                    @{user.authorUsername || user.id}
                                  </div>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(user.id);
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
                                    ID: <CopyableId id={user.id} />
                                  </span>
                                  <span
                                    className="text-text-secondary font-medium cursor-help"
                                    title={user.lastUpdated ? format(new Date(user.lastUpdated), "yyyy-MM-dd HH:mm:ss") : ""}
                                  >
                                    {user.lastUpdated ? formatDistanceToNow(new Date(user.lastUpdated), { addSuffix: true }) : "Unknown time"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6 align-middle text-center">
                            <div className="inline-flex flex-col items-center bg-surface-container/50 px-4 py-2 rounded-2xl border border-outline-variant/20">
                              <span className="text-lg font-black text-on-surface">
                                {user.flaggedCount}
                              </span>
                              <span className="text-[9px] font-black text-text-secondary uppercase tracking-tighter">
                                Messages
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 align-middle text-center">
                            <div className="inline-flex min-w-[70px] bg-danger/10 px-4 py-2 rounded-2xl border border-danger/20">
                              <span className="text-lg font-black text-danger mx-auto">
                                {user.score}
                              </span>
                            </div>
                          </td>
                          <td className="px-8 py-6 align-middle text-right">
                            <a
                              href={`https://discord.com/users/${user.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-surface-container text-primary font-black text-[10px] rounded-full uppercase tracking-widest hover:bg-primary hover:text-white transition-all duration-300 ease-out shadow-sm active:scale-95"
                            >
                              View Member <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </ProGate>
    </div>
  );
}
