const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  if (
    (content.includes('setDoc') || content.includes('updateDoc') || content.includes('deleteDoc') || content.includes('getDoc') || content.includes('getDocs') || content.includes('onSnapshot')) 
    && !content.includes('handleFirestoreError')
  ) {
    console.log(file);
  }
});
