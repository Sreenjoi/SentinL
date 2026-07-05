const http = require('http');
http.get('http://127.0.0.1:3000/api/debug-spaghetti', (res) => {
  let dbg = '';
  res.on('data', d => dbg += d);
  res.on('end', () => console.log(dbg));
});
