interface DiscordServerLike {
  id: string;
  name?: string;
}

interface ModeratorAccessLike {
  serverIds?: unknown;
  serverNames?: unknown;
  activeServerIds?: unknown;
  staleServers?: unknown;
}

export interface ModeratorServerAccessUpdate {
  serverIds: string[];
  serverNames: Record<string, string>;
  activeServerIds: string[];
  staleServers: Record<string, { name: string; removedAt: number; reason: "discord_not_returned" }>;
}

export function buildModeratorServerAccessUpdate(
  previous: ModeratorAccessLike | null | undefined,
  freshServers: DiscordServerLike[],
  removedAt = Date.now(),
): ModeratorServerAccessUpdate {
  const freshServerIds = Array.from(
    new Set(
      freshServers
        .map((server) => String(server?.id || "").trim())
        .filter(Boolean),
    ),
  );
  const freshIdSet = new Set(freshServerIds);
  const previousServerIds = Array.isArray(previous?.serverIds)
    ? previous.serverIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const previousServerNames =
    previous?.serverNames && typeof previous.serverNames === "object" && !Array.isArray(previous.serverNames)
      ? previous.serverNames as Record<string, string>
      : {};
  const previousActiveServerIds = Array.isArray(previous?.activeServerIds)
    ? previous.activeServerIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const previousStaleServers =
    previous?.staleServers && typeof previous.staleServers === "object" && !Array.isArray(previous.staleServers)
      ? previous.staleServers as Record<string, { name: string; removedAt: number; reason: "discord_not_returned" }>
      : {};

  const serverNames = freshServers.reduce<Record<string, string>>((acc, server) => {
    const id = String(server?.id || "").trim();
    if (!id || !freshIdSet.has(id)) return acc;
    acc[id] = String(server?.name || previousServerNames[id] || `Server ${id.substring(0, 8)}`);
    return acc;
  }, {});

  const staleServers = { ...previousStaleServers };
  previousServerIds.forEach((id) => {
    if (!freshIdSet.has(id)) {
      staleServers[id] = {
        name: previousServerNames[id] || `Server ${id.substring(0, 8)}`,
        removedAt,
        reason: "discord_not_returned",
      };
    }
  });
  freshServerIds.forEach((id) => {
    delete staleServers[id];
  });

  return {
    serverIds: freshServerIds,
    serverNames,
    activeServerIds: previousActiveServerIds.filter((id) => freshIdSet.has(id)),
    staleServers,
  };
}
