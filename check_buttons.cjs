const fs = require('fs');
const files = fs.readdirSync('src/components');
files.filter(f => f.endsWith('.tsx')).forEach(file => {
  const content = fs.readFileSync('src/components/' + file, 'utf8');
  let openButtonCount = 0;
  let matches = [...content.matchAll(/<button[^>]*>/g)];
  matches.forEach(m => {
    if(!m[0].includes('onClick') && !m[0].includes('type="submit"')) {
      console.log(file + ' -> ' + m[0]);
    }
  });
});
