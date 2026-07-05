import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

async function getGoogleAuthToken() {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: process.env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const toBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  const data = await res.json();
  return data.access_token;
}

async function check() {
  const token = await getGoogleAuthToken();
  const email = "srinjoymahato9@gmail.com";
  const url = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f/documents/moderators/${email}`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.ok) {
    const data = await res.json();
    console.log("SUCCESS:", JSON.stringify(data, null, 2));
  } else {
    console.log("NOT FOUND or ERROR:", res.status, await res.text());
  }
}

check();
