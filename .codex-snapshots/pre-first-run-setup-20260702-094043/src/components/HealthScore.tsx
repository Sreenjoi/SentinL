import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useServer } from "../context/ServerContext";
import { useSaveState } from "../hooks/useSaveState";
import { ChannelSelector } from "./ChannelSelector";
import { Select } from "./Select";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { ProGate } from "./ProGate";
import { Check, Loader2, Info, Lock, Crown } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "./Logo";

interface Channel {
  id: string;
  name: string;
}

const MILESTONES = [0, 30, 60, 90, 180, 365];
const NEXT_MILESTONES = [30, 60, 90, 180, 365];

function getStreakProgress(streakDays: number): number {
  const prevMilestone = MILESTONES.slice().reverse().find(m => m <= streakDays) || 0;
  const nextMilestone = NEXT_MILESTONES.find(m => m > streakDays) || 365;
  if (nextMilestone === prevMilestone) return 100;
  return Math.min(100, Math.max(0,
    ((streakDays - prevMilestone) / (nextMilestone - prevMilestone)) * 100
  ));
}

function AnimatedScoreCounter({ targetValue }: { targetValue: number | null }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => {
    if (targetValue === null) return "N/A";
    const isFloat = targetValue % 1 !== 0;
    return isFloat ? latest.toFixed(1) : Math.round(latest).toString();
  });

  useEffect(() => {
    if (targetValue !== null) {
      const animation = animate(count, targetValue, { duration: 1.5, ease: "easeOut" });
      return animation.stop;
    }
  }, [targetValue, count]);

  if (targetValue === null) return <span>N/A</span>;
  return <motion.span>{rounded}</motion.span>;
}

export default function HealthScore() {
  const { selectedServerId, tier, isBetaTester, isTrial , isPro} = useServer();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  

  const [widgetSettings, setWidgetSettings] = useState({
    enabled: false,
    channelId: "",
    color: "",
    badgeStyle: "shield",
    motto: "",
    lastScore: "",
    lastGrade: "",
    streakDays: 0,
    peacefulStreakDays: 0,
    totalPeacefulDays: 0,
    recoveredPoints: 0,
    announceMilestones: false,
    recoveryMessages: true,
    communityRewards: true,
    milestoneChannelId: "",
    milestoneMessage: "",
    totalMessages: 0,
  });

  const { isSaved, setIsSaved, hasChanges, resetSaveState, updateBaseline } = useSaveState(widgetSettings);

  useEffect(() => {
    if (!selectedServerId) return;

    let unsubscribe: () => void;
    const loadConfig = () => {
      setLoading(true);
      const docRef = doc(db, `servers/${selectedServerId}`);
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.healthWidget) {
            const newSettings = {
              enabled: data.healthWidget.enabled || false,
              channelId: data.healthWidget.channelId || "",
              color: data.healthWidget.color || "",
              badgeStyle: data.healthWidget.badgeStyle || "shield",
              motto: data.healthWidget.motto || "",
              lastScore: data.healthWidget.lastScore || "",
              lastGrade: data.healthWidget.lastGrade || "",
              streakDays: data.healthWidget.streakDays || 0,
              peacefulStreakDays: data.healthWidget.peacefulStreakDays || 0,
              totalPeacefulDays: data.healthWidget.totalPeacefulDays || 0,
              recoveredPoints: data.healthWidget.recoveredPoints || 0,
              announceMilestones: data.healthWidget.announceMilestones || false,
              recoveryMessages: data.healthWidget.recoveryMessages !== false,
              communityRewards: data.healthWidget.communityRewards !== false,
              milestoneChannelId: data.healthWidget.milestoneChannelId || "",
              milestoneMessage: data.healthWidget.milestoneMessage || "",
              totalMessages: data.healthWidget.totalMessages || 0,
            };
            setWidgetSettings(prev => {
              // If prev is the default block (totalMessages === 0 might be a good hint, or we just trust resetSaveState earlier)
              // Actually, useSaveState tracks `hasChanges`. We can just skip overrides if !hasChanges.
              // But we can't easily read hasChanges inside setWidgetSettings unless it's in a ref.
              // Instead, we just check if prev.lastUpdated is missing. Our initial state has no lastUpdated.
              const isInitial = prev.totalMessages === 0 && prev.channelId === "";
              if (isInitial) {
                 updateBaseline(() => newSettings);
                 return newSettings;
              }
              const updated = {
                ...newSettings,
                enabled: prev.enabled,
                channelId: prev.channelId,
                color: prev.color,
                badgeStyle: prev.badgeStyle,
                motto: prev.motto,
                announceMilestones: prev.announceMilestones,
                recoveryMessages: prev.recoveryMessages,
                communityRewards: prev.communityRewards,
                milestoneChannelId: prev.milestoneChannelId,
                milestoneMessage: prev.milestoneMessage,
              };
              updateBaseline(() => updated);
              return updated;
            });
          }
        }
        setLoading(false);
      }, (err) => {
        console.error("Failed to load Health Widget settings.", err);
        setLoading(false);
      });
    };

    loadConfig();

    const fetchChannels = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/discord/channels/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.channels) setChannels(data.channels);
        } else if (res.status === 404) {
          setChannels([]);
        } else {
          const text = await res.text();
          console.error(`Failed to fetch channels (Status: ${res.status}):`, text);
        }
      } catch (err) {
        console.error("Fetch request failed:", err);
      }
    };
    fetchChannels();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedServerId]);

  const toggleWidgetSetting = async (field: Extract<keyof typeof widgetSettings, string>, value: boolean) => {
    if (!selectedServerId) return;

    const newSettings = { ...widgetSettings, [field]: value };
    setWidgetSettings(newSettings);
    updateBaseline((old: any) => ({ ...old, [field]: value }));
    try {
      const docRef = doc(db, `servers/${selectedServerId}`);
      await updateDoc(docRef, { [`healthWidget.${field}`]: value });
      toast.success("Setting updated.", { id: `${field}-toast`, duration: 2000 });
      if (field === "enabled") {
        handleSync(true);
      }
    } catch (err) {
      console.error(`Error toggling ${field}:`, err);
      toast.error("Failed to update setting.", { id: `${field}-toast` });
      setWidgetSettings(prev => ({ ...prev, [field]: !value }));
      updateBaseline((old: any) => ({ ...old, [field]: !value }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServerId) return;

    setSaving(true);
    try {
      const docRef = doc(db, `servers/${selectedServerId}`);
      const newSettings = {
        enabled: widgetSettings.enabled,
        channelId: widgetSettings.channelId,
        color: isPro ? widgetSettings.color : "",
        badgeStyle: isPro ? widgetSettings.badgeStyle : "shield",
        motto: isPro ? widgetSettings.motto : "",
        announceMilestones: isPro ? widgetSettings.announceMilestones : false,
        recoveryMessages: isPro ? widgetSettings.recoveryMessages : true,
        communityRewards: isPro ? widgetSettings.communityRewards : true,
        milestoneChannelId: isPro ? widgetSettings.milestoneChannelId : "",
        milestoneMessage: isPro ? widgetSettings.milestoneMessage : "",
      };
      
      const updatePayload: Record<string, any> = {};
      Object.entries(newSettings).forEach(([key, val]) => {
        updatePayload[`healthWidget.${key}`] = val;
      });
      await updateDoc(docRef, updatePayload);

      setIsSaved(true);
      toast.success("Health Widget settings saved!");
      setTimeout(() => setIsSaved(false), 2000);
      
      // Auto-trigger sync to immediately apply changes to Discord or delete it if disabled
      handleSync(true); // pass true to bypass disabled buttons check
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (forceAutoRun: any = false) => {
    if (!selectedServerId) return;
    setSyncing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/server/${selectedServerId}/health-widget/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
         const data = await res.json().catch(() => ({ error: "Failed to sync widget" }));
         const errText = data?.error || "Failed to sync widget";
         toast.error(errText);
         console.error("Failed to sync widget", errText);
      } else {
         toast.success("Widget synced to Discord!");
      }
    } catch(err) {
      console.error(err);
      toast.error("Failed to sync widget");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-8 animate-pulse">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
             <div className="h-8 w-64 bg-surface-container rounded-md"></div>
             <div className="h-10 w-96 bg-surface-container rounded-md"></div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
             <div className="w-32 h-12 bg-surface-container rounded-xl"></div>
             <div className="w-40 h-12 bg-surface-container rounded-xl"></div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-8">
           <div className="lg:col-span-8 space-y-8">
              <div className="bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 p-8 shadow-xl shadow-primary/5 min-h-[400px]">
                 <div className="h-6 w-48 bg-surface-container rounded-md mb-8"></div>
                 <div className="space-y-6">
                    <div className="h-16 w-full bg-surface-container rounded-xl"></div>
                    <div className="h-16 w-full bg-surface-container rounded-xl"></div>
                    <div className="h-16 w-full bg-surface-container rounded-xl"></div>
                 </div>
              </div>
           </div>
           <div className="lg:col-span-4 space-y-6">
              <div className="bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 p-8 shadow-xl shadow-primary/5 min-h-[300px]">
                 <div className="h-6 w-32 bg-surface-container rounded-md mb-8"></div>
                 <div className="flex justify-center mb-8">
                    <div className="w-32 h-32 bg-surface-container rounded-full"></div>
                 </div>
                 <div className="space-y-4">
                    <div className="h-4 w-full bg-surface-container rounded-md"></div>
                    <div className="h-4 w-2/3 mx-auto bg-surface-container rounded-md"></div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  }

  const numericScore = widgetSettings.lastScore && widgetSettings.lastScore !== "N/A"
    ? parseFloat(widgetSettings.lastScore)
    : null;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-on-surface mb-2 tracking-tight">
            Community Health
          </h2>
          <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
            Maintain a public-facing health score widget for your community.
            The algorithm evaluates community interactions and calculates a live percentage score, anchored by verified streaks and penalized by toxic disruptions, to reflect genuine community health.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={handleSync}
            disabled={saving || syncing || !widgetSettings.enabled || !widgetSettings.channelId}
            className="flex-1 md:flex-none px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 bg-surface-container text-on-surface hover:bg-surface-variant border border-outline-variant/30"
          >
            {syncing && <Loader2 className="w-3 h-3 animate-spin" />}
            Sync Now
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!hasChanges && !isSaved)}
            className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all duration-300 ease-out shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 ${
              isSaved
                ? "bg-emerald-500 text-white shadow-emerald-500/20"
                : !hasChanges
                  ? "bg-surface-container text-text-secondary/70 shadow-none cursor-default border border-outline-variant/30 active:scale-100"
                  : "bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95"
            } ${saving ? "opacity-50 cursor-wait" : ""}`}
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isSaved ? (
              <Check className="w-3 h-3" />
            ) : null}
            {isSaved ? "Saved" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Top Section: Current Score & How it works */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
        <div className="xl:col-span-2 bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden h-full">
           <span className="text-[10px] font-black uppercase text-text-secondary tracking-widest mb-3">Current Score</span>
           <div className="flex flex-col items-center gap-2 relative z-10 my-auto">
             <span className="text-8xl md:text-9xl font-black text-primary tracking-tighter leading-none">
               <AnimatedScoreCounter targetValue={numericScore} />
             </span>
             {widgetSettings.lastGrade && (
               <span className={`text-sm font-bold px-4 py-1.5 rounded-xl border shadow-sm mt-2 ${
                 widgetSettings.lastGrade === "N/A" 
                   ? "bg-surface-variant/50 text-text-muted border-outline-variant/30" 
                   : "bg-primary/10 text-primary border-primary/20"
               }`}>
                 {widgetSettings.lastGrade === "N/A" ? "Unranked" : `${widgetSettings.lastGrade} Grade`}
               </span>
             )}
           </div>
           
           {widgetSettings.lastScore === "N/A" && (
                    <div className="mt-auto pt-8 flex flex-col items-center w-full max-w-xs">
                 <span className="text-[10px] font-bold text-text-secondary pb-2 tracking-widest">
                   Gathering Data ({widgetSettings.totalMessages || 0}/500)
                 </span>
                 <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                    <div className="h-full bg-text-secondary rounded-full transition-all duration-500" style={{ width: `${Math.min(((widgetSettings.totalMessages || 0) / 500) * 100, 100)}%` }} />
                  </div>
               </div>
           )}

           {widgetSettings.lastScore !== "N/A" && widgetSettings.lastScore && (
             <div className="mt-auto w-full pt-8 border-t border-outline-variant/20 relative z-10">
                <div className="flex items-center gap-2 justify-center mb-4">
                   <div className={`w-2 h-2 rounded-full shadow-sm ${
                      numericScore !== null && numericScore >= 85 ? 'bg-primary animate-pulse shadow-primary/50' : 'bg-warning shadow-warning/50'
                   }`}></div>
                   <span className="text-xs font-bold text-on-surface text-center">
                      {numericScore !== null && numericScore >= 85 
                        ? 'Milestone Streak Active' 
                        : 'Streak Frozen (<85 Score)'}
                   </span>
                </div>

                <div className="w-full bg-surface-variant/50 rounded-full h-3 mb-3 overflow-hidden shadow-inner">
                   <div 
                     className="bg-primary h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                     style={{ 
                       width: `${getStreakProgress(widgetSettings.streakDays)}%` 
                     }}
                   >
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                   </div>
                </div>
                <div className="flex justify-between items-center text-xs uppercase font-bold tracking-widest text-text-secondary">
                   <span>{widgetSettings.streakDays} Days</span>
                   <span>Next: {NEXT_MILESTONES.find(m => m > widgetSettings.streakDays) || 365} Days</span>
                </div>
                <div className="mt-4 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-text-muted">
                   <span>Peaceful Days:</span>
                   <span className="text-primary">
                       <span className="text-text-muted">Total:</span> {widgetSettings.totalPeacefulDays || 0} <span className="opacity-50 mx-1">|</span> <span className="text-text-muted">Streak:</span> {widgetSettings.peacefulStreakDays || 0}
                   </span>
                </div>
             </div>
           )}
        </div>

        <div className="xl:col-span-1 bg-surface-container/30 border border-outline-variant/30 rounded-3xl p-8 flex flex-col h-full">
          <h3 className="text-xs font-black uppercase text-on-surface tracking-widest mb-6">How it works</h3>
          <div className="space-y-6 flex-grow">
             <div>
                 <strong className="text-sm text-on-surface flex items-center gap-2 mb-2">📈 Point Gains</strong>
                 <p className="text-xs text-text-secondary leading-relaxed">
                   <span className="font-bold text-on-surface">+2 to +5</span> Peaceful Day points based on streak. Awarded when there are no unhandled Extreme flags left at the end of the day.<br/>
                   <span className="font-bold text-on-surface">+1</span> Resolved Report or Manual Training (max +5/ea)<br/>
                   <span className="font-bold text-on-surface">+5</span> Weathering Spam Raids
                 </p>
             </div>
             <div className="pt-4 border-t border-outline-variant/20">
                 <strong className="text-sm text-on-surface flex items-center gap-2 mb-2">📉 Penalty Deductions</strong>
                 <p className="text-xs text-text-secondary leading-relaxed">
                   <span className="font-bold text-warning">Dynamic</span> High Flag Rate (&gt;5%)<br/>
                   <span className="font-bold text-on-surface">-5</span> Extreme (Bans/Timeouts)<br/>
                   <span className="font-bold text-on-surface">-3</span> High (Toxic)<br/>
                   <span className="font-bold text-on-surface">-1</span> Low (Spam)
                 </p>
             </div>
          </div>
        </div>
      </div>

      {/* Settings Row 1: Public Health Widget */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-4 bg-primary/5 border border-primary/20 rounded-3xl p-8 shadow-sm flex flex-col justify-center">
            <div className="text-primary text-4xl mb-6 mt-0.5">📊</div>
            <strong className="text-on-surface font-black tracking-tight text-xl block mb-3">Live Health Widget</strong>
            <p className="text-text-secondary text-sm leading-relaxed">
              Display the current health score, active streaks, and community status directly in a public Discord channel.
              <br/><br/>
              The widget is pinned to the bottom of the selected channel and updates automatically as SentinL evaluates the community sentiment behind the scenes.
            </p>
        </div>

        <div className="xl:col-span-8 bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-8">
              <div className="flex flex-col">
                 <label className="text-sm font-black uppercase text-on-surface tracking-widest">
                   Public Health Widget
                 </label>
                 <span className="text-xs text-text-secondary mt-1">Enable live widget updates</span>
              </div>
              <button
                type="button"
                onClick={() => toggleWidgetSetting("enabled", !widgetSettings.enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ease-out focus:outline-none ${
                    widgetSettings.enabled ? "bg-orange-500" : "bg-surface-variant"
                }`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-out ${
                    widgetSettings.enabled ? "translate-x-2.5" : "-translate-x-2.5"
                }`} />
              </button>
          </div>

          <div className="space-y-8">
            <div>
              <label className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 block">
                Target Channel
              </label>
              <ChannelSelector
                channels={channels}
                value={widgetSettings.channelId}
                onChange={(val) => setWidgetSettings(prev => ({ ...prev, channelId: val }))}
                placeholder="Select a channel"
              />
            </div>
            
            <div className="pt-8 border-t border-outline-variant/20 relative mt-8">
               <ProGate isPro={isPro} featureName="Aesthetic Customization" featureDescription="Customize the look and feel of the Health Widget on Pro or Premium" className="w-full relative block">
               <div className={`space-y-6`}>
                  <h3 className="text-xs font-black uppercase tracking-widest text-on-surface flex items-center gap-2">
                     Aesthetic Customization
                  </h3>
                  
                  <div className="flex flex-col gap-8 items-stretch w-full">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                         <div className="w-full">
                           <label className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 block">
                             Embed Accent Color
                           </label>
                           <div className="flex gap-2 items-center">
                              <input
                                type="color"
                                value={widgetSettings.color || "#4ade80"}
                                onChange={(e) => setWidgetSettings(prev => ({ ...prev, color: e.target.value }))}
                                className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0 shrink-0"
                              />
                              <input
                                type="text"
                                value={widgetSettings.color}
                                onChange={(e) => setWidgetSettings(prev => ({ ...prev, color: e.target.value }))}
                                placeholder="#00FF00"
                                className="w-full bg-white/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary/50 transition-all shadow-inner font-mono"
                              />
                           </div>
                         </div>
    
                         <div className="w-full">
                           <label className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 block">
                             Community Motto (Footer)
                           </label>
                           <textarea
                             value={widgetSettings.motto}
                             onChange={(e) => setWidgetSettings(prev => ({ ...prev, motto: e.target.value }))}
                             placeholder="e.g. Committed to a safe, welcoming environment."
                             className="w-full bg-white/50 border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:outline-none focus:border-primary/50 transition-all shadow-inner resize-none h-10 min-h-[46px]"
                           />
                         </div>
                     </div>

                     {/* Discord Embed Preview */}
                     <div className="bg-[#313338] rounded-2xl p-6 md:p-10 shadow-inner font-sans text-[#dbdee1] flex flex-col pointer-events-none select-none items-center justify-center relative overflow-hidden border border-white/5 w-full">
                        <div className="absolute top-4 left-6 hidden md:block">
                            <span className="text-[10px] font-black tracking-widest uppercase text-white/30">Live Preview</span>
                        </div>
                        <div className="flex bg-[#2b2d31] rounded-lg max-w-sm w-full overflow-hidden border-l-4 shadow-2xl relative z-10 hover:scale-105 transition-transform duration-500 ease-out" style={{ borderColor: widgetSettings.color || "#4ade80" }}>
                           <div className="p-4 w-full">
                               <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 bg-[#1e1f22] rounded-full flex items-center justify-center p-1">
                                      <img src="/logo.png" alt="SentinL" className="w-full h-full object-contain grayscale opacity-70" />
                                  </div>
                                  <span className="font-bold text-sm text-white tracking-wide">Community Health: A+ (Safe Haven)</span>
                               </div>
                               <div className="text-[14px] leading-relaxed mb-4 whitespace-pre-wrap text-[#dbdee1]/90">
                                  This server actively monitors and filters toxic behavior.{"\n\n"}
                                  <span className="font-bold text-white">Health Score:</span> 98%{"\n"}
                                  <span className="font-bold text-white">A-Rank Streak:</span> {widgetSettings.streakDays} days{"\n"}
                                  <span className="font-bold text-white">Peaceful Days:</span> {widgetSettings.peacefulStreakDays || 0} days{"\n"}
                                  <span className="font-bold text-white">Total Peaceful Days:</span> {widgetSettings.totalPeacefulDays || 0}
                               </div>
                               <div className="text-[11px] font-medium text-[#949ba4] flex items-center gap-1.5 mt-2 pt-3 border-t border-[#3f4147]">
                                  <img src="/logo.png" alt="SentinL" className="w-4 h-4 object-contain rounded-full grayscale opacity-50" />
                                  <span>
                                    {String(widgetSettings.motto || "Analyzed and Protected by SentinL.app").split(/(SentinL)/gi).map((part, i) =>
                                      part.toLowerCase() === "sentinl" ? (
                                        <span key={i} className="text-primary font-bold">{part}</span>
                                      ) : (
                                        part
                                      )
                                    )}
                                  </span>
                                  <span className="w-1 h-1 rounded-full bg-[#4e5058] mx-0.5"></span>
                                  <span>Today at 12:00 PM</span>
                               </div>
                           </div>
                        </div>
                        {/* Decorative Background Element */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: `radial-gradient(circle at center, ${widgetSettings.color || "#4ade80"} 0%, transparent 60%)`}}></div>
                     </div>
                  </div>
                </div>
               </ProGate>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Row 2: Milestone Events */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-6 lg:p-8">
            <div className="flex items-start gap-4 mb-4">
                <div className="text-primary text-3xl mt-0.5 drop-shadow-sm">🏆</div>
                <div>
                    <strong className="text-on-surface font-black tracking-tight text-xl block mb-2">Evolving Community Rewards</strong>
                    <p className="text-text-secondary text-sm leading-relaxed">
                        When hitting milestones, SentinL automatically creates two sets of custom reward roles:
                        <br/><br/>
                        <strong>1. Staff Badge:</strong> A primary SentinL role given to the Server Owner to hand out to moderators as badges of honor.
                        <br/>
                        <strong>2. Community Badge:</strong> A matching "Peacekeeper" version that active members who helped achieve the streak can claim directly from the milestone announcement.
                    </p>
                </div>
            </div>
            
            <h5 className="text-xs font-bold text-on-surface mt-8 mb-3">Staff Badges (Owner & Moderators)</h5>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#f5d0b5] to-[#cd7f32]/40 shadow-inner border border-[#cd7f32]/20">
                        <Logo className="w-5 h-5 flex-shrink-0" stroke="#8b4513" fill="#cd7f32" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Bronze<br/><span className="text-[8px] text-text-secondary font-bold">SentinL<br/>30 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#f1f5f9] to-[#cbd5e1]/40 shadow-inner border border-[#cbd5e1]/20">
                        <Logo className="w-5 h-5 flex-shrink-0" stroke="#475569" fill="#e2e8f0" faceColor="#475569" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Silver<br/><span className="text-[8px] text-text-secondary font-bold">SentinL<br/>60 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#fef08a] to-[#eab308]/40 shadow-inner border border-[#eab308]/20">
                        <Logo className="w-5 h-5 flex-shrink-0" stroke="#a16207" fill="#facc15" faceColor="#a16207" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Gold<br/><span className="text-[8px] text-text-secondary font-bold">SentinL<br/>90 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#ffffff] to-[#e2e8f0]/60 shadow-inner border border-[#94a3b8]/30">
                        <Logo className="w-5 h-5 flex-shrink-0" stroke="#334155" fill="#f8fafc" faceColor="#334155" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Plat<br/><span className="text-[8px] text-text-secondary font-bold">SentinL<br/>180 Days</span></span>
                </div>
                <div className="bg-primary/5 border border-primary/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-md text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-cyan-300/10 via-blue-400/10 to-purple-400/10 animate-pulse"></div>
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#cffafe] to-[#06b6d4]/40 shadow-inner border border-[#06b6d4]/40 relative z-10">
                        <Logo className="w-5 h-5 filter drop-shadow-md flex-shrink-0" stroke="#0891b2" fill="#a5f3fc" faceColor="#0891b2" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#0891b2] leading-tight relative z-10">Diamond<br/><span className="text-[8px] text-primary/70 font-bold">SentinL<br/>365 Days</span></span>
                </div>
            </div>

            <h5 className="text-xs font-bold text-on-surface mt-6 mb-3">Community Badges (Active Members)</h5>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5">
                        <Logo className="w-5 h-5 drop-shadow-sm opacity-90 flex-shrink-0" stroke="#8b4513" fill="#cd7f32" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Bronze<br/><span className="text-[8px] text-text-secondary font-bold">Peacekeeper<br/>30 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5">
                        <Logo className="w-5 h-5 drop-shadow-sm opacity-90 flex-shrink-0" stroke="#475569" fill="#e2e8f0" faceColor="#475569" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Silver<br/><span className="text-[8px] text-text-secondary font-bold">Peacekeeper<br/>60 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5">
                        <Logo className="w-5 h-5 drop-shadow-sm opacity-90 flex-shrink-0" stroke="#a16207" fill="#facc15" faceColor="#a16207" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Gold<br/><span className="text-[8px] text-text-secondary font-bold">Peacekeeper<br/>90 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center">
                    <div className="p-2.5">
                        <Logo className="w-5 h-5 drop-shadow-sm opacity-90 flex-shrink-0" stroke="#334155" fill="#f8fafc" faceColor="#334155" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-on-surface leading-tight">Plat<br/><span className="text-[8px] text-text-secondary font-bold">Peacekeeper<br/>180 Days</span></span>
                </div>
                <div className="bg-surface border border-outline-variant/30 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 shadow-sm text-center border-t-2 border-t-cyan-400 bg-gradient-to-b from-cyan-400/5 to-transparent">
                    <div className="p-2.5">
                        <Logo className="w-5 h-5 drop-shadow-md flex-shrink-0" stroke="#0891b2" fill="#a5f3fc" faceColor="#0891b2" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#0891b2] leading-tight">Diamond<br/><span className="text-[8px] text-[#0891b2]/70 font-bold">Peacekeeper<br/>365 Days</span></span>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-primary/10">
              <strong className="text-xs font-black uppercase tracking-widest text-on-surface block mb-4">Profile Badge Context Examples</strong>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Staff Example */}
                  <div className="w-full bg-[#2b2d31] rounded-2xl overflow-hidden font-sans border border-[#1e1f22] shadow-xl">
                      <div className="h-10 bg-[#5c64f4]"></div>
                      <div className="px-4 pb-4">
                          <div className="flex justify-between items-start">
                              <div className="w-12 h-12 rounded-full border-[4px] border-[#2b2d31] bg-[#1e1f22] -mt-6 flex items-center justify-center relative">
                                   <Logo className="text-primary w-7 h-7" fill="currentColor" stroke="currentColor" />
                                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-[2px] border-[#2b2d31]"></div>
                              </div>
                              <div className="mt-2 flex gap-1 bg-[#111214] p-1 rounded-lg border border-white/5">
                                  <div title="Diamond SentinL" className="flex items-center justify-center w-5 h-5 bg-gradient-to-tr from-[#cffafe] to-[#22d3ee] rounded shadow-inner border border-cyan-400/30">
                                      <Logo className="w-3 h-3 filter drop-shadow-md" stroke="#0891b2" fill="#fff" />
                                  </div>
                                  <div className="w-5 h-5 rounded bg-[#232428] flex items-center justify-center">
                                      <span className="text-[#b5bac1] text-[9px]">👑</span>
                                  </div>
                              </div>
                          </div>
                          <div className="mt-2 text-left">
                              <div className="text-white font-bold text-sm leading-tight flex items-center gap-2">
                                  Server Owner 
                                  <span className="bg-[#232428] text-[#dbdee1] text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">Staff</span>
                              </div>
                              <div className="text-[#b5bac1] text-[9px]">@serverowner</div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-[#3f4147] text-left">
                              <strong className="text-[#b5bac1] text-[8px] font-extrabold uppercase tracking-wide block mb-1.5">Roles</strong>
                              <div className="flex flex-wrap gap-1">
                                 <div className="flex items-center gap-1 bg-[#232428] rounded pl-1 pr-1.5 py-0.5 border border-[#232428]">
                                     <div className="w-2 h-2 rounded-full bg-[#22d3ee]"></div>
                                     <span className="text-[#dbdee1] text-[9px] font-semibold">Diamond SentinL</span>
                                 </div>
                                 <div className="flex items-center gap-1 bg-[#232428] rounded pl-1 pr-1.5 py-0.5 border border-[#232428]">
                                     <div className="w-2 h-2 rounded-full bg-[#5c64f4]"></div>
                                     <span className="text-[#dbdee1] text-[9px] font-semibold">Owner</span>
                                 </div>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Community Example */}
                  <div className="w-full bg-[#2b2d31] rounded-2xl overflow-hidden font-sans border border-[#1e1f22] shadow-xl">
                      <div className="h-10 bg-[#23a55a]"></div>
                      <div className="px-4 pb-4">
                          <div className="flex justify-between items-start">
                              <div className="w-12 h-12 rounded-full border-[4px] border-[#2b2d31] bg-[#1e1f22] -mt-6 flex items-center justify-center relative">
                                   <div className="w-full h-full rounded-full bg-gradient-to-br from-[#23a55a] to-[#1a7f44] flex flex-col items-center justify-center text-white font-bold">
                                      <span className="text-lg leading-none -mt-0.5">👾</span>
                                   </div>
                                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-[2px] border-[#2b2d31]"></div>
                              </div>
                          </div>
                          <div className="mt-2 text-left">
                              <div className="text-white font-bold text-sm leading-tight flex items-center gap-2">
                                  Active Member
                                  <span className="bg-[#23a55a]/20 text-[#23a55a] text-[8px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider border border-[#23a55a]/30">Community</span>
                              </div>
                              <div className="text-[#b5bac1] text-[9px]">@loyal_fan</div>
                          </div>
                          <div className="mt-2 pt-2 border-t border-[#3f4147] text-left">
                              <strong className="text-[#b5bac1] text-[8px] font-extrabold uppercase tracking-wide block mb-1.5">Roles</strong>
                              <div className="flex flex-wrap gap-1">
                                 <div className="flex items-center gap-1 bg-[#232428] rounded pl-1 pr-1.5 py-0.5 border border-[#232428]">
                                     <div className="w-2 h-2 rounded-full bg-[#22d3ee]"></div>
                                     <span className="text-[#dbdee1] text-[9px] font-semibold">💎 Diamond Peacekeeper</span>
                                 </div>
                                 <div className="flex items-center gap-1 bg-[#232428] rounded pl-1 pr-1.5 py-0.5 border border-[#232428]">
                                     <div className="w-2 h-2 rounded-full bg-[#80848e]"></div>
                                     <span className="text-[#dbdee1] text-[9px] font-semibold">Member</span>
                                 </div>
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
            </div>
        </div>

        <div className="xl:col-span-5 bg-surface-container/50 border border-outline-variant/30 rounded-3xl p-6 lg:p-8 relative flex flex-col">
          <ProGate isPro={isPro} featureName="Milestone Events" featureDescription="Announce when your community holds an A-grade" className="relative block w-full flex-grow">
             <div className="space-y-6 flex flex-col flex-grow w-full h-full">
               {/* Milestone Option Component */}
               <div className="flex items-center justify-between">
               <div className="flex flex-col">
                  <h4 className="text-sm font-black uppercase tracking-widest text-on-surface">Milestone Events</h4>
                  <span className="text-xs text-text-secondary mt-1">Announce when your community holds an A-grade</span>
               </div>
               <button
                 type="button"
                 onClick={() => toggleWidgetSetting("announceMilestones", !widgetSettings.announceMilestones)}
                 className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ease-out focus:outline-none ${
                     widgetSettings.announceMilestones ? "bg-orange-500" : "bg-surface-variant"
                 }`}
               >
                 <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-out ${
                     widgetSettings.announceMilestones ? "translate-x-2.5" : "-translate-x-2.5"
                 }`} />
               </button>
             </div>

             {widgetSettings.announceMilestones && (
               <div className="p-4 bg-white/5 border border-outline-variant/30 rounded-2xl space-y-4 animate-in fade-in duration-300">
                 <div>
                    <label className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 block">
                      Milestone Channel
                    </label>
                    <ChannelSelector
                      channels={channels}
                      value={widgetSettings.milestoneChannelId}
                      onChange={(val) => setWidgetSettings(prev => ({ ...prev, milestoneChannelId: val }))}
                      placeholder="Same as Public Widget Channel"
                    />
                 </div>
                 <div>
                    <label className="text-[10px] font-black uppercase text-text-secondary mb-2 tracking-widest ml-1 block">
                      Custom Message
                    </label>
                    <textarea
                      value={widgetSettings.milestoneMessage}
                      onChange={(e) => setWidgetSettings(prev => ({ ...prev, milestoneMessage: e.target.value }))}
                      placeholder="e.g. 🎉 We've maintained safety for {days} days!"
                      className="w-full bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-2 text-xs text-on-surface focus:outline-none focus:border-primary/50 transition-all resize-none shadow-inner h-12"
                    />
                 </div>
               </div>
             )}

             <div className="flex items-center justify-between pt-6 border-t border-outline-variant/30">
               <div className="flex flex-col">
                  <h4 className="text-sm font-black uppercase tracking-widest text-on-surface">Streak Recovery</h4>
                  <span className="text-xs text-text-secondary mt-1 max-w-[200px] leading-tight">Send a sympathetic, motivational message if the server drops an established long streak.</span>
               </div>
               <button
                 type="button"
                 onClick={() => toggleWidgetSetting("recoveryMessages", !widgetSettings.recoveryMessages)}
                 className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ease-out focus:outline-none ${
                     widgetSettings.recoveryMessages ? "bg-orange-500" : "bg-surface-variant"
                 }`}
               >
                 <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-out ${
                     widgetSettings.recoveryMessages ? "translate-x-2.5" : "-translate-x-2.5"
                 }`} />
               </button>
             </div>

             <div className="flex items-center justify-between pt-6 border-t border-outline-variant/30">
               <div className="flex flex-col">
                  <h4 className="text-sm font-black uppercase tracking-widest text-on-surface">Community Rewards</h4>
                  <span className="text-xs text-text-secondary mt-1 max-w-[200px] leading-tight">Reward active members with matching roles when hitting milestones.</span>
               </div>
               <button
                 type="button"
                 onClick={() => toggleWidgetSetting("communityRewards", !widgetSettings.communityRewards)}
                 className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-300 ease-out focus:outline-none ${
                     widgetSettings.communityRewards ? "bg-orange-500" : "bg-surface-variant"
                 }`}
               >
                 <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-out ${
                     widgetSettings.communityRewards ? "translate-x-2.5" : "-translate-x-2.5"
                 }`} />
               </button>
             </div>
            </div>
          </ProGate>
        </div>
      </div>
    </div>
  );
}

// force cache clear
