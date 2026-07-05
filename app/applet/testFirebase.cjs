import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

async function run() {
  const c = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
  const keyMatch = readFileSync('/app/applet/.env', 'utf8').match(/FIREBASE_PRIVATE_KEY="(.+?)"/);
  const privateKey = keyMatch ? keyMatch[1].replace(/\\n/g, '\n') : "";
  
  // We cannot use Firebase Admin SDK to simulate rules... wait!
  console.log("ready");
}
run();
