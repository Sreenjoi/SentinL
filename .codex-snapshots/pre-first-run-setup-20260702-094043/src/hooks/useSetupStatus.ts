import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useServer } from "../context/ServerContext";

export type SetupTaskId =
  | "connect"
  | "claim"
  | "invite"
  | "activate"
  | "permissions"
  | "intents"
  | "log"
  | "rules"
  | "test";

export interface SetupStatusTask {
  id: SetupTaskId;
  isComplete: boolean;
}

export interface SetupStatus {
  loading: boolean;
  tasks: SetupStatusTask[];
  completedCount: number;
  totalCount: number;
  progress: number;
  isAllDone: boolean;
  connectComplete: boolean;
  claimComplete: boolean;
  inviteComplete: boolean;
  activateComplete: boolean;
  permissionsComplete: boolean;
  intentsComplete: boolean;
  logComplete: boolean;
  rulesComplete: boolean;
  testBotDone: boolean;
  botRuntimeStatus: "online" | "offline" | "setup";
}

export function useSetupStatus(): SetupStatus {
  const {
    selectedServerId,
    discordProfile,
    botGuilds,
    serverClaimedBy,
    isServerActiveGlobally,
    botPermissions,
    intentsWarning,
  } = useServer();

  const [logChannelSet, setLogChannelSet] = useState(false);
  const [hasRules, setHasRules] = useState(false);
  const [testBotDone, setTestBotDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedServerId) {
      setLogChannelSet(false);
      setHasRules(false);
      setTestBotDone(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    let hasKeywords = false;
    let hasRulesCollection = false;

    const syncRulesCompletion = () => {
      setHasRules(hasKeywords || hasRulesCollection);
    };

    const unsubServer = onSnapshot(
      doc(db, "servers", selectedServerId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLogChannelSet(!!data.logChannelId);
          hasKeywords = Array.isArray(data.keywords) && data.keywords.length > 0;
          setTestBotDone(!!data.botTested);
        } else {
          setLogChannelSet(false);
          hasKeywords = false;
          setTestBotDone(false);
        }
        syncRulesCompletion();
        setLoading(false);
      },
      (err) => {
        console.error("Failed to fetch server data for setup status", err);
        setLoading(false);
      },
    );

    const unsubRules = onSnapshot(
      collection(db, `servers/${selectedServerId}/rules`),
      (snap) => {
        hasRulesCollection = !snap.empty;
        syncRulesCompletion();
      },
      (err) => {
        console.error("Failed to fetch rules for setup status", err);
      },
    );

    return () => {
      unsubServer();
      unsubRules();
    };
  }, [selectedServerId]);

  return useMemo(() => {
    const connectComplete = !!discordProfile;
    const claimComplete = !!serverClaimedBy;
    const inviteComplete =
      !!selectedServerId &&
      (botGuilds.includes(selectedServerId) ||
        (!!botPermissions && Object.keys(botPermissions).length > 0));
    const activateComplete = isServerActiveGlobally;
    const permissionsComplete =
      !!botPermissions &&
      ["SendMessages", "ManageRoles", "ManageMessages", "ReadMessageHistory"].every(
        (permission) => botPermissions[permission] === true,
      );
    const intentsComplete = !intentsWarning;
    const logComplete = logChannelSet;
    const rulesComplete = hasRules;

    const tasks: SetupStatusTask[] = [
      { id: "connect", isComplete: connectComplete },
      { id: "claim", isComplete: claimComplete },
      { id: "invite", isComplete: inviteComplete },
      { id: "activate", isComplete: activateComplete },
      { id: "permissions", isComplete: permissionsComplete },
      { id: "intents", isComplete: intentsComplete },
      { id: "log", isComplete: logComplete },
      { id: "rules", isComplete: rulesComplete },
      { id: "test", isComplete: testBotDone },
    ];

    const completedCount = tasks.filter((task) => task.isComplete).length;
    const totalCount = tasks.length;
    const progress = Math.round((completedCount / totalCount) * 100);
    const isAllDone = completedCount === totalCount;
    const botRuntimeStatus = !selectedServerId || !claimComplete
      ? "setup"
      : activateComplete && inviteComplete
        ? "online"
        : activateComplete || inviteComplete
          ? "offline"
          : "setup";

    return {
      loading,
      tasks,
      completedCount,
      totalCount,
      progress,
      isAllDone,
      connectComplete,
      claimComplete,
      inviteComplete,
      activateComplete,
      permissionsComplete,
      intentsComplete,
      logComplete,
      rulesComplete,
      testBotDone,
      botRuntimeStatus,
    };
  }, [
    discordProfile,
    serverClaimedBy,
    selectedServerId,
    botGuilds,
    botPermissions,
    isServerActiveGlobally,
    intentsWarning,
    logChannelSet,
    hasRules,
    testBotDone,
    loading,
  ]);
}
