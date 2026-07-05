const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

console.log('ID:', !!process.env.FIREBASE_PROJECT_ID);
console.log('EMAIL:', !!process.env.FIREBASE_CLIENT_EMAIL);
console.log('KEY:', !!process.env.FIREBASE_PRIVATE_KEY);

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  console.log("Firebase Admin Initialized successfully.");
} catch (e) {
  console.error("Firebase Admin Error:", e.message);
}
