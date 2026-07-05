import { Client, GatewayIntentBits, Message } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const botClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

botClient.on('ready', () => {
    console.log(`[Discord Bot] Logged in as ${botClient?.user?.tag}!`);
    console.log('Guilds:', botClient.guilds.cache.map(g => g.name));
    process.exit(0);
});

botClient.login(process.env.DISCORD_BOT_TOKEN?.split('.').slice(0, 3).join('.')).catch(e => {
    console.error("[Discord Bot] Failed to login:", e);
    process.exit(1);
});
