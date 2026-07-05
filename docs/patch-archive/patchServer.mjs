import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// Fix existingCommands error
code = code.replace(
  "const keepers = existingCommands\n        .filter((c) => !managedNames.includes(c.name))",
  "const existingCommands = await rest.get(Routes.applicationCommands(clientId)) as any[];\n      const keepers = existingCommands\n        .filter((c: any) => !managedNames.includes(c.name))"
);

// Fix another existingCommands error
code = code.replace(
  "const keepersGuild = existingCommands\n          .filter((c) => !managedNames.includes(c.name))",
  "const existingCommands = await rest.get(Routes.applicationGuildCommands(clientId, serverId)) as any[];\n        const keepersGuild = existingCommands\n          .filter((c: any) => !managedNames.includes(c.name))"
);

// Fix property user does not exist
code = code.replace(
    /req\.user/g,
    "(req as any).user"
);

fs.writeFileSync('server.ts', code);
