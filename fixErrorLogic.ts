import fs from 'fs';

let content = fs.readFileSync('server.ts', 'utf8');

// Replace standard route handlers to include `next`
content = content.replace(/async\s*\(\s*req([^{)]*?),\s*res([^{)]*?)\)\s*=>/g, (match, p1, p2) => {
    return `async (req${p1}, res${p2}, next: any) =>`;
});

// Since the error variables inside catch are e, err, error, we can replace the return res.status(500)... inside catch blocks.
content = content.replace(/res\.status\(500\)\.json\(\{\s*error\s*:\s*(e|err|error|String\(e\.message\s*\|\|\s*e\))(?:\.message)?\s*\}\)/g, 'next($1)');

// Also replace return res.status(500)... with handle
content = content.replace(/return\s+res\.status\(500\)\.json\(\{\s*error\s*:\s*(e|err|error)\.message\s*\}\)/g, 'return next($1)');

fs.writeFileSync('server.ts', content);
console.log("Done");
