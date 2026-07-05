import admin from "firebase-admin";
import config from "../firebase-applet-config.json";

function getAdminApp() {
  if (admin.apps.length === 0) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      databaseURL: `https://${config.projectId}.firebaseio.com`
    });
  }
  return admin.apps[0]!;
}

async function run() {
  try {
    const app = getAdminApp();
    const db = app.firestore();
    const email = "srinjoymahato9@gmail.com";
    const modRef = db.collection("moderators").doc(email);
    
    // We are simulating the update from the client. Wait, from admin SDK it bypasses rules.
    // Instead, we just want to know if the RULES allow this update.
    console.log("We want to test if the rules work, but admin SDK bypasses them.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
