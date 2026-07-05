const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config({ override: true });

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID || "1494329471216521316";

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Fetching existing commands...');
    const existingCommands = await rest.get(Routes.applicationCommands(clientId));
    console.log(`Found ${existingCommands.length} existing commands.`);

    // Build the onboarding command
    const onboardingCmd = new SlashCommandBuilder()
      .setName('onboarding')
      .setDescription('Configure server onboarding')
      .addSubcommand(subcommand =>
        subcommand
          .setName('setwelcome')
          .setDescription('Set the welcome channel and message')
          .addChannelOption(option => option.setName('channel').setDescription('The channel to send welcome messages in').setRequired(true))
          .addStringOption(option => option.setName('message').setDescription('The welcome message (use {user} and {server})').setRequired(true))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('setdefaultrole')
          .setDescription('Set a role to automatically assign to new members')
          .addRoleOption(option => option.setName('role').setDescription('The role to assign').setRequired(true))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('toggle_dm')
          .setDescription('Enable or disable sending a welcome DM with server rules')
          .addBooleanOption(option => option.setName('enabled').setDescription('True to enable, False to disable').setRequired(true))
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('preview')
          .setDescription('Preview your current onboarding setup')
      );

    // Keep all existing commands EXCEPT any old 'onboarding' command
    const commandsToRegister = existingCommands.filter(cmd => cmd.name !== 'onboarding');
    
    // Add the new onboarding command
    commandsToRegister.push(onboardingCmd.toJSON());

    console.log('Registering updated commands list...');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commandsToRegister },
    );

    console.log('Successfully reloaded application (/) commands globally!');
  } catch (error) {
    console.error("Error registering command:", error);
  }
})();
