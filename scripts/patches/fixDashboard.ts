import fs from 'fs';

let content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const injectionPoint = content.indexOf('  return (\n    <div className="flex flex-col gap-6 md:gap-8 w-full pb-10">');

if (injectionPoint === -1) {
    console.error("Injection point not found");
    process.exit(1);
}

const beforeInjection = content.substring(0, injectionPoint);
const afterInjection = content.substring(injectionPoint);

const gradeColor = `
  const gradeColor = (g: string) => {
    switch (g) {
      case "A+": case "A": return "text-emerald-500 scale-110";
      case "B": return "text-yellow-500";
      case "C": return "text-orange-500";
      case "D": case "F": return "text-danger";
      default: return "text-text-muted";
    }
  };
`;

const freeDashboardCode = `
  const FreeDashboard = () => {
    return (
      <div className="flex flex-col gap-6 md:gap-8 w-full pb-10">
        {/* 1. Page Header */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-on-surface">
              Dashboard
            </h1>
            <p className="text-text-secondary font-medium text-xs sm:text-sm mt-1">
              Overview for {authorizedServers.find(s => s.id === selectedServerId)?.name || "your server"}
            </p>
          </div>
          <div className={\`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold self-start shrink-0 \${
            isServerActiveGlobally
              ? "bg-success/10 border-success/30 text-success"
              : "bg-danger/10 border-danger/30 text-danger"
          }\`}>
            <span className={\`w-2 h-2 rounded-full \${isServerActiveGlobally ? "bg-success animate-pulse" : "bg-danger"}\`} />
            {isServerActiveGlobally ? "Bot Active" : "Bot Inactive"}
          </div>
        </header>

        {/* 2. Status Bar */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border \${
            botReady ? "bg-success/10 border-success/20 text-success" : "bg-danger/10 border-danger/20 text-danger"
          }\`}>
            <Bot className="w-3 h-3" />
            {botReady ? "SentinL Online" : "SentinL Offline"}
          </span>
          <span className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-surface-container border-outline-variant/30 text-text-secondary\`}>
            <Shield className="w-3 h-3" />
            Free
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-surface-container border-outline-variant/30 text-text-secondary">
            <Hash className="w-3 h-3" />
            {activeQuotaCount}/{maxSlots} Server{maxSlots !== 1 ? "s" : ""}
          </span>
          {botPermissions && (
            (!botPermissions.ManageMessages || !botPermissions.BanMembers || !botPermissions.ModerateMembers)
          ) && (
            <Link to="/moderation#settings" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border bg-warning/10 border-warning/30 text-orange-600 hover:bg-warning/20 transition-colors">
              <AlertTriangle className="w-3 h-3" />
              Missing Permissions
            </Link>
          )}
        </div>

        {/* 3. Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div
              whileHover={{ y: -2 }}
              onClick={() => navigate("/moderation#queue")}
              className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className={\`w-10 h-10 rounded-2xl flex items-center justify-center bg-danger/10\`}>
                  <ShieldAlert className={\`w-5 h-5 text-danger\`} />
                </div>
                <ChevronRight className="w-4 h-4 text-text-secondary/40" />
              </div>
              <div>
                <div className="text-2xl font-black text-on-surface">{pendingFlagsCountText}</div>
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest mt-0.5">Pending Flags</div>
                <div className="text-[11px] text-text-muted mt-0.5">Needs review</div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              onClick={() => navigate("/moderation#reports")}
              className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className={\`w-10 h-10 rounded-2xl flex items-center justify-center bg-orange-50\`}>
                  <Flag className={\`w-5 h-5 text-orange-500\`} />
                </div>
                <ChevronRight className="w-4 h-4 text-text-secondary/40" />
              </div>
              <div>
                <div className="text-2xl font-black text-on-surface">{pendingReportsCountText}</div>
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest mt-0.5">Open Reports</div>
                <div className="text-[11px] text-text-muted mt-0.5">User submitted</div>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -2 }}
              className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className={\`w-10 h-10 rounded-2xl flex items-center justify-center bg-success/10\`}>
                  <ShieldCheck className={\`w-5 h-5 text-success\`} />
                </div>
              </div>
              <div>
                <div className="text-2xl font-black text-on-surface">{weeklyStats.blocked}</div>
                <div className="text-xs font-semibold text-text-secondary uppercase tracking-widest mt-0.5">Blocked (7d)</div>
                <div className="text-[11px] text-text-muted mt-0.5">Auto-actioned by bot</div>
              </div>
            </motion.div>
        </div>

        {/* 4. Two-Column Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column - Flags and Reports */}
          <div className="flex flex-col gap-6">
            {/* Pending Flags */}
            <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden flex flex-col">
               <div className="flex items-center justify-between p-5 bg-surface-container/30 border-b border-outline-variant/20">
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-2">🚨 Pending Flags {pendingFlagsCount > 0 && <span className="bg-danger text-white px-2 py-0.5 rounded-lg text-xs">{pendingFlagsCountText}</span>} </span>
                 </div>
                 <Link to="/moderation#queue" className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1">
                   View All <ArrowRight className="w-3 h-3" />
                 </Link>
               </div>
               
               <div className="flex flex-col gap-1 p-5 pt-3">
                  {pendingFlags.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-text-secondary font-medium">
                      <CheckCircle className="w-5 h-5 text-success" /> All clear — no pending flags.
                    </div>
                  ) : (
                    pendingFlags.map(flag => (
                      <div key={flag.id} className="flex items-start gap-3 p-3 rounded-2xl hover:bg-surface-container/50 transition-colors cursor-pointer group"
                           onClick={() => navigate("/moderation#queue")}>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-black text-primary overflow-hidden">
                          {flag.authorAvatar ? (
                            <img src={flag.authorAvatar} alt={flag.authorUsername} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            flag.authorUsername?.[0]?.toUpperCase() || "?"
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-sm text-on-surface truncate">{flag.authorUsername}</span>
                            <span className="text-[10px] font-bold text-danger bg-danger/10 px-1.5 py-0.5 rounded uppercase">{flag.reason}</span>
                          </div>
                          <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                            {flag.content}
                          </p>
                          <div className="text-[10px] text-text-muted mt-1.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {flag.timestamp?.toDate ? formatDistanceToNow(flag.timestamp.toDate(), { addSuffix: true }) : "Just now"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
               </div>
            </div>

            {/* Pending Reports */}
            <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm overflow-hidden flex flex-col">
               <div className="flex items-center justify-between p-5 bg-surface-container/30 border-b border-outline-variant/20">
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-black text-on-surface uppercase tracking-widest flex items-center gap-2">🚩 Open Reports {pendingReportsCount > 0 && <span className="bg-orange-500 text-white px-2 py-0.5 rounded-lg text-xs">{pendingReportsCountText}</span>} </span>
                 </div>
                 <Link to="/moderation#reports" className="text-[11px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1">
                   View All <ArrowRight className="w-3 h-3" />
                 </Link>
               </div>
               
               <div className="flex flex-col gap-1 p-5 pt-3">
                  {pendingReports.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-text-secondary font-medium">
                      <CheckCircle className="w-5 h-5 text-success" /> All clear — no open reports.
                    </div>
                  ) : (
                    pendingReports.map(report => (
                      <div key={report.id} className="flex items-start gap-4 p-3 rounded-2xl hover:bg-surface-container/50 transition-colors cursor-pointer group"
                           onClick={() => navigate("/moderation#reports")}>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 mb-1.5">
                             <ShieldAlert className="w-3 h-3 text-orange-500" />
                             <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">{report.category}</span>
                             <span className="text-[10px] text-text-muted flex items-center gap-1 ml-auto">
                               <Clock className="w-2.5 h-2.5" />
                               {report.timestamp?.toDate ? formatDistanceToNow(report.timestamp.toDate(), { addSuffix: true }) : "Just now"}
                             </span>
                           </div>
                           <p className="text-xs font-medium text-on-surface mb-1">
                             Target: <span className="font-bold text-text-secondary">@{report.targetUsername || report.targetId}</span>
                           </p>
                           <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed bg-surface-variant/30 p-2 rounded-xl mt-2 border border-outline-variant/20">
                             {report.reason}
                           </p>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          </div>

          {/* Right Column - Health and Stats */}
          <div className="flex flex-col gap-6">
            
            {/* Community Health */}
            <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  <span className="text-sm font-black text-on-surface uppercase tracking-widest">
                    Community Health
                  </span>
                </div>
                <Link
                  to="/moderation#health"
                  className="text-[11px] font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  View <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Grade + Score */}
              <div className="flex items-center gap-4 mb-4">
                <div className={\`text-6xl font-black leading-none \${(!healthData?.lastGrade || healthData?.lastGrade === "N/A") ? 'text-text-secondary' : ''}\`}>
                  {healthData?.lastGrade || "—"}
                </div>
                <div>
                  {(!healthData?.lastGrade || healthData.lastGrade === "N/A") ? (
                    <>
                      <div className="text-3xl font-black text-text-secondary leading-none">
                        {healthMessageCount} <span className="text-sm">/ 500</span>
                      </div>
                      <div className="text-xs text-text-muted mt-1">Growing Server</div>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-black text-on-surface leading-none">
                        {healthData?.lastScore && healthData.lastScore !== "N/A" ? healthData.lastScore : "—"}
                        <span className="text-sm font-semibold text-text-secondary">/100</span>
                      </div>
                      <div className="text-xs text-text-muted mt-1">30-Day Safety Score</div>
                    </>
                  )}
                </div>
              </div>

              {/* Streak */}
              {(healthData?.streakDays ?? 0) > 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-success/5 border border-success/15">
                  <FlameKindling className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <span className="text-xs font-black text-on-surface">
                      {healthData.streakDays}-day
                    </span>
                    <span className="text-xs text-text-secondary"> safety streak active</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-surface-container/50 border border-outline-variant/20">
                  <p className="text-xs text-text-secondary">
                    {(!healthData?.lastGrade || healthData.lastGrade === "N/A") ? 
                      "Calculating health..." :
                      "No active streak. Maintain a Grade A score for consecutive days to start one."
                    }
                  </p>
                </div>
              )}

              {/* Not enabled state */}
              {!healthData?.enabled && !loadingHealth && (
                <div className="mt-3 p-3 rounded-2xl bg-primary/5 border border-primary/15">
                  <p className="text-xs text-text-secondary">
                    Community Health isn't active yet.{" "}
                    <Link to="/moderation#health" className="text-primary font-bold hover:underline">
                      Set it up →
                    </Link>
                  </p>
                </div>
              )}
            </div>

            {/* 7-Day Summary */}
            <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-primary" />
                <span className="text-sm font-black text-on-surface uppercase tracking-widest">
                  7-Day Summary
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-surface-container/50 border border-outline-variant/15">
                  <div className="text-xl font-black text-on-surface">{weeklyStats.flags}</div>
                  <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest leading-snug">
                    Messages Scanned
                  </div>
                </div>

                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-success/5 border border-success/15">
                  <div className="text-xl font-black text-success">{weeklyStats.blocked}</div>
                  <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest leading-snug">
                    Actions Taken
                  </div>
                </div>

                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-surface-container/50 border border-outline-variant/15">
                  <div className="text-xl font-black text-on-surface">{weeklyStats.resolved}</div>
                  <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest leading-snug">
                    Reports Resolved
                  </div>
                </div>

                <div className="flex flex-col gap-1 p-3 rounded-2xl bg-orange-50 border border-orange-100">
                  <div className="text-xl font-black text-orange-500">{pendingReportsCount}</div>
                  <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-widest leading-snug">
                    Reports Open
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-text-muted mt-4 text-center">
                {weeklyStats.blocked > 0
                  ? \`SentinL took action on \${weeklyStats.blocked} message\${weeklyStats.blocked !== 1 ? "s" : ""} this week.\`
                  : "The bot hasn't taken any automated actions this week."}
              </p>
            </div>

          </div>
        </div>

        {/* 5. Recent Bot Actions */}
        <div className="bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-text-secondary" />
            <h2 className="text-lg font-black text-on-surface tracking-tight">Recent Bot Actions</h2>
          </div>
          {recentActions.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 bg-surface-container/30 rounded-2xl border border-outline-variant/20">
               <ShieldCheck className="w-8 h-8 text-text-muted mb-2" />
               <p className="text-sm font-medium text-text-secondary">No automated actions yet.</p>
               <p className="text-xs text-text-muted mt-1">Actions taken by the bot will appear here.</p>
             </div>
          ) : (
             <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/20">
                      <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Time</th>
                      <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">User</th>
                      <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Action</th>
                      <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-text-secondary">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {recentActions.map(action => (
                      <tr key={action.id} className="border-b border-outline-variant/10 last:border-0 hover:bg-surface-container/30 transition-colors">
                        <td className="py-3 text-text-secondary text-xs flex items-center gap-1.5 whitespace-nowrap">
                          {action.timestamp?.toDate ? formatDistanceToNow(action.timestamp.toDate(), { addSuffix: true }) : "Just now"}
                        </td>
                        <td className="py-3 font-medium text-on-surface">
                          <span className="bg-surface-container px-2 py-0.5 rounded-md text-xs border border-outline-variant/30">
                            @{action.targetUsername || action.targetId}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={\`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap \${
                            action.action === "ban" ? "bg-danger/10 text-danger" :
                            action.action === "kick" ? "bg-orange-500/10 text-orange-600" :
                            action.action === "timeout" ? "bg-yellow-500/10 text-yellow-600" :
                            action.action === "warn" ? "bg-primary/10 text-primary" :
                            action.action === "delete_message" ? "bg-purple-500/10 text-purple-600" :
                            "bg-surface-variant text-text-secondary"
                          }\`}>
                            {action.action.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 text-text-secondary text-xs truncate max-w-[200px] sm:max-w-[300px]">
                          {action.reason || "No reason specified"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          )}
        </div>

        {/* 6. Navigation Cards Grid */}
        <div>
          <h2 className="text-xl font-black text-on-surface mb-4 mt-2">Manage SentinL</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {navigationCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={i}
                  whileHover={!card.locked ? { y: -3, scale: 1.01 } : {}}
                  whileTap={!card.locked ? { scale: 0.98 } : {}}
                  style={{ opacity: card.locked ? 0.6 : 1 }}
                >
                  <Link
                    to={card.path}
                    className={\`flex flex-col gap-4 p-6 bg-white/70 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm hover:shadow-md transition-all block group relative h-full \${card.locked ? 'cursor-not-allowed grayscale' : ''}\`}
                    onClick={(e) => {
                      if (card.locked) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className={\`w-12 h-12 rounded-2xl flex items-center justify-center \${card.bgColor} shadow-sm\`}>
                        <Icon className={\`w-6 h-6 \${card.iconColor}\`} />
                      </div>
                      {card.locked && (
                        <span className="text-[9px] font-black px-2 py-1 bg-surface-variant text-text-secondary rounded-lg border border-outline-variant/20 flex items-center gap-1">
                          <Crown className="w-3 h-3" /> PRO
                        </span>
                      )}
                      {!card.locked && (
                        <ArrowRight className="w-4 h-4 text-text-secondary/40 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-black text-sm text-on-surface group-hover:text-primary transition-colors">{card.title}</h3>
                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{card.description}</p>
                    </div>
                    {card.badge && !card.locked && (
                      <div className={\`text-[10px] font-bold px-2 py-1 rounded-lg w-fit mt-2 \${card.badge.color}\`}>
                        {card.badge.text}
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 7. Upgrade Banner */}
        <div className="w-full rounded-3xl overflow-hidden border border-primary/20 mt-2">
          <div className="bg-gradient-to-br from-primary/10 via-secondary/5 to-primary/10 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-black text-on-surface text-base">
                  Upgrade to unlock the full AI moderation suite
                </h3>
                <p className="text-xs text-text-secondary mt-1.5 max-w-lg leading-relaxed">
                  Pro gives you configurable AI confidence thresholds, automatic message deletion,
                  context-aware moderation, advanced analytics, custom bot commands, and social
                  media integrations — starting at $5/month.
                </p>

                <div className="flex flex-wrap gap-2 mt-3">
                  {["Auto-Delete", "Confidence Tuning", "Analytics", "Custom Commands", "Integrations"].map(f => (
                    <span
                      key={f}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/15"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <Link
              to="/pricing"
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors shrink-0 shadow-lg shadow-primary/20 whitespace-nowrap"
            >
              View Plans <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

      </div>
    );
  };

  if (!isPro) return <FreeDashboard />;
`;

fs.writeFileSync('src/components/Dashboard.tsx', beforeInjection + freeDashboardCode + gradeColor + '\n  return (\n    <div className="flex flex-col gap-6 md:gap-8 w-full pb-10">');
console.log("Successfully patched FreeDashboard implementation.")
