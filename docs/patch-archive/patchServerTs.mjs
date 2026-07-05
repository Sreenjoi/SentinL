import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

const refundBlockRegex = /case "refund\.processed": \{[\s\S]*?break;\n\s*\}/;

const replacement = `case "refund.processed": {
          // Handle refunds
          const refund = payload.refund?.entity;
          const paymentId = refund?.payment_id || payload.payment?.entity?.id;
          if (!paymentId) return res.status(400).send("Missing payment ID");

          try {
             const { processRazorpayRefund } = await import("./src/services/razorpay.js");
             await processRazorpayRefund(db, paymentId);
             logger.info(\`[Razorpay Webhook] Refund processed for payment \${paymentId}\`);
          } catch(e) {
             logger.error({err: e}, "[Razorpay Webhook] Refund error");
             if (e.message === "Processed payment not found for refund") {
                return res.status(200).send("Ignored");
             }
             return res.status(500).send("Refund processing failed");
          }
          break;
        }`;

content = content.replace(refundBlockRegex, replacement);

fs.writeFileSync('server.ts', content);
console.log("server.ts patched");
