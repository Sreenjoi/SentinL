import { readFileSync, writeFileSync } from 'fs';

let content = readFileSync("server.ts", "utf-8");

content = content.replace(
  'await db.collection("subscriptions").doc(userId).set({ status: "refunded", accessTier: "free" }, { merge: true });',
  `const { processRefund } = await import("./src/utils/entitlements.js");
             await processRefund(userId, db);`
);

content = content.replace(
  'await db.collection("subscriptions").doc(userId).set({ status: "expired", accessTier: "free" }, { merge: true });',
  `const { processExpiry } = await import("./src/utils/entitlements.js");
               await processExpiry(userId, db);`
);

writeFileSync("server.ts", content);
