
export async function buildManagedCommands() {
  const discordJS = await import("discord.js");
  const {
    SlashCommandBuilder,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    PermissionFlagsBits,
  } = discordJS;

  const onboardingCmd = new SlashCommandBuilder()
        .setName("onboarding")
        .setDescription("Configure server onboarding")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("setwelcome")
            .setDescription("Set the welcome channel and message")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("The channel for welcome messages")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("message")
                .setDescription("The welcome message (use {user} and {server})")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("setdefaultrole")
            .setDescription("Set a role to automatically assign to new members")
            .addRoleOption((option) =>
              option
                .setName("role")
                .setDescription("The role to assign")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("toggle_dm")
            .setDescription("Enable or disable sending a welcome DM")
            .addBooleanOption((option) =>
              option
                .setName("enabled")
                .setDescription("True to enable, False to disable")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("preview")
            .setDescription("Preview your current onboarding setup"),
        );

      const rrCmd = new SlashCommandBuilder()
        .setName("reactionrole")
        .setDescription("Manage reaction role panels")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("create")
            .setDescription("Create a new reaction role panel")
            .addChannelOption((option) =>
              option
                .setName("channel")
                .setDescription("The channel to post the panel in")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("title")
                .setDescription("The title of the panel")
                .setRequired(true),
            )
            .addRoleOption((option) =>
              option
                .setName("role1")
                .setDescription("The first role to assign")
                .setRequired(true),
            )
            .addStringOption((option) =>
              option
                .setName("label1")
                .setDescription("The emoji for the first role")
                .setRequired(true),
            )
            .addRoleOption((option) =>
              option
                .setName("role2")
                .setDescription("The second role to assign")
                .setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName("label2")
                .setDescription("The emoji for the second role")
                .setRequired(false),
            )
            .addRoleOption((option) =>
              option
                .setName("role3")
                .setDescription("The third role to assign")
                .setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName("label3")
                .setDescription("The emoji for the third role")
                .setRequired(false),
            )
            .addRoleOption((option) =>
              option
                .setName("role4")
                .setDescription("The fourth role to assign")
                .setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName("label4")
                .setDescription("The emoji for the fourth role")
                .setRequired(false),
            )
            .addRoleOption((option) =>
              option
                .setName("role5")
                .setDescription("The fifth role to assign")
                .setRequired(false),
            )
            .addStringOption((option) =>
              option
                .setName("label5")
                .setDescription("The emoji for the fifth role")
                .setRequired(false),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("list")
            .setDescription("List all reaction role panels in this server"),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("delete")
            .setDescription("Delete a reaction role panel")
            .addStringOption((option) =>
              option
                .setName("panel_id")
                .setDescription("The ID (Message ID) of the panel to delete")
                .setRequired(true),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("edit")
            .setDescription("Edit an existing reaction role panel")
            .addStringOption((option) =>
              option
                .setName("panel_id")
                .setDescription("The ID (Message ID) of the panel to edit")
                .setRequired(true),
            ),
        );

      const levelingCmd = new SlashCommandBuilder()
        .setName("leveling")
        .setDescription("Configure the server leveling and XP system")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("toggle")
            .setDescription("Enable or disable leveling for the server"),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("set")
            .setDescription("Set leveling parameters")
            .addSubcommand((sub) =>
              sub
                .setName("xp-multiplier")
                .setDescription("Multiplier for XP earned (default 1.0)")
                .addNumberOption((opt) =>
                  opt
                    .setName("value")
                    .setDescription("Multiplier value (0.5-3.0)")
                    .setRequired(true)
                    .setMinValue(0.5)
                    .setMaxValue(3.0),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("cooldown")
                .setDescription("Cooldown between XP gains in seconds")
                .addIntegerOption((opt) =>
                  opt
                    .setName("seconds")
                    .setDescription("Seconds (15-300)")
                    .setRequired(true)
                    .setMinValue(15)
                    .setMaxValue(300),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("xp-range")
                .setDescription("Min and max XP per message")
                .addIntegerOption((opt) =>
                  opt
                    .setName("min")
                    .setDescription("Minimum XP")
                    .setRequired(true)
                    .setMinValue(0),
                )
                .addIntegerOption((opt) =>
                  opt
                    .setName("max")
                    .setDescription("Maximum XP")
                    .setRequired(true)
                    .setMinValue(1),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("level-formula")
                .setDescription("Divisor in level formula (default 50)")
                .addIntegerOption((opt) =>
                  opt
                    .setName("divisor")
                    .setDescription("Divisor value")
                    .setRequired(true)
                    .setMinValue(1),
                ),
            ),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("ignore-channel")
            .setDescription("Manage channels where XP is not earned")
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Add a channel to the ignore list")
                .addChannelOption((opt) =>
                  opt
                    .setName("channel")
                    .setDescription("Channel to ignore")
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Remove a channel from the ignore list")
                .addChannelOption((opt) =>
                  opt
                    .setName("channel")
                    .setDescription("Channel to re-enable")
                    .setRequired(true),
                ),
            ),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("ignore-role")
            .setDescription("Manage roles that do not earn XP")
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Add a role to the ignore list")
                .addRoleOption((opt) =>
                  opt
                    .setName("role")
                    .setDescription("Role to ignore")
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Remove a role from the ignore list")
                .addRoleOption((opt) =>
                  opt
                    .setName("role")
                    .setDescription("Role to re-enable")
                    .setRequired(true),
                ),
            ),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("role-reward")
            .setDescription("Manage role rewards for reaching specific levels")
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Add a role reward")
                .addIntegerOption((opt) =>
                  opt
                    .setName("level")
                    .setDescription("Level required")
                    .setRequired(true)
                    .setMinValue(1),
                )
                .addRoleOption((opt) =>
                  opt
                    .setName("role")
                    .setDescription("Role to reward")
                    .setRequired(true),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Remove a role reward")
                .addIntegerOption((opt) =>
                  opt
                    .setName("level")
                    .setDescription("Level to remove reward from")
                    .setRequired(true)
                    .setMinValue(1),
                ),
            )
            .addSubcommand((sub) =>
              sub.setName("list").setDescription("List all role rewards"),
            ),
        );

      const rankCmd = new SlashCommandBuilder()
        .setName("rank")
        .setDescription("View your or another user's level and rank position")
        .addUserOption((option) =>
          option.setName("user").setDescription("The user to view rank for"),
        );

      const leaderboardCmd = new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the server XP leaderboard");

      const reportCmd = new SlashCommandBuilder()
        .setName("report")
        .setDescription("Report a member for rule violations")
        .setDescriptionLocalizations({
          "es-ES": "Reportar a un miembro por violaciones de las reglas",
          fr: "Signaler un membre pour violation des règles",
          de: "Einen Benutzer wegen Regelverstößen melden",
          hi: "नियम उल्लंघन के लिए किसी सदस्य की रिपोर्ट करें",
          ja: "ルール違反でメンバーを報告する",
        })
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("The user to report")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Reason for the report")
            .setRequired(true)
            .setMaxLength(500),
        );

      const giveawayCmd = new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage server giveaways (requires Pro or Premium)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("start")
            .setDescription("Launch a new giveaway")
            .addStringOption((opt) =>
              opt.setName("prize").setDescription("The prize").setRequired(true)
            )
            .addChannelOption((opt) =>
              opt.setName("channel").setDescription("Channel to post in").setRequired(true)
            )
            .addIntegerOption((opt) =>
              opt.setName("winners").setDescription("Number of winners").setRequired(false)
            )
            .addIntegerOption((opt) =>
              opt.setName("duration").setDescription("Duration in hours").setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("end")
            .setDescription("Manually end a giveaway early")
            .addStringOption((opt) =>
              opt.setName("message_id").setDescription("The discord message ID of the giveaway").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("reroll")
            .setDescription("Reroll the winner of a giveaway")
            .addStringOption((opt) =>
              opt.setName("message_id").setDescription("The discord message ID of the giveaway").setRequired(true)
            )
        );

      const reportMenuCmd = new ContextMenuCommandBuilder()
        .setName("Report Message")
        .setType(ApplicationCommandType.Message);

      const reportsCmd = new SlashCommandBuilder()
        .setName("reports")
        .setDescription("Manage user reports (Moderator Only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("list")
            .setDescription("List reports")
            .addStringOption((opt) =>
              opt
                .setName("status")
                .setDescription("Status to filter by")
                .addChoices(
                  { name: "Pending", value: "pending" },
                  { name: "Approved", value: "approved" },
                  { name: "Dismissed", value: "dismissed" },
                  { name: "Actioned", value: "actioned" },
                ),
            )
            .addIntegerOption((opt) =>
              opt.setName("page").setDescription("Page number").setMinValue(1),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("view")
            .setDescription("View a specific report")
            .addStringOption((opt) =>
              opt
                .setName("report_id")
                .setDescription("ID of the report")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("take")
            .setDescription("Assign a report to yourself")
            .addStringOption((opt) =>
              opt
                .setName("report_id")
                .setDescription("ID of the report")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("resolve")
            .setDescription("Resolve a report with an action")
            .addStringOption((opt) =>
              opt
                .setName("report_id")
                .setDescription("ID of the report")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("action")
                .setDescription("Action to take")
                .setRequired(true)
                .addChoices(
                  { name: "Dismiss", value: "dismiss" },
                  { name: "Warn", value: "warn" },
                  { name: "Timeout", value: "timeout" },
                  { name: "Ban", value: "ban" },
                  { name: "Delete Message", value: "delete_message" },
                ),
            )
            .addStringOption((opt) =>
              opt
                .setName("reason")
                .setDescription("Reason for resolving")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("duration")
                .setDescription("Duration in minutes (for timeout)"),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("history")
            .setDescription("View report history for a user")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("The user to view history for")
                .setRequired(true),
            ),
        );

      const languageCmd = new SlashCommandBuilder()
        .setName("language")
        .setDescription("Manage server language")
        .setDescriptionLocalizations({
          "es-ES": "Administrar el idioma del servidor",
          fr: "Gérer la langue du serveur",
          de: "Serversprache verwalten",
          hi: "सर्वर भाषा प्रबंधित करें",
          ja: "サーバーの言語を管理する",
        })
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName("set")
            .setDescription("Set the server language")
            .setDescriptionLocalizations({
              "es-ES": "Establecer el idioma del servidor",
              fr: "Définir la langue du serveur",
              de: "Die Serversprache einstellen",
              hi: "सर्वर भाषा सेट करें",
              ja: "サーバーの言語を設定する",
            })
            .addStringOption((option) =>
              option
                .setName("lang")
                .setDescription("The language to use")
                .setRequired(true)
                .addChoices(
                  { name: "English", value: "en" },
                  { name: "Español", value: "es" },
                  { name: "Français", value: "fr" },
                  { name: "Deutsch", value: "de" },
                  { name: "हिन्दी", value: "hi" },
                  { name: "日本語", value: "ja" },
                ),
            ),
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName("view")
            .setDescription("View current server language")
            .setDescriptionLocalizations({
              "es-ES": "Ver el idioma actual del servidor",
              fr: "Afficher la langue actuelle du serveur",
              de: "Aktuelle Serversprache anzeigen",
              hi: "वर्तमान सर्वर भाषा देखें",
              ja: "現在のサーバー言語を表示する",
            }),
        );

      const moderationCmd = new SlashCommandBuilder()
        .setName("moderation")
        .setDescription("Manage AI moderation settings")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("toggle-context")
            .setDescription(
              "Toggles smart AI context reading (dynamically reads relevant recent messages) - requires Pro or Premium",
            ),
        );

      const autoroleCmd = new SlashCommandBuilder()
        .setName("autorole")
        .setDescription("Manage auto-assigning roles on join")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription(
              "Sets a role to be automatically assigned to new members",
            )
            .addRoleOption((opt) =>
              opt
                .setName("role")
                .setDescription("The role to assign")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub.setName("disable").setDescription("Disables auto-assign"),
        )
        .addSubcommand((sub) =>
          sub
            .setName("status")
            .setDescription("Shows current auto-assign role (if any)"),
        );

      const healthCmd = new SlashCommandBuilder()
        .setName("health")
        .setDescription("View community health stats and score")
        .addSubcommand((sub) =>
          sub
            .setName("score")
            .setDescription("View the server's current health score and active streak")
        )
        .addSubcommand((sub) =>
          sub
            .setName("stats")
            .setDescription("View the breakdown of health points and grades")
        );

      const helpCmd = new SlashCommandBuilder()
        .setName("help")
        .setDescription("List all available commands and their descriptions");

      const summaryCmd = new SlashCommandBuilder()
        .setName("summary")
        .setDescription("Generate an AI summary of a channel for a specific date")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ManageGuild)
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The channel to summarize")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("date")
            .setDescription("The date to summarize (YYYY-MM-DD)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("visibility")
            .setDescription("Whether the summary should be visible to everyone or just you")
            .setRequired(true)
            .addChoices(
              { name: "Public", value: "public" },
              { name: "Only me (Ephemeral)", value: "ephemeral" }
            )
        );

      // Define our managed commands as toJSON objects
      const managedCommands = [
        helpCmd.toJSON(),
        summaryCmd.toJSON(),
        healthCmd.toJSON(),
        giveawayCmd.toJSON(),
        autoroleCmd.toJSON(),
        onboardingCmd.toJSON(),
        rrCmd.toJSON(),
        levelingCmd.toJSON(),
        rankCmd.toJSON(),
        leaderboardCmd.toJSON(),
        reportCmd.toJSON(),
        reportMenuCmd.toJSON(),
        reportsCmd.toJSON(),
        languageCmd.toJSON(),
        moderationCmd.toJSON(),
        new SlashCommandBuilder()
          .setName("status")
          .setDescription("View server subscription and moderation status")
          .addSubcommand((sub) =>
            sub
              .setName("quota")
              .setDescription(
                "Shows the remaining AI moderation calls for free servers today",
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("queue")
              .setDescription(
                "Displays the current AI rate limits and dynamic queue status",
              ),
          )
          .toJSON(),
        new SlashCommandBuilder()
          .setName("keywords")
          .setDescription("Manage the free keyword pre-filter")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .addSubcommand((sub) =>
            sub
              .setName("add")
              .setDescription(
                "Adds a new keyword or regex pattern to the pre-filter",
              )
              .addStringOption((opt) =>
                opt
                  .setName("keyword")
                  .setDescription("The word or regex pattern to match")
                  .setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("remove")
              .setDescription(
                "Removes a keyword or regex pattern from the pre-filter",
              )
              .addStringOption((opt) =>
                opt
                  .setName("keyword")
                  .setDescription("The word or regex pattern to remove")
                  .setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("list")
              .setDescription(
                "Lists all currently configured pre-filter keywords",
              ),
          )
          .addSubcommand((sub) =>
            sub
              .setName("toggle-autodelete")
              .setDescription("Toggles auto-delete on keyword match"),
          )
          .toJSON(),
        new SlashCommandBuilder()
          .setName("grantpremium")
          .setDescription(
            "[Owner only] Grant premium access.",
          )
          .addStringOption((opt) =>
            opt
              .setName("target_type")
              .setDescription("Is this for a User ID or a Server ID?")
              .setRequired(true)
              .addChoices(
                { name: "Server", value: "server" },
                { name: "User", value: "user" },
              ),
          )
          .addStringOption((opt) =>
            opt
              .setName("target")
              .setDescription("The ID (Server ID or Firebase UID)")
              .setRequired(true),
          )
          .addIntegerOption((opt) =>
            opt
              .setName("days")
              .setDescription("Number of days the premium should last")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("tier")
              .setDescription("The access tier to grant")
              .setRequired(true)
              .addChoices(
                { name: "Pro", value: "pro_1" },
                { name: "Premium", value: "premium" },
              ),
          )
          .toJSON(),
        new SlashCommandBuilder()
          .setName("subscribe")
          .setDescription("Get the subscription link")
          .toJSON(),
        new SlashCommandBuilder()
          .setName("modqueue")
          .setDescription("Link to the moderation queue")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .toJSON(),
        new SlashCommandBuilder()
          .setName("setup")
          .setDescription("Initialize server configuration")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .toJSON(),
        new SlashCommandBuilder()
          .setName("wipedata")
          .setDescription("Request complete deletion of server data from SentinL (GDPR/CCPA)")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .toJSON(),
        new SlashCommandBuilder()
          .setName("start_trial")
          .setDescription("Start a 14-day free Premium trial for this server")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .toJSON(),
        new SlashCommandBuilder()
          .setName("integrate")
          .setDescription("Manage social media integrations (requires Pro or Premium)")
          .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
          .addSubcommandGroup((group) =>
            group
              .setName("youtube")
              .setDescription("Manage YouTube integrations")
              .addSubcommand((sub) =>
                sub
                  .setName("add")
                  .setDescription("Add a YouTube channel to monitor")
                  .addStringOption((opt) =>
                    opt
                      .setName("target")
                      .setDescription("Channel URL or @handle")
                      .setRequired(true),
                  )
                  .addChannelOption((opt) =>
                    opt
                      .setName("channel")
                      .setDescription("Channel for announcements")
                      .setRequired(true),
                  ),
              )
              .addSubcommand((sub) =>
                sub
                  .setName("remove")
                  .setDescription("Remove a YouTube integration")
                  .addStringOption((opt) =>
                    opt
                      .setName("target")
                      .setDescription(
                        "Integration ID (from /integrate youtube list)",
                      )
                      .setRequired(true),
                  ),
              )
              .addSubcommand((sub) =>
                sub
                  .setName("list")
                  .setDescription("List all active YouTube integrations"),
              ),
          )
          .addSubcommandGroup((group) =>
            group
              .setName("twitch")
              .setDescription("Manage Twitch integrations")
              .addSubcommand((sub) =>
                sub
                  .setName("add")
                  .setDescription("Add a Twitch streamer to monitor")
                  .addStringOption((opt) =>
                    opt
                      .setName("target")
                      .setDescription("Twitch username")
                      .setRequired(true),
                  )
                  .addChannelOption((opt) =>
                    opt
                      .setName("channel")
                      .setDescription("Channel for announcements")
                      .setRequired(true),
                  ),
              )
              .addSubcommand((sub) =>
                sub
                  .setName("remove")
                  .setDescription("Remove a Twitch integration")
                  .addStringOption((opt) =>
                    opt
                      .setName("target")
                      .setDescription("Integration ID")
                      .setRequired(true),
                  ),
              )
              .addSubcommand((sub) =>
                sub
                  .setName("list")
                  .setDescription("List all active Twitch integrations"),
              ),
          )
          .toJSON(),
        new SlashCommandBuilder()
          .setName("appeal")
          .setDescription("Appeal a moderation action")
          .setContexts([0, 1, 2] as any)
          .setIntegrationTypes([0, 1] as any)
          .setDMPermission(true)
          .addStringOption((opt) =>
            opt
              .setName("case_id")
              .setDescription("The ID of the case you want to appeal (optional)")
              .setRequired(false)
          )
          .toJSON(),
      ];

  return managedCommands;
}

export function parseAppealInteractionId(customId: string): { type: "open" | "submit"; serverId: string; caseId: string } | null {
  if (!customId || typeof customId !== "string") return null;

  // Exact formats allowed:
  // appeal:{serverId}:{caseId}
  // submit_appeal:{serverId}:{caseId}
  const isAppeal = customId.startsWith("appeal:");
  const isSubmit = customId.startsWith("submit_appeal:");
  
  if (!isAppeal && !isSubmit) return null;

  const parts = customId.split(":");
  if (parts.length !== 3) return null;

  const type = isAppeal ? "open" : "submit";
  const serverId = parts[1];
  const caseId = parts[2];

  // Basic validation: IDs shouldn't be empty and shouldn't contain slashes or weird characters that might be path traversals
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  if (!serverId || !caseId || !idRegex.test(serverId) || !idRegex.test(caseId)) {
    return null;
  }

  return { type, serverId, caseId };
}
