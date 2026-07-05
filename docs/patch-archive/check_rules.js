import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';

async function check() {
  try {
    const rules = fs.readFileSync('firestore.rules', 'utf8');
    const testEnv = await initializeTestEnvironment({
      projectId: "ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f",
      firestore: {
        rules: rules,
        host: "localhost",
        port: 8080,
      },
    });
    console.log("SUCCESS!");
    await testEnv.cleanup();
  } catch (e) {
    console.error("FAILED:", e);
  }
}
check();
