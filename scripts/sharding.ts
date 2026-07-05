import { ShardingManager } from "discord.js";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("Missing DISCORD_BOT_TOKEN in .env");
  process.exit(1);
}

// NOTE: To use Sharding in production safely without breaking the Express API:
// The web server (server.ts) and the Discord Bot logic (discordBot.ts) 
// must be split into two separate processes. 
// The Manager spawns ONLY the bot processes here.

const manager = new ShardingManager(path.resolve(__dirname, "../dist/botWorker.js"), {
  token: token,
  totalShards: "auto", // Automatically determines how many shards are needed
});

manager.on("shardCreate", (shard) => {
  console.log(`[Sharding] Launched Shard #${shard.id}`);
});

manager.spawn().catch((err) => {
  console.error("[Sharding Error] Failed to spawn shards", err);
});
