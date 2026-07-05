/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { configDefaults } from 'vitest/config';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let fallbackAppId = undefined;
let appletConfigObj: any = {};
try {
  const isPreview = process.env.AI_STUDIO_PREVIEW === 'true' || !!process.env.APPLET_ID;
  if (isPreview) {
    if (fs.existsSync('./firebase-applet-config.json')) {
      const appletConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
      fallbackAppId = appletConfig.appId;
      appletConfigObj = appletConfig;
    } else {
      console.warn("firebase-applet-config.json not found in preview environment.");
    }
  }
} catch (e) {
  console.error("Error reading firebase-applet-config.json:", e);
}

export default defineConfig(({mode, command}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const isPreview = process.env.AI_STUDIO_PREVIEW === 'true' || env.AI_STUDIO_PREVIEW === 'true' || !!process.env.APPLET_ID || !!env.APPLET_ID;

  if (command === 'build' && !isPreview) {
    const placeholders = ['YOUR_VALUE_HERE', 'dummy', 'test', 'undefined', 'null', ''];
    const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
    if (!apiKey || placeholders.includes(apiKey)) {
      throw new Error("Production build failed: Valid VITE_FIREBASE_API_KEY is required in production hosting. firebase-applet-config.json is only for local/preview.");
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    esbuild: {
      target: 'esnext',
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext'
      }
    },
    define: {
      '__AI_STUDIO_PREVIEW__': JSON.stringify(process.env.AI_STUDIO_PREVIEW === 'true' || env.AI_STUDIO_PREVIEW === 'true' || !!process.env.APPLET_ID || !!env.APPLET_ID),
      '__FALLBACK_APP_ID__': JSON.stringify(fallbackAppId),
      '__APPLET_CONFIG__': JSON.stringify(appletConfigObj)
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: process.env.ENABLE_SOURCEMAPS === 'true',
      emptyOutDir: process.env.PRESERVE_DIST !== 'true',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts')) return 'recharts';
            if (id.includes('node_modules/jspdf')) return 'jspdf';
            if (id.includes('node_modules/html2canvas')) return 'html2canvas';
            if (id.includes('node_modules/lucide-react')) return 'lucide';
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.{test,spec}.{ts,js,tsx}'],
            environment: 'jsdom',
            setupFiles: ['tests/setup/filesystemGuard.ts', 'tests/setup/timersGuard.ts'],
            env: { TEST_MODE: 'true' }
          }
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['tests/integration/**/*.{test,spec}.{ts,js,tsx}'],
            environment: 'node',
            setupFiles: ['tests/setup/filesystemGuard.ts', 'tests/integration/setup.ts'],
            env: { TEST_MODE: 'true', IS_INTEGRATION_TEST: 'true' }
          }
        },
        {
          extends: true,
          test: {
            name: 'smoke',
            include: ['tests/smoke/**/*.{test,spec}.{ts,js,tsx}'],
            environment: 'node',
            setupFiles: ['tests/setup/filesystemGuard.ts'],
            env: { TEST_MODE: 'true' }
          }
        },
        {
          extends: true,
          test: {
            name: 'live',
            include: ['tests/live/**/*.{test,spec}.{ts,js,tsx}'],
            environment: 'node',
            setupFiles: ['tests/setup/filesystemGuard.ts'],
            env: { TEST_MODE: 'true' }
          }
        },
        {
          extends: true,
          test: {
            name: 'load',
            include: ['tests/load/**/*.{test,spec}.{ts,js,tsx}'],
            environment: 'node',
            setupFiles: ['tests/setup/filesystemGuard.ts'],
            env: { TEST_MODE: 'true' }
          }
        }
      ],
      pool: 'threads',
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      exclude: [...configDefaults.exclude, '**/search_deletions.js', '**/runFailureTest.ts', 'scripts/archive/**', 'app/applet/tests/**']
    }
  };
});