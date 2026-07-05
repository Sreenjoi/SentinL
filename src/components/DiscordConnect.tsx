import React, { useEffect, useState } from "react";
import { Link, Unlink, Loader2, ChevronDown, Users as UsersIcon, Check, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { motion, AnimatePresence } from "motion/react";
import { useSetupStatus } from "../hooks/useSetupStatus";

export function DiscordConnect({ userEmail }: { userEmail: string }) {
  const [user] = useAuthState(auth);
  const { discordProfile, refreshAccess, clearAccess, activeServerIds, accessSyncError } = useServer();
  const [connecting, setConnecting] = useState(false);

  const completeDiscordOAuth = React.useCallback(() => {
    setConnecting(false);
    refreshAccess();
  }, [refreshAccess]);

  useEffect(() => {
    if (discordProfile) {
      setConnecting(false);
    }
  }, [discordProfile]);

  const handleDisconnect = async () => {
    try {
      setConnecting(true);
      clearAccess(); // MUST wrap up listeners before severing access
      
      // Allow React to flush state updates and run useEffect cleanups to detach active onSnapshot listeners
      // Otherwise Firestore immediately throws permission-denied when the backend strips the rights.
      await new Promise(resolve => setTimeout(resolve, 100));

      if (activeServerIds && activeServerIds.length > 0) {
        const token = user ? await user.getIdToken() : null;
        for (const id of activeServerIds) {
          if (token) {
            const res = await fetch(`/api/guilds/${id}/activation`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ active: false })
            });
            
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              console.error(`Failed to deactivate server ${id}:`, errData);
              toast.error(errData.error || `Failed to deactivate server ${id}.`);
              throw new Error(`Activation API failed for ${id}`);
            }
          }
        }
      }

      const modRef = doc(db, "moderators", userEmail);
      await setDoc(
        modRef,
        {
          discordId: null,
          discordUsername: null,
          discordAvatar: null,
          serverIds: [],
          serverNames: {},
          activeServerId: null,
          activeServerIds: [],
        },
        { merge: true },
      );

      await refreshAccess();
      setConnecting(false);
    } catch (err) {
      console.error("Error disconnecting:", err);
      handleFirestoreError(err, OperationType.WRITE, `moderators/${userEmail}`);
      setConnecting(false);
    }
  };

  useEffect(() => {
    const isValidOAuthPayload = (payload: any) =>
      payload &&
      typeof payload === "object" &&
      typeof payload.id === "string" &&
      typeof payload.username === "string" &&
      (typeof payload.avatar === "string" || payload.avatar === null || payload.avatar === undefined) &&
      Array.isArray(payload.serverIds) &&
      payload.serverIds.every((id: any) => typeof id === "string") &&
      payload.serverNames &&
      typeof payload.serverNames === "object" &&
      !Array.isArray(payload.serverNames) &&
      Object.values(payload.serverNames).every((name: any) => typeof name === "string");

    const consumeStoredOAuthSuccess = () => {
      try {
        const raw = localStorage.getItem("sentinl_discord_oauth_success");
        if (!raw) return false;
        const payload = JSON.parse(raw);
        const completedAt = typeof payload.completedAt === "number" ? payload.completedAt : 0;
        if (Date.now() - completedAt > 5 * 60 * 1000) {
          localStorage.removeItem("sentinl_discord_oauth_success");
          return false;
        }
        if (!isValidOAuthPayload(payload)) return false;
        localStorage.removeItem("sentinl_discord_oauth_success");
        completeDiscordOAuth();
        return true;
      } catch {
        localStorage.removeItem("sentinl_discord_oauth_success");
        return false;
      }
    };

    const consumeStoredOAuthError = () => {
      try {
        const raw = localStorage.getItem("sentinl_discord_oauth_error");
        if (!raw) return false;
        const payload = JSON.parse(raw);
        const completedAt = typeof payload.completedAt === "number" ? payload.completedAt : 0;
        localStorage.removeItem("sentinl_discord_oauth_error");
        if (Date.now() - completedAt > 5 * 60 * 1000) return false;
        setConnecting(false);
        toast.error(payload.message || "Discord connection failed. Please try again.");
        return true;
      } catch {
        localStorage.removeItem("sentinl_discord_oauth_error");
        return false;
      }
    };

    consumeStoredOAuthSuccess();
    consumeStoredOAuthError();

    const handleMessage = (event: MessageEvent) => {
      let isAllowed = false;
      const allowedOrigins = [window.location.origin];
      const configuredUrl = import.meta.env.VITE_APP_URL;
      
      if (configuredUrl) {
        try { allowedOrigins.push(new URL(configuredUrl).origin); } catch(e){}
      }
      
      if (allowedOrigins.includes(event.origin)) {
        isAllowed = true;
      } else if (import.meta.env.VITE_AI_STUDIO_PREVIEW === "true") {
        const exactKnownOrigins = [
          "https://aistudio.google.com",
          "https://ai.google.dev",
          "https://ai.studio",
          "https://googleproject0-1.appspot.com"
        ];
        if (exactKnownOrigins.includes(event.origin)) {
          isAllowed = true;
        }
      }
      
      if (!isAllowed) {
        return;
      }
      
      if (typeof event.data === "object" && event.data !== null && event.data.type === "OAUTH_AUTH_SUCCESS") {
        const payload = event.data.payload;
        if (isValidOAuthPayload(payload)) {
           completeDiscordOAuth();
        }
      } else if (typeof event.data === "object" && event.data !== null && event.data.type === "OAUTH_AUTH_ERROR") {
        setConnecting(false);
        toast.error(event.data.error?.message || "Discord connection failed. Please try again.");
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "sentinl_discord_oauth_success") {
        consumeStoredOAuthSuccess();
      } else if (event.key === "sentinl_discord_oauth_error") {
        consumeStoredOAuthError();
      }
    };
    const handleFocus = () => {
      consumeStoredOAuthSuccess();
      consumeStoredOAuthError();
    };
    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [completeDiscordOAuth]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      try {
        localStorage.removeItem("sentinl_discord_oauth_success");
        localStorage.removeItem("sentinl_discord_oauth_error");
      } catch {}
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error("Firebase sign-in is not ready yet. Please wait a moment and try again.");
      }
      const res = await fetch(
        `/api/auth/discord/url`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Received non-JSON response from server.");
      }
      if (!res.ok)
        throw new Error("Failed to get Discord URL: " + res.statusText);
      const data = await res.json();
      const authWindow = window.open(
        data.url,
        "discord_oauth",
        "width=500,height=750",
      );
      if (!authWindow) {
        toast.error(
          "Please allow popups for this site to connect your Discord account.",
        );
        setConnecting(false);
        return;
      }
      const startedAt = Date.now();
      const closeWatcher = window.setInterval(() => {
        try {
          const raw = localStorage.getItem("sentinl_discord_oauth_success");
          if (raw) {
            localStorage.removeItem("sentinl_discord_oauth_success");
            window.clearInterval(closeWatcher);
            setConnecting(false);
            refreshAccess();
            return;
          }
          const errorRaw = localStorage.getItem("sentinl_discord_oauth_error");
          if (errorRaw) {
            const payload = JSON.parse(errorRaw);
            localStorage.removeItem("sentinl_discord_oauth_error");
            window.clearInterval(closeWatcher);
            setConnecting(false);
            toast.error(payload?.message || "Discord connection failed. Please try again.");
            return;
          }
        } catch {}
        if (authWindow.closed) {
          window.clearInterval(closeWatcher);
          setConnecting(false);
          refreshAccess();
          return;
        }
        if (Date.now() - startedAt > 45000) {
          window.clearInterval(closeWatcher);
          setConnecting(false);
          toast.error("Discord connection timed out. Please try again.");
        }
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error(
        "Error initiating Discord connection: " +
          (err instanceof Error ? err.message : String(err)),
      );
      setConnecting(false);
    }
  };

  if (discordProfile) {
    return (
      <div className="mb-3 transition-all duration-300">
        <div className="flex items-center glass-panel rounded-2xl p-3">
          {discordProfile.avatar ? (
            <img
              src={
                discordProfile.avatar.startsWith("http")
                  ? discordProfile.avatar
                  : `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}${discordProfile.avatar.startsWith("a_") ? ".gif" : ".png"}`
              }
              alt={discordProfile.username}
              className="w-8 h-8 rounded-xl shrink-0 shadow-lg shadow-[#5865F2]/20 object-cover mr-3"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-[#5865F2] flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-[#5865F2]/20 mr-3">
              {discordProfile.username[0].toUpperCase()}
            </div>
          )}
          {true && (
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <div>
                <div className="text-[9px] text-[#5865F2] font-black uppercase tracking-widest leading-none mb-1">
                  Linked Account
                </div>
                <div className="text-[13px] text-on-surface truncate font-black tracking-tight">
                  {discordProfile.username}
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={connecting}
                className="group p-1.5 rounded-lg transition-all active:scale-90 hover:bg-danger/10"
                title="Disconnect from Discord"
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                ) : (
                  <>
                    <Link className="w-4 h-4 text-success group-hover:hidden transition-all" />
                    <Unlink className="w-4 h-4 text-danger hidden group-hover:block transition-all" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 transition-all duration-300">
      <div className="glass-panel rounded-[1.5rem] p-4 text-center">
        {true && (
          <>
            <h3 className="text-xs font-black text-on-surface uppercase tracking-widest mb-2 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Auth Portal
            </h3>
            <p className="text-[11px] font-medium text-text-secondary mb-4 leading-relaxed">
              Link your identity to the Discord ecosystem to activate monitoring
              nodes.
            </p>
          </>
        )}
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl text-[11px] font-black tracking-widest uppercase transition-all shadow-lg shadow-[#5865F2]/20 active:scale-[0.98] disabled:opacity-50 py-2.5"
          title={""}
        >
          {connecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Link className="w-4 h-4 mr-2" />
          )}
          {!false && "Connect Discord"}
        </button>
        {accessSyncError && (
          <p className="mt-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-danger">
            {accessSyncError}
          </p>
        )}
      </div>
    </div>
  );
}

export function ServerSelector() {
  const navigate = useNavigate();
  const {
    authorizedServers,
    selectedServerId,
    setSelectedServerId,
    tier,
    isBetaTester,
    botGuilds,
    user,
    discordProfile,
    serverClaimedBy,
    isSharedServer,
    refreshAccess,
    isTrial,
    maxSlots,
  } = useServer();
  const setupStatus = useSetupStatus();

  const [claiming, setClaiming] = useState(false);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [serverHealthMap, setServerHealthMap] = useState<Record<string, { grade: string, score: number | null, totalMessages?: number, logChannelSet?: boolean, hasKeywords?: boolean, botTested?: boolean }>>({});

  useEffect(() => {
    if (authorizedServers.length === 0) {
      setServerHealthMap({});
      return;
    }

    const unsubs = authorizedServers.map(server => {
      return onSnapshot(doc(db, "servers", server.id), (docSnap) => {
        setServerHealthMap(prev => {
          const next = { ...prev };
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.healthWidget) {
              const score = parseFloat(data.healthWidget.lastScore);
              next[server.id] = {
                grade: data.healthWidget.lastGrade || "N/A",
                score: isNaN(score) ? null : score,
                totalMessages: data.healthWidget.totalMessages || 0,
                logChannelSet: !!data.logChannelId,
                hasKeywords: Array.isArray(data.keywords) && data.keywords.length > 0,
                botTested: !!data.botTested
              };
            } else {
              next[server.id] = { grade: "N/A", score: null, totalMessages: 0, logChannelSet: !!data.logChannelId, hasKeywords: Array.isArray(data.keywords) && data.keywords.length > 0, botTested: !!data.botTested };
            }
          } else {
            next[server.id] = { grade: "N/A", score: null, totalMessages: 0, logChannelSet: false, hasKeywords: false, botTested: false };
          }
          return next;
        });
      }, (error) => {
        console.error(`Error fetching server ${server.id}:`, error);
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [authorizedServers]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, `subscriptions/${user.uid}`), (docSnap) => {
      if (docSnap.exists()) {
        setUserSubscription(docSnap.data());
      } else {
        setUserSubscription(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `subscriptions/${user.uid}`);
    });
    return () => unsub();
  }, [user]);

  if (authorizedServers.length === 0) {
    return null;
  }

  const isOwnedByMe = userSubscription?.linkedServerIds?.includes(selectedServerId) || serverClaimedBy === user?.email;

  const handleClaimServer = async () => {
    if (!selectedServerId || !discordProfile || !user) return;

    const isAuthorized = authorizedServers.some(
      (server) => server.id === selectedServerId,
    );
    if (!isAuthorized) {
      toast.error(
        "You need Discord's Manage Server permission to claim this server.",
      );
      return;
    }

    setClaiming(true);
    try {
      const token = await user?.getIdToken();
      const response = await fetch("/api/claim-server", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          serverId: selectedServerId,
          userId: user.uid,
          discordId: discordProfile.id,
          serverName: authorizedServers.find(s => s.id === selectedServerId)?.name || "",
        }),
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(
          `Server returned non-JSON response: ${text.substring(0, 100)}`,
        );
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result?.error || result?.message || "Failed to claim server",
        );
      }

      await refreshAccess();
      toast.success("Server claimed successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error("Error claiming server: " + err.message);
    } finally {
      setClaiming(false);
    }
  };

  const selectedServer = authorizedServers.find(s => s.id === selectedServerId);

  const isPaidPlan = isBetaTester || isTrial || tier === "pro_1" || tier === "pro_3" || tier === "premium";
  const tierName = isBetaTester
    ? "Pro beta"
    : isSharedServer && isPaidPlan
      ? "Pro shared"
    : isSharedServer
      ? "Free shared"
    : isTrial
      ? "Pro trial"
        : tier === "pro_3" || tier === "premium"
          ? "Premium"
          : tier === "pro_1"
            ? "Pro"
            : "Free";
  const tierSlots = tier === "pro_3" || tier === "premium"
    ? `${maxSlots || 3} server slots`
    : "1 server slot";
  const botStatusLabel = setupStatus.botRuntimeStatus === "online"
    ? "Online"
    : setupStatus.botRuntimeStatus === "offline"
      ? "Offline"
      : "Setup";
  const botStatusClass = setupStatus.botRuntimeStatus === "online"
    ? "bg-success/10 text-success border-success/20"
    : setupStatus.botRuntimeStatus === "offline"
      ? "bg-danger/10 text-danger border-danger/20"
      : "bg-warning/10 text-warning border-warning/20";

  return (
    <div className="mb-4 transition-all duration-300">
      <div className="relative group">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
          className="w-full glass-panel rounded-2xl text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm group-hover:bg-white cursor-pointer px-3 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-black tracking-tight">
                {selectedServer ? selectedServer.name : "Select a server"}
              </div>
              <div className="mt-1 truncate text-[10px] font-bold text-text-secondary">
                <span className={isPaidPlan ? "text-primary" : undefined}>{tierName}</span>
                <span> &middot; {tierSlots}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black ${botStatusClass}`}>
                {botStatusLabel}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-surface-variant rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${setupStatus.isAllDone ? "bg-success" : "bg-primary"}`}
              style={{ width: `${setupStatus.progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-black text-text-secondary">
            <span>Setup health</span>
            <span>{setupStatus.completedCount}/{setupStatus.totalCount} done</span>
          </div>
        </div>

        <AnimatePresence>
          {isOpen && (
            <>
              {/* Invisible overlay to close dropdown on click outside */}
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
              >
                {authorizedServers.map((server) => {
                  const hasBot = botGuilds?.includes(server.id);
                  const sHealth = serverHealthMap[server.id];

                  return (
                    <div
                      key={server.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedServerId(server.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-xs font-semibold hover:bg-surface-container flex items-center justify-between transition-colors cursor-pointer ${selectedServerId === server.id ? "bg-surface-variant text-primary font-black" : "text-on-surface"}`}
                    >
                      <span className="truncate pr-2">{server.name}</span>
                      {hasBot ? (
                        sHealth?.grade ? (
                          <button 
                            type="button"
                            title="Community Health Score"
                            onClick={(e) => {
                              // If they specifically click the grade badge
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedServerId(server.id);
                              setIsOpen(false);
                              navigate("/");
                              setTimeout(() => {
                                window.location.hash = "health";
                              }, 10);
                            }}
                            className={`flex items-center shrink-0 justify-center gap-1.5 px-2 py-0.5 rounded font-black text-[10px] uppercase shadow-sm border transition-transform hover:scale-105 active:scale-95 ${
                              sHealth.grade === "N/A" 
                                ? "bg-outline-variant/30 text-text-secondary border-outline-variant/30"
                                : sHealth.score !== null && sHealth.score >= 85 
                                  ? "bg-primary/10 text-primary border-primary/20"
                                  : sHealth.score !== null && sHealth.score >= 60
                                    ? "bg-warning/10 text-warning border-warning/20"
                                    : "bg-danger/10 text-danger border-danger/20"
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              sHealth.grade === "N/A"
                                ? "bg-text-secondary/50 animate-pulse"
                                : sHealth.score !== null && sHealth.score >= 85 
                                  ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                                  : sHealth.score !== null && sHealth.score >= 60
                                    ? "bg-warning"
                                    : "bg-danger"
                            }`} />
                            {sHealth.grade === "N/A"
                              ? `${Math.min(sHealth.totalMessages || 0, 500)}/500`
                              : sHealth.grade}
                          </button>
                        ) : (
                          <span title="Bot Invited" className="shrink-0 cursor-help text-success flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </span>
                        )
                      ) : (
                        <span className="shrink-0 text-[8px] bg-text-secondary/5 text-text-secondary border border-text-secondary/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-black">
                          Setup Required
                        </span>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {selectedServerId && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {isSharedServer && !isOwnedByMe ? (
            <div className="flex-1 px-4 py-2 bg-surface-container/30 border border-outline-variant/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center justify-center gap-2">
              <UsersIcon className="w-3 h-3 opacity-50" />
              Shared
            </div>
          ) : isOwnedByMe ? (
            <div className="flex-1 px-4 py-2 bg-success/10 border border-success/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-success flex items-center justify-center gap-2">
              <Check className="w-3 h-3" />
              Claimed
            </div>
          ) : (
            <button
              disabled={claiming}
              onClick={handleClaimServer}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {claiming ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              Claim Server
            </button>
          )}
        </div>
      )}
    </div>
  );
}




