const fs = require('fs');

if (!fs.existsSync('scripts/patches')) {
    fs.mkdirSync('scripts/patches', { recursive: true });
}

const files = fs.readdirSync('.');

const patterns = [
    /^fix.*\.ts$/,
    /^fix.*\.js$/,
    /^fix.*\.cjs$/,
    /^clean.*\.ts$/,
    /^extract.*\.ts$/,
    /^replace.*\.ts$/,
    /^inject.*\.ts$/,
    /^unify.*\.cjs$/,
    /^update.*\.cjs$/,
    /^readEnd\.ts$/,
    /^checkTop\.ts$/,
    /^dnaOriginalBlock\.txt$/,
    /^fetch-servers\.(mjs|ts)$/
];

for (const file of files) {
    if (fs.statSync(file).isFile()) {
        for (const pattern of patterns) {
            if (pattern.test(file)) {
                if (file === 'fetch-servers.mjs' || file === 'fetch-servers.ts') {
                   fs.unlinkSync(file);
                } else {
                   fs.renameSync(file, 'scripts/patches/' + file);
                }
                break;
            }
        }
    }
}
