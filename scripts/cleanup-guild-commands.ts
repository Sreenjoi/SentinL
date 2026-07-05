import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import path from "path";
import { buildManagedCommands } from "../src/utils/discordCommands.ts";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const guildId = process.argv[2] || process.env.DISCORD_GUILD_ID;
const clientId = process.env.DISCORD_CLIENT_ID;
let token = process.env.DISCORD_BOT_TOKEN?.trim();

if (token && token.split(".").length > 3) {
  token = token.split(".").slice(0, 3).join(".");
}

if (!guildId) {
  console.error("Missing guild/server ID. Usage: npx tsx scripts/cleanup-guild-commands.ts <DISCORD_SERVER_ID>");
  process.exit(1);
}

if (!clientId || !token) {
  console.error("Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const nativeCommands = await buildManagedCommands();
  const nativeNames = new Set(nativeCommands.map((command: any) => command.name));

  const existingGuildCommands = await rest.get(
    Routes.applicationGuildCommands(clientId!, guildId!)
  ) as any[];

  const retainedGuildCommands = existingGuildCommands
    .filter((command: any) => !nativeNames.has(command.name))
    .map((command: any) => ({
      name: command.name,
      description: command.description,
      options: command.options,
      default_member_permissions: command.default_member_permissions,
      dm_permission: command.dm_permission,
      nsfw: command.nsfw,
    }));

  const removed = existingGuildCommands
    .filter((command: any) => nativeNames.has(command.name))
    .map((command: any) => command.name);

  await rest.put(Routes.applicationGuildCommands(clientId!, guildId!), {
    body: retainedGuildCommands,
  });

  console.log(`[Cleanup] Removed ${removed.length} duplicate guild-scoped SentinL commands from ${guildId}.`);
  if (removed.length > 0) {
    console.log(`[Cleanup] Removed: ${removed.join(", ")}`);
  }
  console.log(`[Cleanup] Retained ${retainedGuildCommands.length} custom/unmanaged guild commands.`);
  console.log("[Cleanup] Global SentinL commands were not touched.");
}

main().catch((error) => {
  console.error("[Cleanup Error]", error);
  process.exit(1);
});
