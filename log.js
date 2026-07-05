fetch('http://localhost:3000/api/bot-logs').then(r=>r.json()).then(d=>console.log(JSON.stringify(d.logs, null, 2)));
