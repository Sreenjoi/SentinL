const fs = require('fs');

const content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');

const targetStartStr = '      {/* 4. Two-Column Main Grid */}';
const targetEndStr = '    </div>\n  );\n}';
const tStart = content.indexOf(targetStartStr);
const tEnd = content.indexOf(targetEndStr) + targetEndStr.length;
const targetContent = content.substring(tStart, tEnd);

const fixDashboard = fs.readFileSync('fixDashboard.ts', 'utf8');
const rStart = fixDashboard.indexOf('{/* 4. Two-Column Main Grid */}');
const rEnd = fixDashboard.indexOf('{/* 7. Upgrade Banner */}');
let replacementRaw = fixDashboard.substring(rStart, rEnd).trim();

replacementRaw = replacementRaw.replace(/card\.locked \? \'cursor-not-allowed grayscale\' : \'\'/g, "''");
replacementRaw = replacementRaw.replace(/\{card\.locked && \([\s\S]*?PRO\n[\s\S]*?\)\}/g, "");
replacementRaw = replacementRaw.replace(/\{\!card\.locked && \(/g, "{(");
replacementRaw = replacementRaw.replace(/style=\{\{ opacity: card\.locked \? 0\.6 : 1 \}\}/g, "");
replacementRaw = replacementRaw.replace(/whileHover=\{!card\.locked \? \{ y: -3, scale: 1\.01 \} : \{\}\}/g, "whileHover={{ y: -3, scale: 1.01 }}");
replacementRaw = replacementRaw.replace(/whileTap=\{!card\.locked \? \{ scale: 0\.98 \} : \{\}\}/g, "whileTap={{ scale: 0.98 }}");
replacementRaw = replacementRaw.replace(/onClick=\{\(e\) => \{[\s\S]*?if \(card\.locked\) \{[\s\S]*?e\.preventDefault\(\);[\s\S]*?\}[\s\S]*?\}\}/g, "");

// Replace escaped backticks and $ that were present in string literal definition in fixDashboard.ts
replacementRaw = replacementRaw.replace(/\\`/g, '`');
replacementRaw = replacementRaw.replace(/\\\$/g, '$');

const replacementContent = replacementRaw + '\n    </div>\n  );\n}';

const finalContent = content.substring(0, tStart) + '      ' + replacementContent + '\n';
fs.writeFileSync('src/components/Dashboard.tsx', finalContent);
console.log("Success updated Dashboard");
