import React, { useEffect, useState } from "react";
import { Link, Unlink, Loader2, ChevronDown, Users as UsersIcon, Check, Shield, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { collection, query, where, documentId, doc, setDoc, onSnapshot } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import { useServer } from "../context/ServerContext";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { motion, AnimatePresence } from "motion/react";

export function DiscordConnect({ userEmail }: { userEmail: string }) {
  const [user] = useAuthState(auth);
  const { discordProfile, refreshAccess, clearAccess, activeServerIds } = useServer();
  const [connecting, setConnecting] = useState(false);

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
        if (
          payload && 
          typeof payload === "object" && 
          typeof payload.id === "string" &&
          typeof payload.username === "string" &&
          (typeof payload.avatar === "string" || payload.avatar === null) &&
          Array.isArray(payload.serverIds) &&
          payload.serverIds.every((id: any) => typeof id === "string") &&
          Array.isArray(payload.serverNames) &&
          payload.serverNames.every((name: any) => typeof name === "string")
        ) {
           setConnecting(false);
           refreshAccess();
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refreshAccess]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const originUrl = window.location.origin;
      const token = await auth.currentUser?.getIdToken();
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
      }
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
  } = useServer();

  const [claiming, setClaiming] = useState(false);
  const [userSubscription, setUserSubscription] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [serverHealthMap, setServerHealthMap] = useState<Record<string, { grade: string, score: number | null }>>({});

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
                totalMessages: data.healthWidget.totalMessages || 0
              };
            } else {
              next[server.id] = { grade: "N/A", score: null, totalMessages: 0 };
            }
          } else {
            next[server.id] = { grade: "N/A", score: null, totalMessages: 0 };
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
        "Unauthorized: You do not have Manage Server permissions for this guild.",
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

  const selectedServerHealth = selectedServerId ? serverHealthMap[selectedServerId] : null;

  return (
    <div className="mb-4 transition-all duration-300">
      {true && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="text-[9px] text-text-secondary font-black uppercase tracking-[0.2em]">
            Select Server
          </div>
          {tier !== "free" && (
            <span className="text-[8px] px-1.5 py-0.5 rounded font-black bg-primary text-white uppercase tracking-wider shadow-sm">
              {isBetaTester ? "PRO (Beta Test Server)" : isSharedServer ? "PRO (Shared)" : isTrial ? "PRO Trial" : "PRO"}
            </span>
          )}
        </div>
      )}

      <div className="relative group">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between glass-panel rounded-2xl text-xs text-on-surface font-black tracking-tight focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm group-hover:bg-white cursor-pointer px-4 py-3"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="truncate pr-2">
              {selectedServer ? selectedServer.name : "Select a server"}
            </span>
            {selectedServer && botGuilds?.includes(selectedServer.id) && selectedServerHealth?.grade ? (
              <button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate("/");
                  setTimeout(() => {
                    window.location.hash = "health";
                  }, 10);
                }}
                title="Community Health Score"
                className={`flex items-center shrink-0 justify-center gap-1.5 px-2 py-0.5 rounded font-black text-[10px] uppercase shadow-sm border transition-transform hover:scale-105 active:scale-95 ${
                  selectedServerHealth.grade === "N/A" 
                    ? "bg-outline-variant/30 text-text-secondary border-outline-variant/30"
                    : selectedServerHealth.score !== null && selectedServerHealth.score >= 85 
                      ? "bg-primary/10 text-primary border-primary/20"
                      : selectedServerHealth.score !== null && selectedServerHealth.score >= 60
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-danger/10 text-danger border-danger/20"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${
                  selectedServerHealth.grade === "N/A"
                    ? "bg-text-secondary/50 animate-pulse"
                    : selectedServerHealth.score !== null && selectedServerHealth.score >= 85 
                      ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                      : selectedServerHealth.score !== null && selectedServerHealth.score >= 60
                        ? "bg-warning"
                        : "bg-danger"
                }`} />
                {selectedServerHealth.grade === "N/A"
                  ? `${Math.min(selectedServerHealth.totalMessages || 0, 500)}/500`
                  : selectedServerHealth.grade}
              </button>
            ) : selectedServer && botGuilds?.includes(selectedServer.id) ? (
              <span title="Bot Invited" className="shrink-0 cursor-help text-success flex items-center justify-center">
                <Check className="w-4 h-4" />
              </span>
            ) : selectedServer && (
              <span className="shrink-0 text-[8px] bg-text-secondary/5 text-text-secondary border border-text-secondary/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-black">
                Setup Required
              </span>
            )}
          </div>
          <ChevronDown className={`shrink-0 w-4 h-4 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`} />
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
