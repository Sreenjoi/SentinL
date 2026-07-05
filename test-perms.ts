import http from 'http';

http.get('http://localhost:3000/api/bot-guilds', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Guilds:', parsed.guilds);
      fetch_perm(parsed.guilds[0]);
    } catch(e) {
      console.log('Error parsing logs', e.message);
    }
  });
}).on('error', (err) => {
  console.error("error: " + err.message);
});

function fetch_perm(serverId) {
  if (!serverId) { console.log('no serverid'); return; }
  http.get('http://localhost:3000/api/discord/permissions/' + serverId, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => console.log('perms:', data));
  });
}
