import { FieldValue } from "firebase-admin/firestore";
import { logger } from "./utils/logger.js";
import { Message, User, Guild, ModalSubmitInteraction, ButtonInteraction, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from "discord.js";
import admin from "firebase-admin";
import { getBotClient, addBotLog, db } from "./discordBot.js";
import { randomBytes } from "crypto";

export async function createModerationCase(params: {
  serverId: string;
  userId: string;
  username: string;
  actionTaken: "flagged_only" | "message_deleted" | "timeout" | "warn" | "manual_action";
  reason: string;
  messageId?: string;
  channelId?: string;
  aiLevel?: string;
  aiConfidence?: number;
  matchedRules?: string[];
  evidenceSnippet?: string;
}) {
  if (!db) return;
  const colRef = db.collection(`servers/${params.serverId}/moderationCases`);
  const docRef = colRef.doc();
  const caseId = docRef.id;
  const now = FieldValue.serverTimestamp();
  
  // 7 days from now exact calculation not possible with serverTimestamp unless we do Date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7);
  
  const caseData = {
    caseId,
    ...params,
    status: "open",
    appealStatus: "none",
    createdAt: now,
    expiresAt: admin.firestore.Timestamp.fromDate(expiryDate)
  };

  try {
    await docRef.set(caseData);
    
    // Try to PM the user
    const client = getBotClient();
    if (client) {
      const user = await client.users.fetch(params.userId).catch(() => null);
      if (user) {
        const guild = await client.guilds.fetch(params.serverId).catch(() => null);
        const serverName = guild ? guild.name : "the server";
        
        // Disable mentions in the DM out of abundance of caution, although DMs don't typically ping other users
        let contentStr = `SentinL took a moderation action in ${serverName}.\n**Case:** ${caseId}\n**Action:** ${params.actionTaken}\n**Reason:** ${params.reason}`;
        let components: ActionRowBuilder<ButtonBuilder>[] = [];
        
        contentStr += `\n\nIf you think this was wrong, click **Appeal** below or use \`/appeal case_id:${caseId}\` in DMs or inside the server.`;
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal:${params.serverId}:${caseId}`)
            .setLabel("Appeal Decision")
            .setStyle(ButtonStyle.Primary)
        );
        components.push(row);

        await user.send({
          content: contentStr,
          components,
          allowedMentions: { parse: [] }
        }).catch(() => {
          // Ignore DM block
        });
      }
    }
  } catch (err) {
    logger.error(err);
  }
}

export async function handleAppealCommand(interaction: ChatInputCommandInteraction) {
  if (!db) return;
  
  const caseId = interaction.options.getString("case_id");

  if (!caseId) {
    // List open cases across all servers since it could be in DM
    const casesSnap = await db.collectionGroup("moderationCases")
      .where("userId", "==", interaction.user.id)
      .limit(20)
      .get();
      
    const validCases = casesSnap.docs.map(d => Object.assign(d.data(), { serverId: d.ref.parent.parent?.id })).filter(c => 
       c.expiresAt && c.expiresAt.toDate() > new Date() &&
       (c.appealStatus === "none" || c.appealStatus === "submitted")
    ).sort((a, b) => {
        // Sort descending by creation
        return b.createdAt?.toMillis() - a.createdAt?.toMillis() || 0;
    });

    if (validCases.length === 0) {
      return interaction.reply({ content: "You do not have any recent appealable cases.", ephemeral: true, allowedMentions: { parse: [] } });
    }

    const embeds = validCases.slice(0, 5).map(c => new EmbedBuilder()
       .setTitle(`Case ${c.caseId}`)
       .setDescription(`**Action:** ${c.actionTaken}\n**Reason:** ${c.reason}\n**Status:** ${c.appealStatus}\n*Expires: <t:${Math.floor(c.expiresAt.toDate().getTime()/1000)}:R>*`)
       .setColor(c.appealStatus === "none" ? 0xFFA500 : 0x00FF00)
    );
    
    // We can only put 10 embeds per message, take up to 3
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      validCases.slice(0, 5).filter(c => c.appealStatus === "none" && c.serverId).map(c => 
         new ButtonBuilder()
          .setCustomId(`appeal:${c.serverId}:${c.caseId}`)
          .setLabel(`Appeal ${c.caseId}`)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const components = buttons.components.length > 0 ? [buttons] : [];
    return interaction.reply({ content: "Your recent cases:", embeds, components, ephemeral: true, allowedMentions: { parse: [] } });
  }

  // Handle specific case via collection group since we don't know the server in DM
  const caseSnap = await db.collectionGroup("moderationCases")
    .where("caseId", "==", caseId)
    .where("userId", "==", interaction.user.id)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
    
  if (caseSnap.empty) {
     return interaction.reply({ content: "That case ID was not found or does not belong to you.", ephemeral: true, allowedMentions: { parse: [] } });
  }
  const caseDoc = caseSnap.docs[0];
  const customServerId = caseDoc.ref.parent.parent?.id;
  if (!customServerId) {
     return interaction.reply({ content: "Could not identify the server for this case.", ephemeral: true, allowedMentions: { parse: [] } });
  }
  await openAppealModal(interaction, customServerId, caseId);
}

async function safeReply(interaction: ModalSubmitInteraction, message: string) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true, allowedMentions: { parse: [] } });
    } else {
      await interaction.reply({ content: message, ephemeral: true, allowedMentions: { parse: [] } });
    }
  } catch (err: any) {
    if (err.code !== 40060) {
      logger.error(`Error in safeReply: ${err.message}`);
    }
  }
}

export async function handleAppealButton(interaction: ButtonInteraction, serverId: string, caseId: string) {
  await openAppealModal(interaction, serverId, caseId);
}

async function resolveAppealCaseForUser(caseId: string, userId: string): Promise<{ serverId: string; caseId: string } | null> {
  if (!db || !caseId) return null;

  const caseSnap = await db.collectionGroup("moderationCases")
    .where("caseId", "==", caseId)
    .where("userId", "==", userId)
    .limit(1)
    .get();

  if (caseSnap.empty) return null;
  const serverId = caseSnap.docs[0].ref.parent.parent?.id;
  return serverId ? { serverId, caseId } : null;
}

function extractCaseIdFromAppealMessage(interaction: any): string | null {
  const content = interaction?.message?.content;
  if (typeof content !== "string") return null;
  const match = content.match(/\*\*Case:\*\*\s*([a-zA-Z0-9_-]+)/i) || content.match(/\bCase:\s*([a-zA-Z0-9_-]+)/i);
  return match?.[1] || null;
}

export async function openAppealModal(interaction: ChatInputCommandInteraction | ButtonInteraction, serverId: string, caseId: string) {
  const modal = new ModalBuilder()
    .setCustomId(`submit_appeal:${serverId}:${caseId}`)
    .setTitle(`Appeal Case`);

  const textInput = new TextInputBuilder()
    .setCustomId("appeal_reason")
    .setLabel("Why do you think this decision was wrong?")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
  await interaction.showModal(modal);
}

export async function handleAppealModalSubmit(interaction: ModalSubmitInteraction, serverId: string, caseId: string) {
  if (!db) return;
  const appealText = interaction.fields.getTextInputValue("appeal_reason");
  
  if (!appealText || appealText.length > 1000) {
      return safeReply(interaction, "Appeal text is invalid or exceeds 1000 characters.");
  }

  const caseRef = db.collection(`servers/${serverId}/moderationCases`).doc(caseId);
  
  try {
     let caseData: any = null;
     await db.runTransaction(async (t) => {
         const caseSnap = await t.get(caseRef);
         if (!caseSnap.exists) {
             throw new Error("Case not found.");
         }
         caseData = caseSnap.data()!;
         if (caseData.userId !== interaction.user.id) {
             throw new Error("Cannot submit appeal for another user's case.");
         }
         if (caseData.appealStatus !== "none") {
             throw new Error("This case has already been appealed.");
         }
         if (caseData.serverId && caseData.serverId !== serverId) {
             throw new Error("Invalid server for this case.");
         }
    
         if (caseData.expiresAt && caseData.expiresAt.toDate() < new Date()) {
             throw new Error("This appeal window has expired.");
         }
         
         if (!caseData.actionTaken) {
             throw new Error("This action is not appealable.");
         }
         
         t.update(caseRef, {
            status: "appealed",
            appealStatus: "submitted",
            appealText,
            appealSubmittedAt: FieldValue.serverTimestamp(),
            appealSubmittedBy: interaction.user.id
         });
     });

     await safeReply(interaction, "Your appeal has been successfully submitted and will be reviewed by the server staff.");
     
     // Notify log channel
     const serverSnap = await db.collection("servers").doc(serverId).get();
     const logChannelId = serverSnap.data()?.logChannelId;
     if (logChannelId) {
        const client = getBotClient();
        if (client) {
            const chan = await client.channels.fetch(logChannelId).catch(()=>null);
            if (chan && chan.isTextBased() && !chan.isDMBased()) {
                if (chan.guild.id === serverId) {
                    await chan.send({
                       embeds: [{
                           title: "New Appeal Submitted",
                           description: `<@${interaction.user.id}> appealed **${caseData.actionTaken}** for Case **${caseId}**.\n\n**Reason:** ${appealText}`,
                           color: 0x00BFFF
                       }],
                       allowedMentions: { parse: [], users: [interaction.user.id] }
                    }).catch(()=>null);
                }
            }
        }
     }
  } catch (err: any) {
      if (err.message === "Case not found." || 
          err.message === "Cannot submit appeal for another user's case." || 
          err.message === "This case has already been appealed." ||
          err.message === "Invalid server for this case." ||
          err.message === "This appeal window has expired." ||
          err.message === "This action is not appealable.") {
          return safeReply(interaction, err.message);
      }
      logger.error(`Error in handleAppealModalSubmit: ${err.message}`);
      await safeReply(interaction, "An error occurred submitting your appeal.");
  }
}

import { parseAppealInteractionId } from "./utils/discordCommands.js";

export async function routeAppealInteraction(interaction: any): Promise<boolean> {
  const _customId = interaction.customId;

  if (_customId === "appeal") {
    const caseId = extractCaseIdFromAppealMessage(interaction);
    const resolved = caseId ? await resolveAppealCaseForUser(caseId, interaction.user.id) : null;
    if (resolved && interaction.isButton()) {
      await handleAppealButton(interaction, resolved.serverId, resolved.caseId);
    } else if (interaction.isRepliable()) {
      await interaction.reply({
        content: "This older appeal button could not be matched to a case. Use `/appeal` in DMs or `/appeal case_id:<case id>` with the case ID shown in this message.",
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }
    return true;
  }

  const appealData = parseAppealInteractionId(_customId);
  if (appealData) {
    if (appealData.type === "open" && interaction.isButton()) {
      await handleAppealButton(interaction, appealData.serverId, appealData.caseId);
      return true;
    }
    if (appealData.type === "submit" && interaction.isModalSubmit()) {
      await handleAppealModalSubmit(interaction, appealData.serverId, appealData.caseId);
      return true;
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "appeal") {
    await handleAppealCommand(interaction as any);
    return true;
  }

  return false;
}
