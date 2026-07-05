const token = process.argv[2];
const project = process.argv[3];
const dbId = process.argv[4];
const docPath = process.argv[5];

async function main() {
    const fetch = require('node-fetch');
    const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/${dbId}/documents/${docPath}`;
    
    // First, let's create it
    const create = await fetch(url + "?documentId=testdoc", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            fields: {
                participantsCount: { integerValue: 0 },
                participants: { arrayValue: { values: [] } }
            }
        })
    });
    console.log("Create", create.status, await create.text());
}
main();
