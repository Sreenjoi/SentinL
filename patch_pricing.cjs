const fs = require('fs');

let server = fs.readFileSync('server.ts', 'utf8');
server = server.replace('const amountToChargeInCents = plan === "pro_3" ? 1000 : 500; // $10 or $5', 'const amountToChargeInCents = plan === "pro_3" ? 1999 : 799; // $19.99 or $7.99');
fs.writeFileSync('server.ts', server);

function replacePrices(filePath) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/\$10(\b|([^0-9]))/g, '$19.99$1');
    content = content.replace(/\$5(\b|([^0-9]))/g, '$7.99$1');
    content = content.replace(/10\.00/g, '19.99');
    content = content.replace(/5\.00/g, '7.99');
    content = content.replace(/10\/month/g, '19.99/month');
    content = content.replace(/5\/month/g, '7.99/month');
    fs.writeFileSync(filePath, content);
  }
}

replacePrices('src/components/Checkout.tsx');
replacePrices('src/components/Pricing.tsx');
replacePrices('PRD.txt');
replacePrices('README.md');
replacePrices('src/components/Profile.tsx');
replacePrices('src/components/Success.tsx');

console.log("Pricing numbers patched.");
