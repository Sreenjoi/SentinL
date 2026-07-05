import { getFirestore } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
admin.initializeApp({ projectId: "demo-project" });
const db = getFirestore();
async function run() {
  try {
    await db.collection("test").doc("nonexistent").update({ a: 1 });
  } catch (e) {
    console.log("update non-existent:");
    console.log(e);
  }
}
run();
