import fs from 'fs';

async function check() {
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const res = await fetch('http://localhost:8080/emulator/v1/projects/ai-studio-3fc0d3bc-89a3-4bfe-a9bb-ac50c317da1f:securityRules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rules: {
        files: [{ name: "firestore.rules", content: rules }]
      }
    })
  });
  const data = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", data);
}
check();
