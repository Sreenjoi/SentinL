import React, { useState } from "react";
import {
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Users as UsersIcon,
  Settings as SettingsIcon,
  Shield,
  Trophy,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useServer } from "../context/ServerContext";

interface CommandOption {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface Command {
  name: string;
  description: string;
  options: CommandOption[];
  example: string;
  permission?: "everyone" | "moderator" | "owner";
  isPremium?: boolean;
}

interface Category {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  commands: Command[];
  isPremium?: boolean;
}

const CATEGORIES: Category[] = [
  {
    id: "setup",
    title: "Configuration & Setup",
    description:
      "Core commands required to initialize and configure the bot for your server.",
    icon: SettingsIcon,
    commands: [
      {
        name: "/setup",
        description:
          "Initializes the SentinL server settings globally. Required step when you first invite the bot.",
        options: [],
        example: "/setup",
      },
      {
        name: "/language set",
        description: "Sets the primary language the bot responds in.",
        options: [
          {
            name: "lang",
            type: "String",
            required: true,
            description: "The locale code (e.g. en, fr, de, es, hi).",
          },
        ],
        example: "/language set lang:en",
      },
      {
        name: "/language view",
        description: "View current server language.",
        options: [],
        example: "/language view",
      },
      {
        name: "/start_trial",
        permission: "owner",
        description:
          "Starts your 14-day free PRO trial. Unlocks PRO features temporarily.",
        options: [],
        example: "/start_trial",
      },
      {
        name: "/subscribe",
        permission: "everyone",
        description:
          "Get a direct link to upgrade your server to SentinL Pro or Premium.",
        options: [],
        example: "/subscribe",
      },
      {
        name: "/wipedata",
        permission: "owner",
        description: "Request complete deletion of server data from SentinL (GDPR/CCPA).",
        options: [],
        example: "/wipedata",
      },
      {
        name: "/help",
        description:
          "List all available commands.",
        options: [],
        example: "/help",
      },
    ],
  },
  {
    id: "moderation",
    title: "AI Moderation",
    description:
      "Configure and interact with the AI moderation engine and filters.",
    icon: Shield,
    commands: [
      {
        name: "/moderation toggle-context",
        isPremium: true,
        description:
          "Toggles whether the AI should read the last 10 surrounding messages when evaluating a flagged message (Premium servers only).",
        options: [],
        example: "/moderation toggle-context",
      },
      {
        name: "/modqueue",
        description: "Get a link to the moderation queue dashboard.",
        options: [],
        example: "/modqueue",
      },
      {
        name: "/listrules",
        description: "List the Community DNA rules defined for the server.",
        options: [],
        example: "/listrules",
      },
      {
        name: "/status queue",
        permission: "everyone",
        description:
          "Displays the current AI rate limits and dynamic queue status (Bot owner only).",
        options: [],
        example: "/status queue",
      },
      {
        name: "/status quota",
        permission: "everyone",
        description:
          "Shows the remaining AI moderation calls for free servers today.",
        options: [],
        example: "/status quota",
      },
      {
        name: "/keywords add",
        description: "Adds a new keyword or regex pattern to the pre-filter.",
        options: [
          {
            name: "keyword",
            type: "String",
            required: true,
            description: "The word or regex pattern to match.",
          },
        ],
        example: "/keywords add keyword:spam_link.com",
      },
      {
        name: "/keywords remove",
        description: "Removes a keyword or regex pattern from the pre-filter.",
        options: [
          {
            name: "keyword",
            type: "String",
            required: true,
            description: "The word or regex pattern to remove.",
          },
        ],
        example: "/keywords remove keyword:spam_link.com",
      },
      {
        name: "/keywords list",
        description: "Lists all currently configured pre-filter keywords.",
        options: [],
        example: "/keywords list",
      },
      {
        name: "/keywords toggle-autodelete",
        description:
          "Toggles whether messages matching a keyword should be automatically deleted.",
        options: [],
        example: "/keywords toggle-autodelete",
      },
    ],
  },
  {
    id: "health",
    title: "Community Health",
    description: "Commands to monitor and display community safety scores and streaks.",
    icon: Trophy,
    commands: [
      {
        name: "/health score",
        permission: "everyone",
        description: "View the server's current health score and active streak.",
        options: [],
        example: "/health score",
      },
      {
        name: "/health stats",
        permission: "everyone",
        description: "Get instructions and a link to view full community health statistics.",
        options: [],
        example: "/health stats",
      },
      {
        name: "/health update",
        permission: "moderator",
        description: "Force an immediate recalculation and update of the server's public Health Widget.",
        options: [],
        example: "/health update",
      },
    ],
  },
  {
    id: "reports",
    title: "User Reports & Appeals",
    description:
      "Empower users to report messages, and appeal moderation actions.",
    icon: Shield,
    commands: [
      {
        name: "/appeal",
        isPremium: true,
        permission: "everyone",
        description: "Review your recent punishments and submit an appeal to server staff.",
        options: [
          {
            name: "case_id",
            type: "String",
            required: false,
            description: "The specific Case ID you want to appeal.",
          },
        ],
        example: "/appeal case_id:CASE-A1B2C3",
      },
      {
        name: "/report",
        permission: "everyone",
        description:
          "Reports a specific user to the server moderators privately.",
        options: [
          {
            name: "user",
            type: "User",
            required: true,
            description: "The user you are reporting.",
          },
          {
            name: "reason",
            type: "String",
            required: true,
            description: "The reason for this report.",
          },
        ],
        example:
          "/report user:@BadActor reason:Harassing members in voice channels.",
      },
      {
        name: "Report Message (Context Command)",
        description:
          "Right click a message -> Apps -> Report Message. Opens a modal to submit a report for that message.",
        options: [],
        example: "Right click -> Apps -> Report Message",
      },
      {
        name: "/reports list",
        description: "Lists recent user reports filtered by status.",
        options: [
          {
            name: "status",
            type: "String",
            required: false,
            description: "pending or resolved.",
          },
          {
            name: "page",
            type: "Integer",
            required: false,
            description: "Pagination.",
          },
        ],
        example: "/reports list status:pending",
      },
      {
        name: "/reports view",
        description: "Views the full details and context of a specific report.",
        options: [
          {
            name: "report_id",
            type: "String",
            required: true,
            description: "The unique Report ID.",
          },
        ],
        example: "/reports view report_id:123456789",
      },
      {
        name: "/reports take",
        description: "Assigns a pending report to yourself for review.",
        options: [
          {
            name: "report_id",
            type: "String",
            required: true,
            description: "The unique Report ID.",
          },
        ],
        example: "/reports take report_id:123456789",
      },
      {
        name: "/reports resolve",
        description:
          "Resolves a report and applies an optional moderation action.",
        options: [
          {
            name: "report_id",
            type: "String",
            required: true,
            description: "The unique Report ID.",
          },
          {
            name: "action",
            type: "String",
            required: true,
            description: "Action to take (ban, kick, mute, warn, ignore).",
          },
          {
            name: "reason",
            type: "String",
            required: true,
            description: "Reason for the moderation action.",
          },
          {
            name: "duration",
            type: "Integer",
            required: false,
            description: "Duration in days (if action is mute/ban).",
          },
        ],
        example:
          "/reports resolve report_id:123456789 action:mute reason:Spamming duration:1",
      },
      {
        name: "/reports history",
        description:
          "Fetches the report history associated with a specific user.",
        options: [
          {
            name: "user",
            type: "User",
            required: true,
            description: "The target user.",
          },
        ],
        example: "/reports history user:@Troublemaker",
      },
    ],
  },
  {
    id: "integrations",
    title: "Social Integrations",
    isPremium: true,
    description:
      "Automatically announce new YouTube videos and Twitch streams (Premium only).",
    icon: UsersIcon,
    commands: [
      {
        name: "/integrate youtube add",
        description: "Add a YouTube channel to monitor.",
        options: [
          { name: "target", type: "String", required: true, description: "Channel URL or @handle." },
          { name: "channel", type: "Channel", required: true, description: "Channel for announcements." },
        ],
        example: "/integrate youtube add target:@MrBeast channel:#announcements",
      },
      {
        name: "/integrate youtube remove",
        description: "Remove a YouTube integration.",
        options: [
          { name: "target", type: "String", required: true, description: "Integration ID (from /integrate youtube list)." },
        ],
        example: "/integrate youtube remove target:12345",
      },
      {
        name: "/integrate youtube list",
        description: "List all active YouTube integrations.",
        options: [],
        example: "/integrate youtube list",
      },
      {
        name: "/integrate twitch add",
        description: "Add a Twitch streamer to monitor.",
        options: [
          { name: "target", type: "String", required: true, description: "Twitch username." },
          { name: "channel", type: "Channel", required: true, description: "Channel for announcements." },
        ],
        example: "/integrate twitch add target:ninja channel:#announcements",
      },
      {
        name: "/integrate twitch remove",
        description: "Remove a Twitch integration.",
        options: [
          { name: "target", type: "String", required: true, description: "Integration ID." },
        ],
        example: "/integrate twitch remove target:12345",
      },
      {
        name: "/integrate twitch list",
        description: "List all active Twitch integrations.",
        options: [],
        example: "/integrate twitch list",
      },
    ],
  },
  {
    id: "giveaway",
    title: "Giveaways",
    isPremium: true,
    description: "Launch and manage automated server giveaways.",
    icon: Trophy,
    commands: [
      {
        name: "/giveaway start",
        description: "Launch a new giveaway directly from Discord.",
        options: [
          { name: "prize", type: "String", required: true, description: "The prize." },
          { name: "channel", type: "Channel", required: true, description: "Channel to post in." },
          { name: "winners", type: "Integer", required: false, description: "Number of winners." },
          { name: "duration", type: "Integer", required: false, description: "Duration in hours." },
        ],
        example: "/giveaway start prize:\"1 Month Nitro\" channel:#giveaways winners:1 duration:24",
      },
      {
        name: "/giveaway end",
        description: "Manually end a giveaway early.",
        options: [
          { name: "message_id", type: "String", required: true, description: "The discord message ID of the giveaway." },
        ],
        example: "/giveaway end message_id:123456789",
      },
      {
        name: "/giveaway reroll",
        description: "Reroll the winner of a giveaway.",
        options: [
          { name: "message_id", type: "String", required: true, description: "The discord message ID of the giveaway." },
        ],
        example: "/giveaway reroll message_id:123456789",
      }
    ],
  },
  {
    id: "leveling",
    title: "Leveling & XP",
    isPremium: true,
    description:
      "Foster competition and engagement with our comprehensive XP system, complete with leaderboards and role rewards.",
    icon: Trophy,
    commands: [
      {
        name: "/rank",
        permission: "everyone",
        description:
          "View your own or another member's current level and progress toward the next level with a personalized rank card.",
        options: [
          {
            name: "user",
            type: "User",
            required: false,
            description: "The user whose rank you want to inspect.",
          },
        ],
        example: "/rank user:@Nexus",
      },
      {
        name: "/leaderboard",
        permission: "everyone",
        description:
          "Displays the top 10 most active members on the server ranked by total experience points.",
        options: [],
        example: "/leaderboard",
      },
      {
        name: "/leveling toggle",
        description: "Enable or disable the leveling system for this server.",
        options: [],
        example: "/leveling toggle",
      },
      {
        name: "/leveling set xp-multiplier",
        description: "Multiplier for XP earned (default 1.0).",
        options: [{ name: "value", type: "Number", required: true, description: "Multiplier value (0.5-3.0)" }],
        example: "/leveling set xp-multiplier value:1.5",
      },
      {
        name: "/leveling set cooldown",
        description: "Cooldown between XP gains in seconds.",
        options: [{ name: "seconds", type: "Integer", required: true, description: "Seconds (15-300)" }],
        example: "/leveling set cooldown seconds:60",
      },
      {
        name: "/leveling set xp-range",
        description: "Min and max XP per message.",
        options: [
          { name: "min", type: "Integer", required: true, description: "Minimum XP" },
          { name: "max", type: "Integer", required: true, description: "Maximum XP" }
        ],
        example: "/leveling set xp-range min:15 max:25",
      },
      {
        name: "/leveling set level-formula",
        description: "Divisor in level formula (default 50).",
        options: [{ name: "divisor", type: "Integer", required: true, description: "Divisor value" }],
        example: "/leveling set level-formula divisor:50",
      },
      {
        name: "/leveling ignore-channel add",
        description: "Add a channel to the ignore list.",
        options: [{ name: "channel", type: "Channel", required: true, description: "Channel to ignore" }],
        example: "/leveling ignore-channel add channel:#spam-channel",
      },
      {
        name: "/leveling ignore-channel remove",
        description: "Remove a channel from the ignore list.",
        options: [{ name: "channel", type: "Channel", required: true, description: "Channel to re-enable" }],
        example: "/leveling ignore-channel remove channel:#spam-channel",
      },
      {
        name: "/leveling ignore-role add",
        description: "Add a role to the ignore list.",
        options: [{ name: "role", type: "Role", required: true, description: "Role to ignore" }],
        example: "/leveling ignore-role add role:@Muted",
      },
      {
        name: "/leveling ignore-role remove",
        description: "Remove a role from the ignore list.",
        options: [{ name: "role", type: "Role", required: true, description: "Role to re-enable" }],
        example: "/leveling ignore-role remove role:@Muted",
      },
      {
        name: "/leveling role-reward add",
        description:
          "Automatically assign a role to a user when they reach a specific level.",
        options: [
          { name: "level", type: "Integer", required: true, description: "The level required." },
          { name: "role", type: "Role", required: true, description: "The role to award." },
        ],
        example: "/leveling role-reward add level:5 role:@Level 5",
      },
      {
        name: "/leveling role-reward remove",
        description: "Remove a role reward.",
        options: [{ name: "level", type: "Integer", required: true, description: "Level to remove reward from" }],
        example: "/leveling role-reward remove level:5",
      },
      {
        name: "/leveling role-reward list",
        description: "List all role rewards.",
        options: [],
        example: "/leveling role-reward list",
      },
    ],
  },
  {
    id: "onboarding",
    title: "Member Onboarding",
    description:
      "Automate welcome messages, rules delivery, and role assignments for new members.",
    icon: UsersIcon,
    commands: [
      {
        name: "/onboarding setwelcome",
        description:
          "Configures the public welcome message sent to a specific channel when a member joins. Uses dynamic placeholders for personalization.",
        options: [
          {
            name: "channel",
            type: "Channel",
            required: true,
            description:
              "The text channel where the welcome message will appear.",
          },
          {
            name: "message",
            type: "String",
            required: true,
            description:
              "The message body. Use {user} to mention them and {server} for the guild name.",
          },
        ],
        example:
          "/onboarding setwelcome channel:#welcome message:Welcome to {server}, {user}! Make sure to read our rules.",
      },
      {
        name: "/onboarding setdefaultrole",
        description:
          "Sets a primary role automatically assigned to all incoming members instantly upon joining.",
        options: [
          {
            name: "role",
            type: "Role",
            required: true,
            description: "The exact role to apply (e.g. Member, @Newbie).",
          },
        ],
        example: "/onboarding setdefaultrole role:@Member",
      },
      {
        name: "/onboarding toggle_dm",
        description:
          "Instantly toggle whether the bot slides into the user's Direct Messages upon joining to deliver server rules and onboarding instructions.",
        options: [
          {
            name: "enabled",
            type: "Boolean",
            required: true,
            description: "True to enable DMs, False to disable them.",
          },
        ],
        example: "/onboarding toggle_dm enabled:True",
      },
      {
        name: "/onboarding preview",
        description:
          "Prints a complete receipt of your current server onboarding configuration so you know exactly what happens when someone joins.",
        options: [],
        example: "/onboarding preview",
      },
    ],
  },
  {
    id: "autorole",
    title: "Auto-Assign",
    description:
      "Configure a default role to be given to members as soon as they join the server.",
    icon: Shield,
    commands: [
      {
        name: "/autorole set",
        description:
          "Set a role to be automatically assigned when new members join.",
        options: [
          {
            name: "role",
            type: "Role",
            required: true,
            description: "The Discord role to give.",
          },
        ],
        example: "/autorole set role:@Member",
      },
      {
        name: "/autorole disable",
        description: "Disable automatic role assignment.",
        options: [],
        example: "/autorole disable",
      },
      {
        name: "/autorole status",
        description:
          "Check if autorole is enabled and which role is being assigned.",
        options: [],
        example: "/autorole status",
      },
    ],
  },
  {
    id: "reactionroles",
    title: "Reaction Roles",
    description:
      "Create interactive buttons that allow members to self-assign roles, perfect for interest notification or color roles.",
    icon: Shield,
    commands: [
      {
        name: "/reactionrole create",
        description:
          "Constructs an interactive role panel. Supports up to 5 role and label mappings inline.",
        options: [
          {
            name: "channel",
            type: "Channel",
            required: true,
            description: "The channel where the panel will be posted.",
          },
          {
            name: "title",
            type: "String",
            required: true,
            description: "The title shown on the panel embed.",
          },
          {
            name: "role1",
            type: "Role",
            required: true,
            description: "The first role to assign.",
          },
          {
            name: "label1",
            type: "String",
            required: true,
            description: "The emoji or text label for the first role button.",
          },
          {
            name: "role2...5",
            type: "Role",
            required: false,
            description: "Additional roles to add to the panel.",
          },
          {
            name: "label2...5",
            type: "String",
            required: false,
            description: "Labels for the additional roles.",
          },
        ],
        example:
          "/reactionrole create channel:#general title:Get Roles role1:@member label1:📝 role2:@announcements label2:🔔",
      },
      {
        name: "/reactionrole edit",
        description: "Opens a modal to modify an existing reaction role panel.",
        options: [
          {
            name: "panel_id",
            type: "String",
            required: true,
            description: "The Message ID of the existing panel.",
          },
          {
            name: "title",
            type: "String",
            required: false,
            description: "The new title for the panel embed.",
          },
        ],
        example: "/reactionrole edit panel_id:123456789 title:New Title",
      },
      {
        name: "/reactionrole delete",
        description:
          "Permanentely remove a reaction role panel from both the channel and the bot's memory.",
        options: [
          {
            name: "panel_id",
            type: "String",
            required: true,
            description: "The Message ID of the panel to delete.",
          },
        ],
        example: "/reactionrole delete panel_id:123456789",
      },
      {
        name: "/reactionrole list",
        description:
          "Displays a list of all active reaction role panels in the current server with their IDs.",
        options: [],
        example: "/reactionrole list",
      },
    ],
  },
];

export default function CommandsGuide() {
  const { isPro, tier } = useServer();
  const isFree = !isPro;

  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(
    "onboarding",
  );
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);

  const sortedCategories = [...CATEGORIES].sort((a, b) => {
    if (a.isPremium && !b.isPremium) return 1;
    if (!a.isPremium && b.isPremium) return -1;
    return 0;
  });

  const handleCopy = (text: string, cmdName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedIndex(cmdName);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const toggleCategory = (catId: string) => {
    setExpandedCategory(expandedCategory === catId ? null : catId);
    setExpandedCommand(null); // Reset selected command when changing categories
  };

  const toggleCommand = (cmdName: string) => {
    setExpandedCommand(expandedCommand === cmdName ? null : cmdName);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-white/80 backdrop-blur-md border border-white/40 rounded-[2.5rem] overflow-hidden flex flex-col shadow-xl shadow-primary/5"
    >
      <div className="px-8 py-6 border-b border-outline-variant/20 flex justify-between items-center bg-surface-container/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-container/20 rounded-xl flex items-center justify-center text-primary border border-primary/10">
            <Terminal className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-on-surface tracking-tight">
            Command List
          </h2>
        </div>
      </div>

      <div className="p-8 flex flex-col gap-6">
        <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest leading-relaxed">
          Select a category to view available commands. Click on a command to
          see its parameters and examples.
        </p>

        <div className="flex flex-col gap-4">
          {sortedCategories.map((category) => {
            const isCatExpanded = expandedCategory === category.id;
            const Icon = category.icon;
            const shouldGreyOut = isFree && category.isPremium;

            const sortedCommands = [...category.commands].sort((a, b) => {
              if (a.isPremium && !b.isPremium) return 1;
              if (!a.isPremium && b.isPremium) return -1;
              return 0;
            });

            return (
              <div
                key={category.id}
                className={`border border-outline-variant/30 rounded-3xl overflow-hidden bg-surface-container/20 transition-all duration-300 ease-out ${shouldGreyOut ? "opacity-60 grayscale-[0.5] hover:grayscale-0 hover:opacity-100" : ""}`}
              >
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full px-6 py-4 flex justify-between items-center transition-all duration-300 ease-out ${isCatExpanded ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.01] z-10 relative" : "hover:bg-white/40"}`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ease-out ${isCatExpanded ? "bg-white/20 text-white" : "bg-surface-container text-primary"}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-left flex flex-col pt-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black text-[13px] tracking-tight uppercase ${isCatExpanded ? "text-white" : "text-on-surface"}`}
                        >
                          {category.title}
                        </span>
                        {category.isPremium && (
                          <div
                            className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border ${isCatExpanded ? "bg-white/20 text-white border-white/40" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}
                          >
                            PRO
                          </div>
                        )}
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${isCatExpanded ? "text-white/70" : "text-text-secondary"}`}
                      >
                        {category.commands.length} COMMANDS
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={`w-5 h-5 transition-transform duration-300 ${isCatExpanded ? "rotate-90" : "opacity-40"}`} />
                </button>

                {/* Commands inside Category */}
                <AnimatePresence>
                  {isCatExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "circOut" }}
                      className="flex flex-col p-4 gap-3 bg-white/30 overflow-hidden"
                    >
                      <p className="px-3 text-[11px] font-medium text-text-secondary/80 italic mb-1">
                        {category.description}
                      </p>

                      {sortedCommands.map((cmd) => {
                        const isCmdExpanded = expandedCommand === cmd.name;
                        const isCmdPremium = cmd.isPremium;
                        const shouldGreyOutCmd = isFree && isCmdPremium;

                        return (
                          <div
                            key={cmd.name}
                            className={`rounded-2xl overflow-hidden transition-all duration-300 ${isCmdExpanded ? "bg-white shadow-xl shadow-primary/10 border border-primary/20 scale-[0.99]" : "bg-surface-container/30 border border-outline-variant/20 hover:border-primary/20"} ${shouldGreyOutCmd ? "opacity-70" : ""}`}
                          >
                            {/* Command Header */}
                            <button
                              onClick={() => toggleCommand(cmd.name)}
                              className="w-full text-left px-5 py-4 flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3 w-full pr-4">
                                <span
                                  className={`font-mono text-xs font-black px-3 py-1.5 rounded-lg transition-all duration-300 ease-out ${isCmdExpanded ? "bg-primary text-white" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"}`}
                                >
                                  {cmd.name}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[9px] px-2 py-1 rounded-md uppercase tracking-wider font-extrabold flex-shrink-0 ${isCmdExpanded ? "bg-primary-container text-primary shadow-sm" : "bg-outline-variant/30 text-text-secondary"}`}
                                  >
                                    {cmd.permission === "everyone"
                                      ? "ALL"
                                      : cmd.permission === "owner"
                                        ? "OWNER"
                                        : "MODS"}
                                  </span>
                                  {isCmdPremium && (
                                    <div className="bg-amber-500/10 text-amber-600 border border-amber-500/20 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase">
                                      PRO
                                    </div>
                                  )}
                                </div>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-text-secondary shrink-0 transition-transform duration-300 ${isCmdExpanded ? "rotate-180 text-primary" : ""}`}
                              />
                            </button>

                            {/* Command Details */}
                            <AnimatePresence>
                              {isCmdExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.35 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-6 pt-2 space-y-5">
                                    <p className="text-on-surface font-semibold text-[13px] leading-relaxed pl-1">
                                      {cmd.description}
                                    </p>

                                    {cmd.options.length > 0 && (
                                      <div>
                                        <h4 className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em] mb-3 ml-1">
                                          Parameter Specifications
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {cmd.options.map((opt, i) => (
                                            <div
                                              key={i}
                                              className="flex flex-col p-4 border border-outline-variant/30 rounded-2xl bg-surface-container/20 shadow-inner"
                                            >
                                              <div className="flex justify-between items-center mb-1.5">
                                                <span className="font-mono text-[11px] font-black text-on-surface uppercase tracking-tight">
                                                  {opt.name}
                                                </span>
                                                <span
                                                  className={`text-[8px] font-black tracking-[0.15em] px-2 py-0.5 rounded-full shadow-sm ${opt.required ? "bg-danger text-white" : "bg-text-secondary/20 text-on-surface/60"}`}
                                                >
                                                  {opt.required
                                                    ? "REQUIRED"
                                                    : "OPTIONAL"}
                                                </span>
                                              </div>
                                              <span className="text-[11px] font-medium text-text-secondary leading-tight">
                                                {opt.description}
                                              </span>
                                              <div className="mt-3 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                                <span className="text-[9px] font-black font-mono text-primary uppercase tracking-widest">
                                                  Type: {opt.type}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    <div>
                                      <h4 className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em] mb-3 ml-1">
                                        Transmission Example
                                      </h4>
                                      <div className="flex items-center justify-between bg-on-surface text-white rounded-2xl p-4 shadow-inner group/code">
                                        <code className="font-mono text-xs text-white/90 break-all pl-1">
                                          {cmd.example}
                                        </code>
                                        <button
                                          onClick={(e) =>
                                            handleCopy(cmd.example, cmd.name, e)
                                          }
                                          className="text-white/40 hover:text-white transition-all duration-300 ease-out ml-4 shrink-0 p-2.5 bg-white/10 hover:bg-white/20 rounded-xl active:scale-90"
                                          title="Copy into Buffer"
                                        >
                                          {copiedIndex === cmd.name ? (
                                            <Check className="w-4 h-4 text-success" />
                                          ) : (
                                            <Copy className="w-4 h-4" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
