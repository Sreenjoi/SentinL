const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'components');

fs.readdirSync(componentsDir).forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(componentsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace duration-300 with duration-150
    content = content.replace(/duration-500/g, 'duration-200');
    content = content.replace(/duration-300/g, 'duration-150');
    // Maybe also duration-700
    content = content.replace(/duration-700/g, 'duration-300');
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log("Updated durations.");
