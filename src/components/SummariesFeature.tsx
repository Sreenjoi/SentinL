import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { FileText, Loader2, Calendar as CalendarIcon, MessageSquare, Trash2, ChevronDown, ChevronUp, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useServer } from '../context/ServerContext';
import { BrandedPageHeader, HeaderMetaPills } from './BrandedPageHeader';
import { getPlanDisplayLabel } from '../utils/planDisplay';

interface SummaryCardProps {
    s: any;
    handleDeleteSummary: (id: string) => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ s, handleDeleteSummary }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(s.summaryText);
        setIsCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="bg-white/70 backdrop-blur-md border border-white/60 shadow-sm rounded-3xl p-6 hover:shadow-md transition-shadow">
            <div 
                className="flex justify-between items-start gap-4 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-start gap-3 min-w-0">
                     <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                         <MessageSquare className="w-5 h-5" />
                     </div>
                     <div className="flex flex-col min-w-0">
                         <span className="font-bold text-on-surface truncate">#{s.channelName}</span>
                         <div className="flex items-center gap-1.5 mt-1">
                             <CalendarIcon className="w-3.5 h-3.5 text-text-secondary" />
                             <span className="text-xs font-semibold text-text-secondary">{s.date}</span>
                         </div>
                         {!isExpanded && (
                             <p className="mt-3 text-sm text-text-secondary line-clamp-2 leading-relaxed">
                                 {s.summaryText}
                             </p>
                         )}
                     </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button 
                        className="text-text-secondary hover:text-primary hover:bg-primary/10 p-2 rounded-xl transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        aria-label={isExpanded ? "Collapse summary" : "Expand summary"}
                    >
                        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    <button 
                        onClick={handleCopy}
                        className="text-text-secondary hover:text-primary hover:bg-primary/10 p-2 rounded-xl transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" 
                        title="Copy Summary"
                        aria-label="Copy summary"
                    >
                        {isCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteSummary(s.id); }} 
                        className="text-danger hover:bg-danger/10 p-2 rounded-xl transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30" 
                        title="Delete Summary"
                        aria-label="Delete summary"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "circOut" }}
                        className="overflow-hidden"
                    >
                        <div className="prose prose-sm max-w-none text-text-primary leading-relaxed whitespace-pre-wrap mt-5 pt-5 border-t border-outline-variant/30 font-medium animate-in fade-in slide-in-from-top-2 duration-300">
                            {s.summaryText}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const SummariesFeature = () => {
   const [user] = useAuthState(auth);
   const { selectedServerId: serverId, isPro, tier, isBetaTester, isTrial, isSharedServer } = useServer();
   const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
   const [summaries, setSummaries] = useState<any[]>([]);
   
   const [selectedChannel, setSelectedChannel] = useState('');
   const [selectedDate, setSelectedDate] = useState('');
   const [isGenerating, setIsGenerating] = useState(false);
   const [isChannelsLoading, setIsChannelsLoading] = useState(false);
   const [isSummariesLoading, setIsSummariesLoading] = useState(false);
   const [currentPage, setCurrentPage] = useState(1);
   const ITEMS_PER_PAGE = 5;

   const totalPages = Math.ceil(summaries.length / ITEMS_PER_PAGE);

   useEffect(() => {
       if (currentPage > totalPages && totalPages > 0) {
           setCurrentPage(totalPages);
       }
   }, [summaries, currentPage, totalPages]);

   useEffect(() => {
       if (!user || !serverId) {
           setChannels([]);
           setSummaries([]);
           setIsChannelsLoading(false);
           setIsSummariesLoading(false);
           return;
       }

       let isActive = true;
       const abortController = new AbortController();
       setChannels([]);
       setSelectedChannel('');
       setSummaries([]);
       setCurrentPage(1);
       setIsChannelsLoading(true);
       setIsSummariesLoading(true);

       const summariesRef = collection(db, "servers", serverId, "summaries");
       const summariesQuery = query(summariesRef, orderBy("createdAt", "desc"));
       const unsubscribeSummaries = onSnapshot(summariesQuery, (snap) => {
           if (!isActive) return;
           const loaded = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
           setSummaries(loaded);
           setIsSummariesLoading(false);
       }, (err) => {
           if (!isActive) return;
           console.error("Summaries snap error", err);
           setIsSummariesLoading(false);
           toast.error("Failed to load summaries");
       });

       const loadChannels = async () => {
           try {
               const token = await user.getIdToken();
               const channelsRes = await fetch(`/api/discord/channels/${serverId}`, {
                   headers: { Authorization: `Bearer ${token}` },
                   signal: abortController.signal,
               });
               if (!isActive) return;
               if (!channelsRes.ok) {
                   setChannels([]);
                   return;
               }
               const channelsData = await channelsRes.json();
               setChannels(Array.isArray(channelsData.channels) ? channelsData.channels : []);
           } catch (e: any) {
               if (e?.name !== "AbortError") {
                   console.error(e);
                   toast.error("Failed to load summary channels");
               }
           } finally {
               if (isActive) setIsChannelsLoading(false);
           }
       };

       loadChannels();

       return () => {
           isActive = false;
           abortController.abort();
           unsubscribeSummaries();
       };
   }, [user, serverId]);

   const handleGenerate = async () => {
       if (!selectedChannel || !selectedDate) {
           return toast.error("Please select a channel and a date.");
       }
       
       setIsGenerating(true);
       try {
           const token = await user?.getIdToken();
           const res = await fetch(`/api/guilds/${serverId}/summary`, {
               method: "POST",
               headers: {
                   "Content-Type": "application/json",
                   Authorization: `Bearer ${token}`
               },
               body: JSON.stringify({ channelId: selectedChannel, date: selectedDate })
           });

           const data = await res.json();
           if (!res.ok) {
               throw new Error(data.error || "Failed to generate summary");
           }

           toast.success("Summary generated!");
       } catch (err: any) {
           toast.error(err.message || "Failed to generate summary");
       } finally {
           setIsGenerating(false);
       }
   };

   const handleDeleteSummary = async (summaryId: string) => {
              
       try {
           const token = await user?.getIdToken();
           const res = await fetch(`/api/guilds/${serverId}/summary/${summaryId}`, {
               method: "DELETE",
               headers: {
                   Authorization: `Bearer ${token}`
               }
           });

           if (!res.ok) {
               const data = await res.json().catch(() => ({}));
               throw new Error(data.error || "Failed to delete summary");
           }

           toast.success("Summary deleted.");
       } catch (err: any) {
           toast.error(err.message || "Failed to delete summary");
       }
   };

   const paginatedSummaries = summaries.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

   return (
       <div className="flex flex-col gap-8 relative">
           <BrandedPageHeader
               eyebrow="Recaps"
               title="Chat Summaries"
               description="Generate readable recaps from Discord channel conversations for moderators and server leads."
               icon={FileText}
               meta={
                   <HeaderMetaPills
                       planLabel={getPlanDisplayLabel({ tier, isBetaTester, isTrial, isSharedServer })}
                       path={["Summaries"]}
                   />
               }
           />

           <div className="grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
               <section className="bg-white/80 border border-white/40 rounded-3xl shadow-sm overflow-hidden xl:sticky xl:top-6">
                   <div className="bg-primary px-6 py-5 text-white">
                       <h2 className="text-xl font-black tracking-tight text-white">Generate Summary</h2>
                       <p className="text-sm font-medium text-white/78 mt-2">
                           Pick one text channel and one date to create a new recap.
                       </p>
                   </div>
                   <div className="space-y-5 p-6">
                       <div>
                           <label className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">Channel</label>
                            <select 
                                value={selectedChannel} 
                                onChange={e => setSelectedChannel(e.target.value)}
                                disabled={isChannelsLoading || isGenerating}
                                className="w-full bg-surface border border-outline-variant/50 text-on-surface rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow text-sm font-medium"
                            >
                                <option value="">
                                    {isChannelsLoading ? "Loading text channels..." : "Select a text channel..."}
                                </option>
                                {channels.map(ch => (
                                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                ))}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold uppercase tracking-widest text-text-secondary mb-2">Date</label>
                           <input 
                               type="date" 
                               value={selectedDate}
                               onChange={e => setSelectedDate(e.target.value)}
                               max={new Date().toISOString().split("T")[0]}
                               className="w-full bg-surface border border-outline-variant/50 text-on-surface rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-shadow text-sm font-medium"
                           />
                       </div>
                       <button 
                           onClick={handleGenerate}
                           disabled={isGenerating}
                           className="w-full px-8 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 h-[46px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                       >
                           {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate Summary"}
                       </button>
                   </div>
               </section>

               <section className="bg-white/80 border border-white/40 rounded-3xl shadow-sm min-w-0 overflow-hidden">
                   <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 bg-primary px-6 py-5 text-white">
                       <div>
                           <h2 className="text-xl font-black tracking-tight text-white">Past Summaries</h2>
                           <p className="text-sm font-medium text-white/78 mt-1">
                               Review, copy, or remove summaries generated for this server.
                           </p>
                       </div>
                       {summaries.length > 0 && (
                           <span className="text-xs font-bold uppercase tracking-widest text-white/85 bg-white/10 border border-white/25 rounded-full px-3 py-1.5 w-fit">
                               {summaries.length} total
                           </span>
                       )}
                   </div>

                   <div className="p-4 sm:p-6">
                    {isSummariesLoading ? (
                        <div className="flex flex-col gap-4 animate-pulse">
                            <div className="h-32 w-full rounded-3xl bg-white/70 border border-white/60" />
                            <div className="h-32 w-full rounded-3xl bg-white/70 border border-white/60" />
                            <div className="h-32 w-full rounded-3xl bg-white/70 border border-white/60" />
                        </div>
                    ) : summaries.length === 0 ? (
                        <div className="text-center py-16 bg-surface border border-dashed border-outline-variant/50 rounded-3xl">
                           <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 border border-primary/20">
                               <FileText className="w-7 h-7" />
                           </div>
                           <p className="text-on-surface font-bold">No summaries generated yet</p>
                           <p className="text-text-secondary font-medium text-sm mt-2">
                               Generate one from the panel to start building a summary history.
                           </p>
                       </div>
                   ) : (
                       <div className="flex flex-col gap-5">
                           <div className="grid grid-cols-1 gap-4">
                               {paginatedSummaries.map((s, idx) => (
                                  <SummaryCard key={s.id || idx} s={s} handleDeleteSummary={handleDeleteSummary} />
                              ))}
                           </div>
                           {totalPages > 1 && (
                               <div className="flex items-center justify-between bg-surface px-6 py-4 rounded-2xl border border-outline-variant/40">
                                  <span className="text-sm font-semibold text-text-secondary">
                                      Page {currentPage} of {totalPages}
                                  </span>
                                  <div className="flex items-center gap-2">
                                      <button
                                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                          disabled={currentPage === 1}
                                          className="p-2 rounded-xl text-text-secondary hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                          aria-label="Previous summaries page"
                                      >
                                          <ChevronLeft className="w-5 h-5" />
                                      </button>
                                      <button
                                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                          disabled={currentPage === totalPages}
                                          className="p-2 rounded-xl text-text-secondary hover:text-primary hover:bg-primary/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                          aria-label="Next summaries page"
                                      >
                                          <ChevronRight className="w-5 h-5" />
                                      </button>
                                  </div>
                               </div>
                           )}
                       </div>
                   )}
                   </div>
               </section>
           </div>
        </div>
    );
};
