import { db } from "./src/firebase.js";

async function run() {
  const snap = await db.collection("servers").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`Server: ${doc.id}, Name: ${data.name}`);
    const flags = await db.collection("flaggedMessages").where("serverId", "==", doc.id).get();
    console.log(`  Flags: ${flags.size}`);
    
    // Calculate penalty
    let penalty = 0;
    flags.forEach(f => {
      const d = f.data();
      const level = d.level?.toLowerCase() || "";
      if (level === "extreme" || d.actionTaken === "ban" || d.actionTaken === "timeout" || d.actionTaken === "deleted" || d.actionTaken === "auto_deleted") {
          penalty += 5;
      } else if (level === "high") {
          penalty += 3;
      } else if (level === "medium") {
          penalty += 2;
      } else {
          penalty += 1;
      }
    });

    console.log(`  Penalty Points: ${penalty}`);
    if (data.healthWidget) {
       console.log(`  Score: ${data.healthWidget.lastScore}`);
    }
  }
}

run().catch(console.error);
