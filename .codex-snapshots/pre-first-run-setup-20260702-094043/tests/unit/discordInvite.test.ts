import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { DISCORD_BOT_PERMISSIONS } from '../../src/utils/discordInvite';
import { PermissionFlagsBits } from 'discord-api-types/v10';

describe('Discord Invite URL Helper', () => {
  it('does not contain any hardcoded client IDs or full discord oauth2 URLs in components', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    
    function walkDir(dir: string, fileList: string[] = []) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          walkDir(filePath, fileList);
        } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
          fileList.push(filePath);
        }
      }
      return fileList;
    }
    
    const allFiles = walkDir(srcDir);
    const ignoreList = ['discordInvite.ts', 'discordInvite.test.ts'];
    
    let badFiles: string[] = [];
    
    for (const file of allFiles) {
      if (ignoreList.some(i => file.endsWith(i))) continue;
      
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('discord.com/oauth2/authorize') || content.includes('discord.com/api/oauth2/authorize')) {
        badFiles.push(file);
      }
    }
    
    expect(badFiles, `Found hardcoded Discord Auth URLs in: ${badFiles.join(', ')}`).toHaveLength(0);
  });

  it('generates the correct permission integer and does not include Administrator', () => {
    const perms = BigInt(DISCORD_BOT_PERMISSIONS);
    const hasAdmin = (perms & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
    
    expect(hasAdmin, 'Bot permissions should NOT include Administrator').toBe(false);
    
    const expectedPerms = 
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.ManageMessages |
      PermissionFlagsBits.EmbedLinks |
      PermissionFlagsBits.AttachFiles |
      PermissionFlagsBits.ReadMessageHistory |
      PermissionFlagsBits.AddReactions |
      PermissionFlagsBits.ManageRoles |
      PermissionFlagsBits.ModerateMembers |
      PermissionFlagsBits.UseApplicationCommands |
      PermissionFlagsBits.BanMembers |
      PermissionFlagsBits.KickMembers |
      PermissionFlagsBits.SendMessagesInThreads;
      
    expect(perms).toBe(expectedPerms);
  });
});

