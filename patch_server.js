const fs = require('fs');

function run() {
  let code = fs.readFileSync('server.ts', 'utf8');

  // CSP
  code = code.replace(
    /frameSrc: \["'self'", "https:\\/\\/discord\\.com", "https:\\/\\/jr\\.stripe\\.com"\]/,
    'frameSrc: ["\\'self\\'", "https://discord.com", "https://api.razorpay.com", "https://checkout.razorpay.com"]'
  );
  code = code.replace(
    /frameAncestors: \["\\*"\]/,
    'frameAncestors: ["\\'self\\'", process.env.APP_URL || "http://localhost:3000"]'
  );
  code = code.replace(
    /connectSrc: \[([\\s\\S]*?)\]/,
    function(match, p1) {
      return 'connectSrc: [' + p1.trim().replace(/,$/, '') + ', "https://api.razorpay.com", "https://checkout.razorpay.com"]';
    }
  );
  code = code.replace(
    /scriptSrc: \["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:\\/\\/apis\\.google\\.com"\]/,
    'scriptSrc: ["\\'self\\'", "\\'unsafe-inline\\'", "\\'unsafe-eval\\'", "https://apis.google.com", "https://checkout.razorpay.com"]'
  );

  // Billing Configurations
  const planConfig = `
const PLAN_CONFIG: Record<string, { amountCents: number, maxServers: number }> = {
  pro_1: { amountCents: 799, maxServers: 1 },
  pro_3: { amountCents: 1999, maxServers: 3 }
};
  `;
  code = code.replace(
    /import crypto from "crypto";/,
    'import crypto from "crypto";\n' + planConfig
  );

  // 1. Create Order
  code = code.replace(
    /const { serverId, userId, plan } = req.body;/,
    `let { serverId, userId, plan } = req.body;\n    if (plan === "premium") plan = "pro_3";\n    if (!PLAN_CONFIG[plan]) return res.status(400).json({ error: "Invalid plan selected." });`
  );
  code = code.replace(
    /const amountToChargeInCents = plan === "pro_3" \? 1999 : 799;.*,
    `const amountToChargeInCents = PLAN_CONFIG[plan].amountCents;`
  );

  // 2. Verify Payment
  code = code.replace(
    /const plan = notes.plan \|\| "pro_1";/g,
    `let plan = notes.plan || "pro_1";\n        if (plan