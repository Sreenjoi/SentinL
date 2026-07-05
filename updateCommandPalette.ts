import fs from 'fs';

let content = fs.readFileSync('src/components/CommandPalette.tsx', 'utf8');

const anchor = '{ title: "Keyword Pre-Filter"';

const replacement = `{ title: "Community DNA Suggestions", breadcrumbs: "Settings > Community DNA > Suggestions", path: "/settings#dna", icon: Logo, description: "AI Recommended rules and standard baseline policies", locked: !isPro },
    { title: "Keyword Pre-Filter"`;

content = content.replace(anchor, replacement);

fs.writeFileSync('src/components/CommandPalette.tsx', content);
