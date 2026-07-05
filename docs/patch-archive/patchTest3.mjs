import fs from 'fs';

const content = fs.readFileSync('tests/unit/razorpayIdempotency.test.ts', 'utf8');

const updated = content.replace(
  /tMock.getAll.mockResolvedValue\(\[\s*\{\s*exists: true, data: \(\) => \(\{\s*lastPaymentIntent: 'pay_123', linkedServerIds: \['server_1'\]\s*\}\)\s*\}, \/\/ uDoc\s*\{\s*exists: true, data: \(\) => \(\{\s*ownerId: 'user_1'\s*\}\)\s*\} \/\/ linkDoc\s*\]\);/,
  `tMock.getAll
    .mockResolvedValueOnce([
       { exists: true, data: () => ({ lastPaymentIntent: 'pay_123', linkedServerIds: ['server_1'] }) },
       { exists: true } // sDoc (since refs length is 2)
    ])
    .mockResolvedValueOnce([
       { exists: true, data: () => ({ ownerId: 'user_1' }) } // linkDoc
    ]);`
);


fs.writeFileSync('tests/unit/razorpayIdempotency.test.ts', updated);
