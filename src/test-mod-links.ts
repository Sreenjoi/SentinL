import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import config from "../firebase-applet-config.json";
import dotenv from "dotenv";

dotenv.config();

const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  try {
    const creds = await signInWithEmailAndPassword(auth, process.env.VITE_TEST_USER_EMAIL || "srinjoymahato9@gmail.com", process.env.VITE_TEST_USER_PASSWORD || "password123");
    console.log("Logged in as:", creds.user.email);
    
    // Simulate App.tsx link
    const modRef = doc(db, "moderators", creds.user.email!);
    await setDoc(modRef, {
      discordId: "123",
      discordUsername: "test",
      discordAvatar: "avatar_id",
      serverIds: [],
      serverNames: {}
    }, { merge: true });
    console.log("Success! App.tsx updated modRef successfully.");
    process.exit(0);
  } catch (e) {
    console.error("Failed:", e);
    process.exit(1);
  }
}
run();
