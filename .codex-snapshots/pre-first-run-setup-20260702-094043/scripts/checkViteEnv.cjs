const fs = require('fs');
const path = require('path');
require('dotenv').config();

function checkViteEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const isPreview = !isProd && (process.env.AI_STUDIO_PREVIEW === 'true' || !!process.env.APPLET_ID);

  if (isPreview) {
    console.log('[checkViteEnv] AI Studio preview environment detected, skipping strict Vite env checks.');
    return;
  }

  // Prevent fallback in real production
  if (isProd && process.env.ALLOW_APPLET_FIREBASE_FALLBACK === 'true') {
      console.warn('\x1b[31m%s\x1b[0m', 'ERROR: ALLOW_APPLET_FIREBASE_FALLBACK=true is not allowed in production!');
      process.exit(1);
  }

  const requiredVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIRESTORE_DATABASE_ID',
    'VITE_DISCORD_CLIENT_ID'
  ];

  const placeholders = ['YOUR_VALUE_HERE', 'dummy', 'test', 'undefined', 'null', ''];
  const errors = [];

  for (const v of requiredVars) {
    const val = process.env[v];
    if (!val || placeholders.includes(val.trim())) {
      errors.push(`${v} is missing or has a placeholder value.`);
      continue;
    }

    if (v === 'VITE_FIREBASE_API_KEY' && !val.startsWith('AIza')) {
      errors.push(`${v} must start with "AIza"`);
    }

    if (v === 'VITE_FIREBASE_AUTH_DOMAIN') {
      if (val.includes('http://') || val.includes('https://')) {
        errors.push(`${v} must not include "http://" or "https://"`);
      }
      if (!val.endsWith('.firebaseapp.com') && !val.endsWith('.web.app')) {
        errors.push(`${v} must end with ".firebaseapp.com" or ".web.app"`);
      }
    }

    if (v === 'VITE_FIREBASE_APP_ID' && !/^1:\d+:web:[a-zA-Z0-9]+$/.test(val)) {
      errors.push(`${v} must match Firebase web app format like "1:...:web:..."`);
    }
  }

  if (errors.length > 0) {
    if (isProd) {
      console.warn('\x1b[31m%s\x1b[0m', 'ERROR: Production Build Failed. Invalid Vite environment variables:');
      for (const e of errors) {
        console.warn(`  - ${e}`);
      }
      console.warn('\x1b[31m%s\x1b[0m', 'The build cannot proceed with invalid variables.');
      console.warn('\x1b[31m%s\x1b[0m', 'FIX: Check your Environment Variables settings.');
      process.exit(1);
    } else {
      console.warn('\x1b[33m%s\x1b[0m', 'WARNING: Invalid Vite environment variables:');
      for (const e of errors) {
        console.warn(`  - ${e}`);
      }
    }
  } else {
    console.log('[checkViteEnv] All required Vite environment variables are present and valid.');
  }
}

checkViteEnv();
