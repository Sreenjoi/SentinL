const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const requiredFiles = [
    'package.json',
    'package-lock.json',
];

if (!isProduction) {
    requiredFiles.push('server.ts', 'vite.config.ts', 'tsconfig.json', 'src');
}

const rootDir = process.cwd();
let hasError = false;

for (const file of requiredFiles) {
    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) {
        console.error(`[Project Root Integrity Check Failed] Missing required path: ${file}`);
        hasError = true;
    }
}

if (hasError) {
    console.error('Do not run commands outside of the project root or when critical files are missing.');
    process.exit(1);
}
