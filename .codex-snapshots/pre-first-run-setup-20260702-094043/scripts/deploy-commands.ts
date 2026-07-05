import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import path from "path";
import { buildManagedCommands } from "../src/utils/discordCommands.ts";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_CLIENT_ID || !DISCORD_BOT_TOKEN) {
  console.error("Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);

(async () => {
  try {
    const commands = await buildManagedCommands();
    console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands globally.`);
    const data: any = await rest.put(
      Routes.applicationCommands(DISCORD_CLIENT_ID),
      { body: commands }
    );
    console.log(`[Deploy] Successfully reloaded ${data.length} application (/) commands globally.`);
  } catch (error) {
    console.error("[Deploy Error]", error);
  }
})();

