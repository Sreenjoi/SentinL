import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ProGateProps {
  children: React.ReactNode;
  featureName: string;           
  featureDescription: string;    
  isPro: boolean;
  placement?: "top" | "bottom" | "right" | "left"; 
  className?: string;            
}

const OUTCOME_COPY: Record<string, { does: string; solves: string }> = {
  "Auto-Delete": {
    does: "Automatically removes the highest-risk messages once SentinL is confident.",
    solves: "Keeps obvious abuse from sitting in chat while moderators are away.",
  },
  "Context Awareness": {
    does: "Lets SentinL read nearby conversation before deciding.",
    solves: "Reduces wrong calls in arguments, sarcasm, banter, and messy back-and-forth chats.",
  },
  "Dual-Model Escalation": {
    does: "Re-checks uncertain cases with a stronger AI pass.",
    solves: "Catches subtle violations without forcing every normal message through the expensive path.",
  },
  "Extra Review": {
    does: "Re-checks uncertain cases before SentinL makes a final call.",
    solves: "Catches subtle violations while avoiding unnecessary checks on normal chat.",
  },
  "Manual AI Training": {
    does: "Lets moderators correct SentinL directly from the review flow.",
    solves: "Teaches the system your server's tone so future decisions fit your community better.",
  },
  "Custom Commands": {
    does: "Turns repeated moderation or community actions into custom slash commands.",
    solves: "Saves staff time and makes common server workflows consistent.",
  },
  "Social Integrations": {
    does: "Posts YouTube and Twitch alerts into the right channels automatically.",
    solves: "Keeps creator/community updates visible without manual announcements.",
  },
  "XP Configuration": {
    does: "Lets you tune XP rates, cooldowns, and progression rules.",
    solves: "Prevents leveling from rewarding spam or ignoring the behavior you actually value.",
  },
  "XP Rules": {
    does: "Lets you choose how members earn XP and level up.",
    solves: "Keeps leveling aligned with the kind of participation you want.",
  },
  "Role Rewards": {
    does: "Assigns roles automatically when members reach milestones.",
    solves: "Makes participation feel rewarding without extra moderator work.",
  },
  "Server Leaderboard": {
    does: "Shows which members are most active in your community.",
    solves: "Helps you spot engaged members and understand who drives activity.",
  },
  "List of Repeat Offenders": {
    does: "Surfaces users with repeated moderation problems.",
    solves: "Helps moderators see patterns instead of treating every incident as isolated.",
  },
  "Visual Analytics": {
    does: "Turns moderation and community activity into charts.",
    solves: "Makes trends easier to understand than scanning raw logs.",
  },
  "Time Period": {
    does: "Lets you compare activity across custom date ranges.",
    solves: "Shows whether your server is improving, declining, or reacting to specific events.",
  },
  "Manual Refresh": {
    does: "Refreshes deeper analytics when you need the newest numbers.",
    solves: "Helps you verify changes after events, raids, or moderation pushes.",
  },
  "Message Stats": {
    does: "Shows fuller message-volume telemetry.",
    solves: "Helps you understand when your community is active or going quiet.",
  },
  "Community Density": {
    does: "Shows how concentrated or spread out server activity is.",
    solves: "Helps you spot whether the community is healthy or carried by only a few channels.",
  },
  "Resolved Threats": {
    does: "Shows moderation outcomes over time.",
    solves: "Helps prove SentinL is reducing manual cleanup instead of just creating alerts.",
  },
  "Density Evolution": {
    does: "Tracks how participation changes over time.",
    solves: "Helps owners see whether community activity is broadening or shrinking.",
  },
  "Moderation Trends": {
    does: "Shows patterns in flagged messages and moderation actions.",
    solves: "Helps you tune rules before small issues become normal behavior.",
  },
  "Peak Hours": {
    does: "Shows when the server is most active.",
    solves: "Helps schedule staff coverage, events, and announcements at better times.",
  },
  "Weekly Digest": {
    does: "Sends a scheduled summary of server health and moderation activity.",
    solves: "Keeps owners informed without opening the dashboard every day.",
  },
  "Save Target Channel": {
    does: "Sends automated reports to the channel your staff already watches.",
    solves: "Keeps updates visible instead of buried inside dashboard settings.",
  },
  "Save Digest Channel": {
    does: "Sends weekly summaries to the channel your staff already watches.",
    solves: "Keeps owners and moderators informed without checking the dashboard every day.",
  },
  "Export Report": {
    does: "Exports dashboard insights into a shareable report.",
    solves: "Makes it easier to brief staff, owners, or community leads.",
  },
  "Heuristic Analytics": {
    does: "Shows how correction history is shaping moderation behavior.",
    solves: "Helps you understand whether SentinL is learning in the right direction.",
  },
  "Training Insights": {
    does: "Shows what moderator corrections are teaching SentinL.",
    solves: "Helps you check whether SentinL is learning the right lessons.",
  },
  "Full Training Log": {
    does: "Shows the full history of moderator corrections.",
    solves: "Gives staff transparency into why future moderation decisions may change.",
  },
  "Giveaways": {
    does: "Runs server giveaways from inside SentinL.",
    solves: "Adds engagement without juggling another bot.",
  },
  "Aesthetic Customization": {
    does: "Lets you match the health widget to your server style.",
    solves: "Makes public-facing status feel intentional instead of generic.",
  },
  "Milestone Events": {
    does: "Announces when your community hits important health milestones.",
    solves: "Turns good moderation and activity into visible community momentum.",
  },
  "Exclusions": {
    does: "Excludes selected channels or roles from XP.",
    solves: "Stops bots, staff chatter, or spam channels from skewing progression.",
  },
  "Reset XP": {
    does: "Resets leveling data when you need a fresh start.",
    solves: "Helps recover from bad settings, test data, or a new season.",
  },
  "XP Settings": {
    does: "Lets you tune XP behavior from the settings flow.",
    solves: "Keeps leveling aligned with the kind of participation you want.",
  },
  "Unlimited Reaction Roles": {
    does: "Removes the free-tier cap on reaction role panels.",
    solves: "Lets larger communities organize roles without hitting setup limits.",
  },
};

const getOutcomeCopy = (featureName: string, featureDescription: string) => {
  const mapped = OUTCOME_COPY[featureName];
  if (mapped) return mapped;
  return {
    does: featureDescription,
    solves: "Saves moderator time and gives your server more control as it grows.",
  };
};

const POPUP_GAP = 12;
const VIEWPORT_PADDING = 16;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getClickAnchoredPosition = (clientX: number, clientY: number, width = 288, height = 330) => {
  if (typeof window === "undefined") {
    return { left: clientX, top: clientY };
  }

  const safeWidth = Math.min(width, Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2));
  const safeHeight = Math.min(height, Math.max(0, window.innerHeight - VIEWPORT_PADDING * 2));
  const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - safeWidth - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - safeHeight - VIEWPORT_PADDING);
  const opensRight = clientX + POPUP_GAP + safeWidth + VIEWPORT_PADDING <= window.innerWidth;
  const opensDown = clientY + POPUP_GAP + safeHeight + VIEWPORT_PADDING <= window.innerHeight;
  const preferredLeft = opensRight ? clientX + POPUP_GAP : clientX - safeWidth - POPUP_GAP;
  const preferredTop = opensDown ? clientY + POPUP_GAP : clientY - safeHeight - POPUP_GAP;

  return {
    left: clamp(preferredLeft, VIEWPORT_PADDING, maxLeft),
    top: clamp(preferredTop, VIEWPORT_PADDING, maxTop),
  };
};

export function ProGate({ children, featureName, featureDescription, isPro, placement = "top", className = "relative inline-block w-fit" }: ProGateProps) {
  const [open, setOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ left: VIEWPORT_PADDING, top: VIEWPORT_PADDING });
  const [anchorPoint, setAnchorPoint] = useState({ x: VIEWPORT_PADDING, y: VIEWPORT_PADDING });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const outcomeCopy = getOutcomeCopy(featureName, featureDescription);
  void placement;

  const openAtPoint = (clientX: number, clientY: number) => {
    const nextAnchor = { x: clientX, y: clientY };
    setAnchorPoint(nextAnchor);
    setPopupPosition(getClickAnchoredPosition(clientX, clientY));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    setPopupPosition(getClickAnchoredPosition(anchorPoint.x, anchorPoint.y, rect.width, rect.height));
  }, [anchorPoint.x, anchorPoint.y, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popupRef.current?.contains(target) || rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const handleResize = () => {
      if (!popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      setPopupPosition(getClickAnchoredPosition(anchorPoint.x, anchorPoint.y, rect.width, rect.height));
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [anchorPoint.x, anchorPoint.y, open]);

  if (isPro) return <>{children}</>;

  return (
    <>
      <div
        ref={rootRef}
        className={`relative ${className || ""}`}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={(e) => {
          openAtPoint(e.clientX, e.clientY);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          openAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}
      >
        <div className="pointer-events-none select-none opacity-40 grayscale transition-all duration-300">
          {children}
        </div>
        <div className="absolute inset-0 z-10 rounded-[inherit] cursor-pointer" />
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popupRef}
                role="dialog"
                aria-label={`${featureName} Pro feature`}
                initial={{ opacity: 0, scale: 0.95, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="fixed z-[9999] max-h-[calc(100vh-32px)] w-72 max-w-[calc(100vw-32px)] overflow-y-auto rounded-2xl border border-primary/20 bg-surface-container-high/95 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl outline-none focus:outline-none focus-visible:outline-none origin-top-left"
                style={{
                  left: popupPosition.left,
                  top: popupPosition.top,
                }}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Lock className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                      Pro Feature
                    </span>
                  </div>
                  <Sparkles className="h-4 w-4 text-primary/40" />
                </div>
                
                <h4 className="mb-1 text-base font-bold tracking-tight text-on-surface">
                  {featureName}
                </h4>
                <div className="mb-4 space-y-3 text-xs font-medium text-text-secondary leading-relaxed">
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary/80">
                      What it does
                    </p>
                    <p>{outcomeCopy.does}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-primary/80">
                      Why it helps
                    </p>
                    <p>{outcomeCopy.solves}</p>
                  </div>
                </div>
                
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  className="w-full"
                >
                  <Link
                    to="/pricing"
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-primary/90 active:scale-95 cursor-pointer shadow-lg shadow-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-high"
                  >
                    Unlock this with Pro
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
