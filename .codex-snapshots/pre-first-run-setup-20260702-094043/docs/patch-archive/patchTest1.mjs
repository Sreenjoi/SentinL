import fs from 'fs';

let content = fs.readFileSync('tests/unit/razorpayIdempotency.test.ts', 'utf8');

// replace the tMock definition
content = content.replace(/tMock = \{\n\s*get: vi.fn\(\),\n\s*set: vi.fn\(\)\n\s*\};/, `tMock = {
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
    };`);

// add missing getAll mock to existing tests
content = content.replace(/tMock\.get\.mockResolvedValue\(\{ exists: false \}\);/, 
    `tMock.getAll.mockResolvedValue([{ exists: false }, { exists: false }]);`);

content = content.replace(/tMock\.get\.mockImplementation\(async \(ref: any\) => \{\n\s*if \(ref\.path === 'pay_123'\) return \{ exists: true \};\n\s*return \{ exists: false \};\n\s*\}\);/,
    `tMock.getAll.mockResolvedValue([{ exists: true }, { exists: false }]);`);

content = content.replace(/tMock\.get\.mockImplementation\(async \(ref: any\) => \{\n\s*if \(ref\.path === 'order_123'\) return \{ exists: true \};\n\s*return \{ exists: false \};\n\s*\}\);/,
    `tMock.getAll.mockResolvedValue([{ exists: false }, { exists: true }]);`);

fs.writeFileSync('tests/unit/razorpayIdempotency.test.ts', content);
