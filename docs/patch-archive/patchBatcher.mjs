import fs from 'fs';
let code = fs.readFileSync('src/discordBot.ts', 'utf8');

const regex = /batchTimer = setInterval\(async \(\) => \{(.*?)\}, 60 \* 1000\); \/\/ Flush every 60 seconds/s;
const match = code.match(regex);
if (match) {
    const body = match[1];
    const replacement = `export async function flushAnalyticsBatcher() {${body}}

  batchTimer = setInterval(async () => {
    await flushAnalyticsBatcher();
  }, 60 * 1000); // Flush every 60 seconds`;
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/discordBot.ts', code);
    console.log("Patched discordBot.ts!");
} else {
    console.log("No match found.");
}
