import { getAdminDB } from "./server.ts";
async function main() {
    const db = getAdminDB();
    const snap = await db.collection("moderators").doc("srinjoymahato9@gmail.com").get();
    console.log("Mod:", snap.data());
    
    // Find server "spaghettis server 2"
    const serverSnap = await db.collection("servers").where("name", "==", "Spaghetti\'s server 2").get();
    serverSnap.forEach(s => {
        console.log("Server", s.id, ":", s.data());
    });
}
main().catch(console.error);
