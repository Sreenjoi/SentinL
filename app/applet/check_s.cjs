const admin = require("firebase-admin");
const config = require("./firebase-applet-config.json");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    projectId: config.projectId
  });
}
const db = admin.firestore();
async function main() {
    const snap = await db.collection("moderators").doc("srinjoymahato9@gmail.com").get();
    console.log("Mod:", snap.data());
    const servers = await db.collection("servers").get();
    servers.forEach(s => {
       const d = s.data();
       if (d.name && d.name.toLowerCase().includes("spaghetti")) {
          console.log("Server", s.id, ":", d);
       }
    });
}
main().catch(console.error);
