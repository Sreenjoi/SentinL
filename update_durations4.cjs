const fs = require('fs');
const path = require('path');

const componentsDir = path.join(__dirname, 'src', 'components');

fs.readdirSync(componentsDir).forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(componentsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Temporarily replace to avoid collision
    content = content.replace(/duration-500/g, 'duration-D500');
    content = content.replace(/duration-400/g, 'duration-D400');
    content = content.replace(/duration-300/g, 'duration-D300');
    content = content.replace(/duration-200/g, 'duration-D200');
    content = content.replace(/duration-150/g, 'duration-D150');
    content = content.replace(/duration-700/g, 'duration-D700');
    content = content.replace(/duration-1000/g, 'duration-D1000');
    content = content.replace(/duration-100/g, 'duration-D100');
    content = content.replace(/duration-75/g, 'duration-D75');

    // Mappings
    content = content.replace(/duration-D150/g, 'duration-300');
    content = content.replace(/duration-D200/g, 'duration-300');
    content = content.replace(/duration-D300/g, 'duration-500');
    content = content.replace(/duration-D500/g, 'duration-700');
    content = content.replace(/duration-D700/g, 'duration-1000');
    content = content.replace(/duration-D400/g, 'duration-500');
    content = content.replace(/duration-D100/g, 'duration-150');
    content = content.replace(/duration-D75/g, 'duration-100');
    content = content.replace(/duration-D1000/g, 'duration-1000');

    fs.writeFileSync(filePath, content, 'utf8');
  }
});
console.log("Updated durations slightly slower.");
