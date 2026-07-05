import fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const startMarker = "const onboardingCmd = new SlashCommandBuilder()";
const endMarker = "];\n\n      // To avoid 50035";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker) + 2;

if (startIndex === -1 || endIndex < startIndex) {
    console.error("Markers not found");
    process.exit(1);
}

const commandsBlock = code.substring(startIndex, endIndex);

const newModule = `
export async function buildManagedCommands() {
  const discordJS = await import("discord.js");
  const {
    SlashCommandBuilder,
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    PermissionFlagsBits,
  } = discordJS;

  ${commandsBlock}

  return managedCommands;
}
`;

fs.writeFileSync('src/utils/discordCommands.ts', newModule);

code = code.substring(0, startIndex) + `const managedCommands = await (await import("./src/utils/discordCommands.ts")).buildManagedCommands();\n` + code.substring(endIndex);

fs.writeFileSync('server.ts', code);
console.log("Done");
