const http = require('http');

http.get('http://localhost:3000/api/bot-logs', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const logs = JSON.parse(data);
      console.log(logs.logs ? logs.logs.slice(-30).join('\n') : logs.slice(-30).join('\n'));
    } catch(e) {
      console.log('Error parsing logs', e.message);
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
