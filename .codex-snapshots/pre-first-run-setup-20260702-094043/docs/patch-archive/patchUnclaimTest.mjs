import fs from 'fs';

let content = fs.readFileSync('tests/unit/unclaimServerAtomic.test.ts', 'utf8');

content = content.replace(
/return \{ docs: \[\] \};/,
\`return { docs: [] };\`
);

// wait, let's just replace the tMock.get.mockImplementation part
content = content.replace(
/tMock\.get\.mockImplementation\(async \(ref: any\) => \{\n\s*if \(typeof ref\.where === 'function' \|\| ref\.docs\) return \{ docs: \[\] \};\n\s*return \{ exists: true, data: \(\) => \(\{\ accessTier: 'pro_1', linkedServerIds: \[\] \}\)\ \};\n\s*\}\);/,
\`tMock.get.mockImplementation(async (ref: any) => {
    if (typeof ref.where === 'function' || ref.path === undefined) return { docs: [] };
    return { exists: true, data: () => ({ accessTier: 'pro_1', linkedServerIds: [] }) };
});\`
);

fs.writeFileSync('tests/unit/unclaimServerAtomic.test.ts', content);
