const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'components');

fs.readdirSync(componentsDir).forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(componentsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Changing duration-150 to duration-200
    content = content.replace(/duration-150/g, 'duration-200');
    // We previously changed 500 to 200, maybe make those 300? 
    // It's probably indistinguishable. Let's just adjust 150 first.
    
    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log("Updated durations slightly slower.");
