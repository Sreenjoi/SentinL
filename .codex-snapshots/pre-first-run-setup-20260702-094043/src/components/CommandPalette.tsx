import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useServer } from "../context/ServerContext";
import {
  Search,
  Settings,
  Trophy,
  Link as LinkIcon,
  BarChart3,
  CreditCard,
  User,
  ListChecks,
  Command,
  Shield,
  MessageSquareWarning,
  Activity,
  Youtube,
  Twitch,
  Star,
  Bot,
  LayoutDashboard,
  Gavel,
  ShieldAlert
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Logo } from "./Logo";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { isPro } = useServer();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const items = [
    { title: "Dashboard Overview", breadcrumbs: "Dashboard", path: "/dashboard", icon: LayoutDashboard, description: "Main dashboard view" },
    { title: "Mod Queue", breadcrumbs: "Moderation > Mod Queue", path: "/moderation#queue", icon: ListChecks, description: "Review and approve/deny actions" },
    { title: "User Reports", breadcrumbs: "Moderation > Reports", path: "/moderation#reports", icon: MessageSquareWarning, description: "User-generated reports and tickets" },
    { title: "Appeals", breadcrumbs: "Moderation > Appeals", path: "/moderation#appeals", icon: Gavel, description: "Review and respond to server appeals" },
    { title: "Repeat Offenders", breadcrumbs: "Moderation > Offenders", path: "/moderation#offenders", icon: User, description: "User infractions and history" },
    { title: "AI Analysis Limits", breadcrumbs: "Moderation > Settings > AI Analysis limits", path: "/moderation#settings", icon: Shield, description: "Confidence threshold and auto-delete settings" },
    { title: "Use Relevant Context", breadcrumbs: "Moderation > Settings > Use Context", path: "/moderation#settings", icon: Shield, description: "Enable dynamic context (replies, mentions) in AI Moderation" },

    { title: "General Settings", breadcrumbs: "Settings > General", path: "/settings#general", icon: Settings, description: "Language, Moderator Role & Log Channel ID" },
    
    { title: "Community DNA", breadcrumbs: "Settings > Community DNA", path: "/settings#dna", icon: Logo, description: "Configure SentinL's personality and active rules" },
    { title: "Custom Rules", breadcrumbs: "Settings > Community DNA > Rules", path: "/settings#dna", icon: Logo, description: "Define custom moderation rules" },
    { title: "Community DNA Suggestions", breadcrumbs: "Settings > Community DNA > Suggestions", path: "/settings#dna", icon: Logo, description: "AI Recommended rules and standard baseline policies", locked: !isPro },
    { title: "Keyword Pre-Filter", breadcrumbs: "Settings > Community DNA > Keyword matches", path: "/settings#dna", icon: Shield, description: "Auto-delete matched keywords" },

    { title: "Core Commands", breadcrumbs: "Settings > Core Commands", path: "/settings#commands", icon: Command, description: "Enable/Disable core sentinL commands" },
    
    { title: "Roles & Onboarding", breadcrumbs: "Settings > Roles", path: "/settings#onboarding", icon: Shield, description: "Auto-Assign on Join & Reaction Roles Manager" },
    { title: "Auto-Assign on Join", breadcrumbs: "Settings > Roles > Auto-Assign", path: "/settings#onboarding", icon: Shield, description: "Automatically give members a default role when they join the server." },
    { title: "Reaction Roles Manager", breadcrumbs: "Settings > Roles > Reaction Roles", path: "/settings#onboarding", icon: Shield, description: "Allow users to self-assign roles by reacting to messages" },

    { title: "Custom Commands", breadcrumbs: "Settings > Custom Commands", path: "/settings#custom_commands", icon: Command, description: "Create specific bot commands", locked: !isPro },

    { title: "Commands Guide", breadcrumbs: "Resources > Commands Guide", path: "/commands-guide", icon: Command, description: "Documentation and guide for all SentinL commands", locked: false },

    { title: "Leveling & XP", breadcrumbs: "Community > Leveling & XP", path: "/leveling", icon: Star, description: "Manage member leveling", locked: !isPro },
    { title: "Giveaways Manager", breadcrumbs: "Community > Giveaways Manager", path: "/leveling#giveaways", icon: Trophy, description: "Launch and manage server giveaways", locked: !isPro },

    { title: "XP Management", breadcrumbs: "Leveling & XP", path: "/leveling", icon: Trophy, description: "Configure experience gains", locked: !isPro },
    { title: "Rank Roles", breadcrumbs: "Leveling & XP > Rank Rewards", path: "/leveling", icon: Trophy, description: "Give roles for leveling up", locked: !isPro },

    { title: "YouTube Listener", breadcrumbs: "Integrations > YouTube", path: "/integrations#youtube", icon: Youtube, description: "New video alerts", locked: !isPro },
    { title: "Twitch Listener", breadcrumbs: "Integrations > Twitch", path: "/integrations#twitch", icon: Twitch, description: "Live stream alerts", locked: !isPro },

    { title: "Analytics Overview", breadcrumbs: "Analytics", path: "/analytics", icon: BarChart3, description: "Message volume and engagement", locked: !isPro },
    { title: "AI Training Feedback", breadcrumbs: "Analytics > Training Feedback", path: "/analytics#training", icon: Bot, description: "Help improve AI moderation models", locked: !isPro },
    { title: "Weekly Digest", breadcrumbs: "Analytics > Weekly Digest", path: "/analytics#digest", icon: BarChart3, description: "Automated weekly health reports", locked: !isPro },
    { title: "Community Health", breadcrumbs: "Moderation > Community Health", path: "/moderation#health", icon: Activity, description: "Monitor community safety metrics and trends", locked: !isPro },
    { title: "Admin Feedback", breadcrumbs: "Resources > Admin Feedback", path: "/admin/feedback", icon: ShieldAlert, description: "Provide direct feedback and bug reports to the team", locked: false },

    { title: "Connect Page", breadcrumbs: "Discord > Connect", path: "/connect", icon: LinkIcon, description: "Connect to Discord to view your servers", locked: false },
    { title: "Subscription Tiers", breadcrumbs: "Pricing & Upgrades", path: "/pricing", icon: CreditCard, description: "View PRO options", locked: false },
    { title: "Billing Profile", breadcrumbs: "My Profile", path: "/profile", icon: User, description: "Manage billing and accounts", locked: false },
    { title: "Privacy Policy", breadcrumbs: "Resources > Privacy Policy", path: "/privacy", icon: Shield, description: "View our privacy policy", locked: false },
    { title: "Terms of Service", breadcrumbs: "Resources > Terms of Service", path: "/terms", icon: Shield, description: "View our terms of service", locked: false },
  ];

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || (item.breadcrumbs?.toLowerCase().includes(q));
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % filteredItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        navigate(filteredItems[selectedIndex].path);
        setOpen(false);
        setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <React.Fragment>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 z-[100] w-full max-w-sm sm:max-w-md bg-surface shadow-2xl overflow-hidden pointer-events-auto border-r border-outline-variant/30 flex flex-col"
          >
            <div className="w-full h-full flex flex-col">
              {/* Search Input */}
              <div className="flex items-center px-4 border-b border-outline-variant/30 text-on-surface">
                <Search className="w-5 h-5 opacity-50 shrink-0" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="What do you need?"
                  className="flex-1 bg-transparent border-none outline-none py-5 px-3 text-sm placeholder:text-text-secondary/60 focus:!ring-0 focus:!border-none focus:!outline-none"
                  style={{ boxShadow: 'none', borderColor: 'transparent' }}
                />
                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-text-secondary/60">
                  <span className="px-1.5 py-1 bg-surface-variant rounded">ESC</span>
                </div>
              </div>

              {/* Results */}
              <div className="flex-1 overflow-y-auto min-h-0 p-2 custom-scrollbar">
                {filteredItems.length === 0 ? (
                  <div className="py-14 text-center text-text-secondary text-sm">
                    No results found for "{search}"
                  </div>
                ) : (
                  filteredItems.map((item, index) => {
                    const Icon = item.icon;
                    const selected = index === selectedIndex;
                    return (
                      <div
                        key={index}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          navigate(item.path);
                          setOpen(false);
                          setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                          selected ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-surface-variant/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selected ? "bg-primary/20 text-primary" : "bg-surface-variant/50 text-text-secondary"}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex flex-col">
                            {item.breadcrumbs && (
                                <span className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${selected ? "text-primary/60" : "text-text-secondary/60"}`}>
                                    {item.breadcrumbs}
                                </span>
                            )}
                            <span className="text-sm font-semibold tracking-tight">{item.title}</span>
                            <span className={`text-[11px] font-medium leading-tight ${selected ? "text-primary/70" : "text-text-secondary"}`}>
                              {item.description}
                            </span>
                          </div>
                        </div>
                        {item.locked && (
                          <div className="px-2 py-0.5 bg-outline-variant/30 text-[9px] font-black uppercase tracking-widest rounded-md shrink-0 text-text-secondary">
                            Pro
                          </div>
                        )}
                        {selected && !item.locked && (
                          <div className="text-[9px] font-bold uppercase tracking-wider text-primary/60 shrink-0">
                            Enter ↵
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </React.Fragment>
      )}
    </AnimatePresence>
  );
}
