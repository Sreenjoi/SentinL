import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  limit,
  getDocs,
  updateDoc,
  or,
  and,
} from "firebase/firestore";
import { getDailyAiLimitForTier } from "../utils/planHelper";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrorHandler";
import { toast } from "sonner";
import { ShieldAlert, Flag } from "lucide-react";

interface ServerContextType {
  selectedServerId: string | null;
  setSelectedServerId: (id: string) => void;
  authorizedServers: { id: string; name: string }[];
  tier: "free" | "premium" | "pro_1" | "pro_3" | null;
  userTier: "free" | "premium" | "pro_1" | "pro_3" | null;
  userIsTrial: boolean;
  isPro: boolean;
  isBetaTester: boolean;
  loading: boolean;
  discordProfile: { id: string; username: string; avatar?: string } | null;
  activeServerId: string | null; // Keep for backward compat, returns first active
  activeServerIds: string[];
  activeQuotaCount: number;
  isServerActiveGlobally: boolean;
  serverClaimedBy: string | null;
  isSharedServer: boolean | null;
  maxSlots: number;
  botGuilds: string[];
  accessSyncError: string | null;
  botPresenceError: string | null;
  intentsWarning: boolean;
  botPermissions: Record<string, boolean> | null;
  setBotPermissions: (perms: Record<string, boolean> | null) => void;
  refreshAccess: () => Promise<void>;
  refreshTier: () => Promise<void>;
  clearAccess: () => void;
  user: any;
  isTrial: boolean;
  serverEntitlementExpiry: string | null;
  serverEntitlementStatus: string | null;
  serverEntitlementSource: string | null;
  pendingFlagsCount: number;
  pendingReportsCount: number;
  dailyAICount: number;
  dailyAiLimit: number;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const tierFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Provide a dummy object if auth is missing to prevent hook crashes
  const dummyAuth = {
    onIdTokenChanged: () => () => {},
    onAuthStateChanged: () => () => {},
    currentUser: null,
  };
  const [user, authLoading] = useAuthState((auth as any) || dummyAuth);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(
    () => {
      try {
        return localStorage.getItem("selectedServerId");
      } catch (e) {
        return null;
      }
    },
  );
  const [authorizedServers, setAuthorizedServers] = useState<
    { id: string; name: string }[]
  >([]);
  const [activeServerIds, setActiveServerIds] = useState<string[]>([]);
  const [activeQuotaCount, setActiveQuotaCount] = useState<number>(0);
  const [isServerActiveGlobally, setIsServerActiveGlobally] = useState(false);
  const [serverClaimedBy, setServerClaimedBy] = useState<string | null>(null);
  const [pendingFlagsCount, setPendingFlagsCount] = useState<number>(0);
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);
  const [dailyAICount, setDailyAICount] = useState<number>(0);
  const [dailyAiLimit, setDailyAiLimit] = useState<number>(300);
  const emailSyncedRef = useRef(false);
  const usageWarningToastShownRef = useRef(false);

  useEffect(() => {
    if (dailyAiLimit > 0) {
      const usageRatio = dailyAICount / dailyAiLimit;
      if (usageRatio >= 0.8 && !usageWarningToastShownRef.current) {
        toast.warning(
          `API Usage Alert: You have used ${Math.floor(usageRatio * 100)}% of your daily AI limit.`
        );
        usageWarningToastShownRef.current = true;
      } else if (usageRatio < 0.8) {
        usageWarningToastShownRef.current = false;
      }
    }
  }, [dailyAICount, dailyAiLimit]);

  const [intentsWarning, setIntentsWarning] = useState(false);
  const [botGuilds, setBotGuilds] = useState<string[]>([]);
  const [accessSyncError, setAccessSyncError] = useState<string | null>(null);
  const [botPresenceError, setBotPresenceError] = useState<string | null>(null);

  useEffect(() => {
    function calculateQuota() {
      if (!activeServerIds) {
        setActiveQuotaCount(0);
        return;
      }
      setActiveQuotaCount(activeServerIds.length);
    }
    calculateQuota();
  }, [activeServerIds]);

  // Persist selectedServerId
  useEffect(() => {
    try {
      if (selectedServerId) {
        localStorage.setItem("selectedServerId", selectedServerId);
      } else {
        localStorage.removeItem("selectedServerId");
      }
    } catch (e) {
      console.warn("localStorage not available", e);
    }
  }, [selectedServerId]);

  // Read ?server= param from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const serverParam = params.get("server");
    if (serverParam && authorizedServers.some((s) => s.id === serverParam)) {
      setSelectedServerId(serverParam);
    }
  }, [authorizedServers]);

  const [tier, setTier] = useState<
    "free" | "premium" | "pro_1" | "pro_3" | null
  >(null);
  const [userTier, setUserTier] = useState<
    "free" | "premium" | "pro_1" | "pro_3" | null
  >(null);
  const [userIsTrial, setUserIsTrial] = useState(false);
  const [isBetaTester, setIsBetaTester] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [serverEntitlementExpiry, setServerEntitlementExpiry] = useState<string | null>(null);
  const [serverEntitlementStatus, setServerEntitlementStatus] = useState<string | null>(null);
  const [serverEntitlementSource, setServerEntitlementSource] = useState<string | null>(null);
  const [maxServersSetting, setMaxServersSetting] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [botPermissions, setBotPermissions] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [discordProfile, setDiscordProfile] = useState<{
    id: string;
    username: string;
    avatar?: string;
  } | null>(null);

  const discordProfileRef = useRef<{ id: string; username: string; avatar?: string } | null>(null);
  const authorizedServersRef = useRef<{ id: string; name: string }[]>([]);
  const activeServerIdsRef = useRef<string[]>([]);
  const selectedServerIdRef = useRef<string | null>(null);

  useEffect(() => {
    discordProfileRef.current = discordProfile;
  }, [discordProfile]);

  useEffect(() => {
    authorizedServersRef.current = authorizedServers;
  }, [authorizedServers]);

  useEffect(() => {
    activeServerIdsRef.current = activeServerIds;
  }, [activeServerIds]);

  useEffect(() => {
    selectedServerIdRef.current = selectedServerId;
  }, [selectedServerId]);

  const fetchBotStatus = async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) {
        return;
      }
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (typeof data?.intentsWarning === "boolean") {
          setIntentsWarning(data.intentsWarning);
        }
      }
    } catch (e) {
      // Ignored
    }
  };

  const fetchBotGuilds = async (overrideServerIds?: string[]) => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const knownServerIds = Array.from(
        new Set([
          ...(overrideServerIds || []),
          ...authorizedServersRef.current.map((server) => server.id),
          ...activeServerIdsRef.current,
          ...(selectedServerIdRef.current ? [selectedServerIdRef.current] : []),
        ]),
      );
      if (knownServerIds.length === 0 && !discordProfileRef.current) return;
      const qs = knownServerIds.length > 0
        ? `?ids=${encodeURIComponent(knownServerIds.join(","))}`
        : "";
      const res = await fetch(`/api/bot-guilds${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok) {
          setBotPresenceError(data?.error || "Could not refresh bot server status.");
          return;
        }
        if (Array.isArray(data.guilds)) {
          setBotGuilds(data.guilds);
          setBotPresenceError(null);
        }
      } else {
        console.warn("API returned non-JSON for bot-guilds:", await res.text());
        setBotPresenceError("Could not refresh bot server status.");
      }
    } catch (e) {
      setBotPresenceError("Could not refresh bot server status.");
    }
  };

  const clearAccess = useCallback(() => {
    setAuthorizedServers([]);
    setSelectedServerId(null);
    setActiveServerIds([]);
    setTier(null);
    setDiscordProfile(null);
    setAccessSyncError(null);
    setBotPresenceError(null);
    setLoading(false);
  }, []);

  const applyModeratorAccess = useCallback(async (data: any) => {
    const serverIds: string[] = Array.isArray(data?.serverIds) ? data.serverIds : [];
    const serverNames: Record<string, string> =
      data?.serverNames && typeof data.serverNames === "object" && !Array.isArray(data.serverNames)
        ? data.serverNames
        : {};

    if (Array.isArray(data?.activeServerIds)) {
      setActiveServerIds(Array.from(new Set(data.activeServerIds)));
    } else if (data?.activeServerId) {
      setActiveServerIds([data.activeServerId]);
    } else {
      setActiveServerIds([]);
    }

    const servers = serverIds.map((id) => ({
      id,
      name: serverNames[id] || `Server ${id.substring(0, 8)}`,
    }));

    setAuthorizedServers(servers);

    let storedId = null;
    try {
      storedId = localStorage.getItem("selectedServerId");
    } catch (e) {}
    const isStoredValid = servers.some((s) => s.id === storedId);

    setSelectedServerId((prevSelected) => {
      if (!prevSelected && servers.length > 0) {
        return isStoredValid && storedId ? storedId : servers[0].id;
      } else if (
        prevSelected &&
        !servers.some((s) => s.id === prevSelected)
      ) {
        return servers.length > 0 ? servers[0].id : null;
      }
      return prevSelected;
    });

    if (data?.discordId && data?.discordUsername) {
      let latestAvatar = data.discordAvatar;
      const currentProfile = discordProfileRef.current;
      if (!latestAvatar && !currentProfile?.avatar) {
        try {
          const res = await fetch(`/api/discord/user/${data.discordId}`);
          if (res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const { avatarUrl } = await res.json();
              if (avatarUrl) latestAvatar = avatarUrl;
            }
          }
        } catch (e) {}
      }

      setDiscordProfile((prevProfile) => {
        if (
          !prevProfile ||
          prevProfile.id !== data.discordId ||
          prevProfile.username !== data.discordUsername ||
          (latestAvatar && latestAvatar !== prevProfile.avatar)
        ) {
          return {
            id: data.discordId,
            username: data.discordUsername,
            avatar: latestAvatar || prevProfile?.avatar,
          };
        }
        return prevProfile;
      });
      fetchBotGuilds(serverIds);
    } else {
      setDiscordProfile(null);
    }

    setAccessSyncError(null);
  }, []);

  useEffect(() => {
    fetchBotStatus();
    fetchBotGuilds();
    const interval = setInterval(() => {
      fetchBotStatus();
      fetchBotGuilds();
    }, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const refreshBotPresence = () => {
      if (document.visibilityState === "visible") {
        fetchBotStatus();
        fetchBotGuilds();
      }
    };

    window.addEventListener("focus", refreshBotPresence);
    document.addEventListener("visibilitychange", refreshBotPresence);

    return () => {
      window.removeEventListener("focus", refreshBotPresence);
      document.removeEventListener("visibilitychange", refreshBotPresence);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !user.email) {
      emailSyncedRef.current = false;
      clearAccess();
      return;
    }

    // Call the backend to sync the email and migrate Discord connection if the email was changed
    if (!emailSyncedRef.current) {
      emailSyncedRef.current = true;
      user.getIdToken().then((token) => {
        fetch("/api/user/sync-email", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => console.error("Failed to sync email:", err));
      });
    }

    const unsubMod = onSnapshot(
      doc(db, "moderators", user.email),
      async (modDoc) => {
        try {
          if (modDoc.exists()) {
            await applyModeratorAccess(modDoc.data());
          } else {
            setAuthorizedServers([]);
            setDiscordProfile(null);
            setActiveServerIds([]);
            setAccessSyncError(null);
          }
        } catch (error) {
          console.error("Error processing moderator access snapshot:", error);
        }
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `moderators/${user.email}`,
        );
        setAccessSyncError("Firebase quota or permissions blocked dashboard access sync. Try again after quota resets.");
        setLoading(false);
      },
    );

    return () => unsubMod();
  }, [user, authLoading, applyModeratorAccess]);

  async function fetchAccess() {
    await fetchBotStatus();
    if (user?.email) {
      try {
        const snap = await getDoc(doc(db, "moderators", user.email));
        if (snap.exists()) {
          await applyModeratorAccess(snap.data());
        }
      } catch (error) {
        setAccessSyncError("Firebase quota or permissions blocked dashboard access sync. Try again after quota resets.");
      }
    }
    await fetchBotGuilds();
    await fetchTierData();
  }

  useEffect(() => {
    if (!selectedServerId) {
      setIsServerActiveGlobally(false);
      setServerClaimedBy(null);
      setPendingFlagsCount(0);
      setPendingReportsCount(0);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "servers", selectedServerId),
      (docSnap) => {
        if (docSnap.exists()) {
          const d = docSnap.data();
          setIsServerActiveGlobally(!!d.active);
          setServerClaimedBy(d.ownerEmail || null);
          setDailyAICount(d.dailyAICount || 0);
        } else {
          setIsServerActiveGlobally(false);
          setServerClaimedBy(null);
          setDailyAICount(0);
        }
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `servers/${selectedServerId}`,
        );
      },
    );

    let flagsCount = 0;
    let reportsCount = 0;

    const qFlags = query(
      collection(db, "flaggedMessages"),
      where("serverId", "==", selectedServerId),
      where("status", "==", "pending")
    );

    const qReports = query(
      collection(db, `servers/${selectedServerId}/reports`),
      where("status", "==", "pending")
    );

    let isInitialFlagsLoad = true;
    const unsubFlags = onSnapshot(qFlags, (snapshot) => {
      setPendingFlagsCount(snapshot.size);
      if (!isInitialFlagsLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            toast(`SentinL Alert: Message flagged locally`, {
              description: `A message from @${data.authorUsername || data.author || 'Unknown'} was flagged.`,
              icon: <ShieldAlert className="w-5 h-5 text-orange-500" />,
              duration: 6000,
            });
          }
        });
      }
      isInitialFlagsLoad = false;
    }, (err) => console.error("Global pending flags snap error", err));

    let isInitialReportsLoad = true;
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      setPendingReportsCount(snapshot.size);
      if (!isInitialReportsLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            toast(`SentinL Alert: New user report`, {
              description: `Report filed by @${data.reporterUsername || data.reporter || 'Unknown'}.`,
              icon: <Flag className="w-5 h-5 text-orange-500" />,
              duration: 6000,
            });
          }
        });
      }
      isInitialReportsLoad = false;
    }, (err) => console.error("Global pending reports snap error", err));

    return () => {
      unsub();
      unsubFlags();
      unsubReports();
    };
  }, [selectedServerId]);

  const fetchTierData = useCallback(async () => {
      if (!selectedServerId || !user) {
        setTier(null);
        setUserTier(null);
        setIsBetaTester(false);
        setServerEntitlementExpiry(null);
        setServerEntitlementStatus(null);
        setServerEntitlementSource(null);
        return;
      }
      try {
        // 1. Fetch tier from our new reliable API endpoint
        const token = await user.getIdToken();
        const res = await fetch(`/api/guilds/${selectedServerId}/tier`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
           const contentType = res.headers.get("content-type");
           if (contentType && contentType.includes("application/json")) {
              const data = await res.json();
              const finalTier = data.tier || "free";
              const actualUserTier = data.userTier || "free";
              
              setTier(finalTier);
              setUserTier(actualUserTier);
              setUserIsTrial(data.userIsTrial || false);
              setIsBetaTester(data.isBetaTester || false);
              if (data.maxServersSetting !== undefined) setMaxServersSetting(data.maxServersSetting);
              setIsTrial(data.isTrial || false);
              setServerEntitlementExpiry(data.entitlementExpiry || null);
              setServerEntitlementStatus(data.entitlementStatus || null);
              setServerEntitlementSource(data.entitlementSource || null);
              setDailyAiLimit(getDailyAiLimitForTier(finalTier, actualUserTier));
           } else {
              throw new Error("API returned non-JSON for tier");
           }
        } else {
           throw new Error(`API returned status ${res.status}`);
        }
      } catch (error: any) {
        console.error("Error fetching tier:", error);
        // On failure, set to null (unknown) rather than "free"
        setTier(null);
        setUserTier(null);
        setIsBetaTester(false);
        setMaxServersSetting(null);
        setIsTrial(false);
        setServerEntitlementExpiry(null);
        setServerEntitlementStatus(null);
        setServerEntitlementSource(null);
      }

    // Schedule automatic tier refresh at expiry time if applicable
    try {
      if (!sessionStorage.getItem(`tier_refresh_scheduled_${user.uid}`)) {
        const fetchAndSchedule = async () => {
          try {
            const userSubDoc = await getDoc(doc(db, "subscriptions", user.uid));
            if (userSubDoc.exists()) {
              const data = userSubDoc.data();
              const expiresAt = data.expiresAt?.toDate
                ? data.expiresAt.toDate()
                : data.expiresAt
                  ? new Date(data.expiresAt)
                  : null;
              const trialEnd = data.trialEnd?.toDate
                ? data.trialEnd.toDate()
                : data.trialEnd
                  ? new Date(data.trialEnd)
                  : null;
              const expiry = expiresAt || trialEnd;

              if (expiry && expiry.getTime() > Date.now()) {
                const msUntilExpiry = expiry.getTime() - Date.now();
                // Refresh tier 5 seconds after expiry
                if (msUntilExpiry < 12 * 60 * 60 * 1000) {
                  // Only schedule if within 12 hours
                  sessionStorage.setItem(`tier_refresh_scheduled_${user.uid}`, "true");
                  setTimeout(() => {
                    try { sessionStorage.removeItem(`tier_refresh_scheduled_${user.uid}`); } catch(e){}
                    fetchTierData();
                  }, msUntilExpiry + 5000);
                }
              }
            }
          } catch (e) {}
        };
        fetchAndSchedule();
      }
    } catch (e) {
      console.warn("sessionStorage not available", e);
    }
  }, [selectedServerId, user]);

    const debouncedFetchTierData = useCallback(() => {
    if (tierFetchTimeoutRef.current) clearTimeout(tierFetchTimeoutRef.current);
    tierFetchTimeoutRef.current = setTimeout(() => {
      fetchTierData();
    }, 300); // 300ms debounce
  }, [fetchTierData]);

  useEffect(() => {
    fetchTierData();
  }, [fetchTierData]);

    useEffect(() => {
      if (!selectedServerId) return;

      const unsubServerSub = onSnapshot(
        doc(db, "subscriptions", selectedServerId),
        () => {
          debouncedFetchTierData();
        },
        () => {}
      );

      const unsubServerSubLink = onSnapshot(
        doc(db, "server_subscriptions", selectedServerId),
        () => {
          debouncedFetchTierData();
        },
        () => {}
      );

      return () => {
        unsubServerSub();
        unsubServerSubLink();
      };
    }, [selectedServerId, fetchTierData]);

  // Status polling is handled by ServerContext/fetchBotStatus

  useEffect(() => {
    if (!selectedServerId || !user) {
      if (!selectedServerId) setBotPermissions(null);
      return;
    }

    setBotPermissions(null); // Clear previous server's permissions

    let cancelled = false;

    const fetchPerms = async () => {
      try {
        const token = await user.getIdToken();
        if (!token) return;
        const res = await fetch(
          `/api/discord/permissions/${selectedServerId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok) {
          if (!cancelled) {
            setBotPermissions(null);
            if (res.status === 404) {
              setBotGuilds((prev) => prev.filter((id) => id !== selectedServerId));
              setBotPresenceError(null);
            } else if (res.status === 503) {
              setBotPresenceError("Bot status could not be verified because Firebase or the bot service is temporarily unavailable.");
            }
          }
          return;
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const data = await res.json();
           if (data && data.permissions) {
             if (!cancelled) {
               setBotPermissions(data.permissions);
               setBotGuilds((prev) =>
                 prev.includes(selectedServerId) ? prev : [...prev, selectedServerId],
               );
               setBotPresenceError(null);
             }
           } else {
             if (!cancelled) {
               setBotPermissions(null);
               setBotGuilds((prev) => prev.filter((id) => id !== selectedServerId));
               setBotPresenceError(null);
             }
           }
        } else {
           console.warn("API returned non-JSON for perms");
           if (!cancelled) {
             setBotPermissions(null);
             setBotPresenceError("Bot status could not be verified.");
           }
        }
      } catch (err) {
        console.debug("Failed to fetch bot permissions:", err);
        if (!cancelled) {
          setBotPermissions(null);
          setBotPresenceError("Bot status could not be verified.");
        }
      }
    };

    fetchPerms();
    const interval = setInterval(fetchPerms, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedServerId, user]);

  const isPro =
    tier === "pro_1" ||
    tier === "pro_3" ||
    tier === "premium" ||
    isTrial;

  const isSharedServer = serverClaimedBy && user?.email && serverClaimedBy !== user.email ? true : false;

  return (
    <ServerContext.Provider
      value={{
        selectedServerId,
        setSelectedServerId,
        authorizedServers,
        tier,
        userTier,
        userIsTrial,
        isPro,
        isBetaTester,
        loading: loading || authLoading,
        discordProfile,
        activeServerId: activeServerIds[0] || null,
        activeServerIds,
        activeQuotaCount,
        isServerActiveGlobally,
        serverClaimedBy,
        isSharedServer,
        maxSlots:
          maxServersSetting !== null
            ? maxServersSetting
            : userTier === "pro_3" || userTier === "premium"
              ? 3
              : 1,
        botGuilds,
        accessSyncError,
        botPresenceError,
        intentsWarning,
        botPermissions,
        setBotPermissions,
        refreshAccess: fetchAccess,
        refreshTier: fetchTierData,
        clearAccess,
        user,
        isTrial,
        serverEntitlementExpiry,
        serverEntitlementStatus,
        serverEntitlementSource,
        pendingFlagsCount,
        pendingReportsCount,
        dailyAICount,
        dailyAiLimit,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error("useServer must be used within a ServerProvider");
  }
  return context;
}
