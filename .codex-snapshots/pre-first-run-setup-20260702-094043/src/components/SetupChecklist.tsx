import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { CheckCircle, Circle, ChevronDown, ChevronUp, X, ExternalLink, Settings, Shield, Bot, ListChecks, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { getDiscordInviteUrl } from '../utils/discordInvite';
import { DOWNSTREAM_EFFECTS, PermissionType } from './PermissionsWarning';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useSetupStatus } from '../hooks/useSetupStatus';

const Tooltip = ({ text, children }: { text: string, children: React.ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={100}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="z-50 max-w-[280px] rounded-md bg-gray-800 px-3 py-2 text-xs text-white shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          sideOffset={5}
        >
          {text}
          <TooltipPrimitive.Arrow className="fill-gray-800" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);

export function SetupChecklist() {
  const navigate = useNavigate();
  const location = useLocation();

  const [testingPerms, setTestingPerms] = useState(false);

  const handleActionClick = async (e: React.MouseEvent, action: any, task: any) => {
    e.stopPropagation();

    // Check dependencies based on the task ID
    if (task.id === 'claim' && !discordProfile) {
      toast.error("Please connect your Discord account first.");
      return;
    }
    if (task.id === 'invite' && !serverClaimedBy) {
      toast.error("Please claim the server first.");
      return;
    }
    if (task.id === 'activate' && (!botGuilds.includes(selectedServerId) && !(botPermissions && Object.keys(botPermissions).length > 0))) {
      toast.error("Please invite the bot to the server first.");
      return;
    }
    if (task.id === 'permissions' && (!serverClaimedBy || !botGuilds.includes(selectedServerId))) {
      toast.error("Please ensure the server is claimed and the bot is invited first.");
      return;
    }

    if (action.type === 'button') {
      action.onClick();
    } else if (action.type === 'test_perms') {
      if (testingPerms) return;
      setTestingPerms(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/discord/permissions/${selectedServerId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.permissions) {
             setBotPermissions(data.permissions);
             const requiredPerms = ["SendMessages", "ManageRoles", "ManageMessages", "ReadMessageHistory"];
             const missing = requiredPerms.filter(p => !data.permissions[p]);
             if (missing.length > 0) {
                 const missingDetails = missing.map(p => `${p} (${DOWNSTREAM_EFFECTS[p as PermissionType]})`);
                 toast.error(`Missing permissions: ${missingDetails.join(" | ")}. Please update Bot's role in Discord Server settings.`);
             } else {
                 toast.success("Bot has all required permissions!");
             }
          }
        } else {
           const errData = await res.json().catch(() => ({}));
           toast.error(errData.error || "Failed to check permissions.");
        }
      } catch (err: any) {
        toast.error(err.message || "Test perms failed");
        console.error("Test perms failed", err);
      } finally {
        setTestingPerms(false);
      }
    } else if (action.type === 'link') {
      const pathPart = action.to.split('#')[0];
      const fullHash = action.to.split('#')[1] || '';
      const [tabHash, elementId] = fullHash.split('/');
      
      const isSamePath = pathPart === location.pathname;
      if (isSamePath) {
        if (fullHash) {
           window.location.hash = fullHash;
        }
        
        setTimeout(() => {
          if (elementId) {
             document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
             window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 100);
      } else {
        navigate(action.to);
        setTimeout(() => {
          if (elementId) {
             document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
             window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }, 250);
      }
    } else if (action.type === 'href') {
      window.open(action.to, '_blank', 'noreferrer');
    }
  };
  const {
    selectedServerId,
    discordProfile,
    botGuilds,
    serverClaimedBy,
    botPermissions,
    setBotPermissions,
  } = useServer();
  const setupStatus = useSetupStatus();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userToggled, setUserToggled] = useState(false);

  if (!selectedServerId) return null;

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    setUserToggled(true);
  };

  const {
    connectComplete,
    claimComplete,
    inviteComplete,
    activateComplete,
    permissionsComplete,
    intentsComplete,
    logComplete,
    rulesComplete,
    testBotDone,
    loading,
    completedCount,
    totalCount,
    progress,
    isAllDone,
  } = setupStatus;

  const tasks = [
    {
      id: 'connect',
      title: 'Connect Discord account',
      description: 'Link your Discord account to the dashboard to authenticate and identify your servers.',
      isComplete: connectComplete,
      isDisabled: false,
      action: { type: 'link', to: '/connect', label: 'Connect' }
    },
    {
      id: 'claim',
      title: 'Claim server',
      description: 'Select your server from the dropdown in Settings and claim it to begin setup.',
      isComplete: claimComplete,
      isDisabled: !connectComplete,
      action: { type: 'link', to: '/settings#general/setup-claim-server', label: 'Go to Settings' }
    },
    {
      id: 'invite',
      title: 'Invite bot to server',
      description: 'Use the generated link to invite the SentinL bot to your Discord server.',
      isComplete: inviteComplete,
      isDisabled: !claimComplete || !getDiscordInviteUrl(),
      action: { type: 'href', to: getDiscordInviteUrl() || '#', label: 'Invite Bot' }
    },
    {
      id: 'activate',
      title: 'Activate bot',
      description: 'Toggle the activation switch in Settings so the bot begins monitoring your server.',
      isComplete: activateComplete,
      isDisabled: !inviteComplete,
      action: { type: 'link', to: '/settings#general/setup-activate-bot', label: 'Go to Settings' }
    },
    {
      id: 'permissions',
      title: 'Verify bot permissions',
      description: 'Ensure the bot has required permissions (Send Messages, Manage Roles, Manage Messages, Read Message History).',
      isComplete: permissionsComplete,
      isDisabled: !activateComplete,
      action: { type: 'test_perms', label: testingPerms ? 'Testing...' : 'Test Permissions' }
    },
    {
      id: 'intents',
      title: 'Verify Message Content Intent',
      description: 'Discord blocks bots from reading message text unless Message Content Intent is enabled. Without it, SentinL can be online but unable to moderate normal messages.',
      isComplete: intentsComplete,
      isDisabled: !permissionsComplete,
      action: { type: 'href', to: 'https://discord.com/developers/applications', label: 'Check Intents' }
    },
    {
      id: 'log',
      title: 'Choose log channel',
      description: 'Select a channel in Settings where the bot can send moderation logs and alerts.',
      isComplete: logComplete,
      isDisabled: !activateComplete,
      action: { type: 'link', to: '/settings#general/setup-log-channel', label: 'Set Channel' }
    },
    {
      id: 'rules',
      title: 'Add custom/suggested rule',
      description: 'Add at least one custom keyword or AI rule in the DNA settings to guide moderation.',
      isComplete: rulesComplete,
      isDisabled: !activateComplete,
      action: { type: 'link', to: '/settings#dna', label: 'Add Rules' }
    },
    {
      id: 'test',
      title: 'Test with !sentinl',
      description: 'Send the !sentinl command in any channel your bot can see to verify it\'s working.',
      isComplete: testBotDone,
      isDisabled: !logComplete || !rulesComplete,
      action: { type: 'button', onClick: () => { navigator.clipboard.writeText('!sentinl'); toast.success('Command copied!'); }, label: 'Copy Command' }
    }
  ];

  useEffect(() => {
    if (!loading && !userToggled) {
      setIsCollapsed(isAllDone);
    }
  }, [loading, isAllDone, userToggled]);

  return (
    <div className="mb-8 w-full">
      <div className={`bg-surface-container border rounded-2xl overflow-hidden backdrop-blur-md transition-all duration-500 ${!isAllDone ? 'animate-checklist-pulse shadow-xl ring-1 ring-primary/20' : 'border-outline-variant/50 shadow-xl'}`}>
        <button 
          type="button"
          aria-expanded={!isCollapsed}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} server setup checklist`}
          className="w-full text-left p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-surface-container/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          onClick={toggleCollapse}
        >
          <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-xl ${isAllDone ? 'bg-green-200 text-green-900 border border-green-300' : 'bg-primary/20 text-primary'}`}>
              <ListChecks className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                Server Setup Checklist
                {isAllDone && <span className="bg-green-400 text-green-950 px-2 py-0.5 rounded-full font-black uppercase tracking-widest text-[10px] shadow-sm">Complete</span>}
              </h3>
              <p className="text-xs text-text-secondary mt-1 tracking-wide">
                {completedCount} of {totalCount} tasks completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block w-32 h-2 bg-surface-variant rounded-full overflow-hidden">
              <motion.div 
                className={`h-full ${isAllDone ? 'bg-green-500' : 'bg-primary'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 text-text-secondary">
                <ChevronUp className={`w-4 h-4 transition-transform duration-300 motion-reduce:transition-none ${isCollapsed ? "rotate-180" : ""}`} />
              </div>
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="border-t border-outline-variant/30 overflow-hidden"
            >
              {loading ? (
                <div className="p-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : (
                <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence>
                  {tasks.map((task, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24, delay: idx * 0.05 } }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={task.id} 
                      className={`flex items-start justify-between gap-3 p-4 rounded-xl border transition-all ${
                        task.isComplete 
                          ? 'bg-surface-variant/20 border-transparent opacity-60' 
                          : task.isDisabled
                            ? 'bg-surface-container/20 border-outline-variant/30 opacity-40 grayscale'
                            : 'bg-background border-outline-variant shadow-sm'
                      }`}
                    >
                      <div className="flex flex-col gap-2.5 w-full">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            {task.isComplete ? (
                              <CheckCircle className="w-4 h-4 text-green-700" strokeWidth={3} />
                            ) : (
                              <Circle className={`w-4 h-4 ${task.isDisabled ? 'text-text-secondary/30' : 'text-text-secondary/60'}`} />
                            )}
                          </div>
                          <Tooltip text={task.description}>
                            <span 
                              className={`text-xs font-semibold leading-tight cursor-help border-b border-dotted ${task.isComplete ? 'text-text-secondary line-through border-transparent' : task.isDisabled ? 'text-text-secondary/50 border-text-secondary/30' : 'text-text-primary border-text-secondary/50'}`}
                            >
                              {task.title}
                            </span>
                          </Tooltip>
                        </div>
                        {!task.isComplete && (
                           <div className="ml-7 self-start mt-1">
                             <button
                               disabled={task.isDisabled}
                               onClick={(e) => {
                                 if (task.isDisabled) return;
                                 handleActionClick(e, task.action, task);
                               }}
                                aria-label={`${task.action.label}: ${task.title}`}
                                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors z-10 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                                 task.isDisabled 
                                   ? 'bg-surface-variant/50 text-text-secondary/50 cursor-not-allowed'
                                   : ['connect', 'invite', 'test'].includes(task.id)
                                     ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                     : 'bg-surface-variant text-text-primary hover:bg-surface-variant/80'
                               }`}
                             >
                               {task.action.label}
                             </button>
                           </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Rebuild trigger 3
