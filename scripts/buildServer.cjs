const { build } = require('esbuild');

const enableSourcemaps = process.env.ENABLE_SOURCEMAPS === 'true';

build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  sourcemap: enableSourcemaps,
  outfile: 'dist/server.cjs'
}).catch(() => process.exit(1));
