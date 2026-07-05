import fs from 'fs';

let content = fs.readFileSync('src/components/Settings.tsx', 'utf8');

content = content.replace(/rulesList/g, 'rules');
content = content.replace(/deleteRule\(/g, 'handleDeleteRule(');

fs.writeFileSync('src/components/Settings.tsx', content);
console.log("Updated rulesList, deleteRule variables in Settings.tsx");
