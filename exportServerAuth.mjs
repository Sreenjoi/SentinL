import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(
/const checkServerAuth = async /g,
'export const checkServerAuth = async '
);

fs.writeFileSync('server.ts', content);
