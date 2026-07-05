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
  intentsWarning: boolean;
  botPermissions: Record<string, boolean> | null;
  setBotPermissions: (perms: Record<string, boolean> | null) => void;
  refreshAccess: () => Promise<void>;
  refreshTier: () => Promise<void>;
  clearAccess: () => void;
  user: any;
  isTrial: boolean;
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

  useEffect(() => {
    discordProfileRef.current = discordProfile;
  }, [discordProfile]);

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

  const fetchBotGuilds = async () => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/bot-guilds", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await res.json();
        if (Array.isArray(data.guilds)) setBotGuilds(data.guilds);
      } else {
        console.warn("API returned non-JSON for bot-guilds:", await res.text());
      }
    } catch (e) {}
  };

  const clearAccess = useCallback(() => {
    setAuthorizedServers([]);
    setSelectedServerId(null);
    setActiveServerIds([]);
    setTier(null);
    setDiscordProfile(null);
    setLoading(false);
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
            const data = modDoc.data();
            const serverIds: string[] = data.serverIds || [];
            const serverNames: Record<string, string> = data.serverNames || {};

            // Migration/Compatibility: Check for array first, then fallback to single ID
            if (data.activeServerIds) {
              setActiveServerIds(Array.from(new Set(data.activeServerIds)));
            } else if (data.activeServerId) {
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
            try { storedId = localStorage.getItem("selectedServerId"); } catch (e) {}
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

            if (data.discordId && data.discordUsername) {
              let latestAvatar = data.discordAvatar;
              const currentProfile = discordProfileRef.current;
              // Only fetch avatar on explicit refresh or first load if missing
              if (!latestAvatar && !currentProfile?.avatar) {
                try {
                  const res = await fetch(
                    `/api/discord/user/${data.discordId}`,
                  );
                  if (res.ok) {
                    const contentType = res.headers.get("content-type");
                    if (
                      contentType &&
                      contentType.includes("application/json")
                    ) {
                      const { avatarUrl } = await res.json();
                      if (avatarUrl) latestAvatar = avatarUrl;
                    }
                  } else if (res.status === 429) {
                    console.warn(
                      "Rate limited while fetching discord profile avatar",
                    );
                  }
                } catch (e) {}
              }

              // Only update if something changed
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
              fetchBotGuilds();
            } else {
              setDiscordProfile(null);
            }
          } else {
            setAuthorizedServers([]);
            setDiscordProfile(null);
            setActiveServerIds([]);
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
        setLoading(false);
      },
    );

    return () => unsubMod();
  }, [user, authLoading]);

  async function fetchAccess() {
    await fetchBotStatus();
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
          setBotPermissions(null);
          return;
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
           const data = await res.json();
           if (data && data.permissions) {
             setBotPermissions(data.permissions);
           } else {
             setBotPermissions(null);
           }
        } else {
           console.warn("API returned non-JSON for perms");
           setBotPermissions(null);
        }
      } catch (err) {
        console.debug("Failed to fetch bot permissions:", err);
        setBotPermissions(null);
      }
    };

    fetchPerms();
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
        intentsWarning,
        botPermissions,
        setBotPermissions,
        refreshAccess: fetchAccess,
        refreshTier: fetchTierData,
        clearAccess,
        user,
        isTrial,
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
