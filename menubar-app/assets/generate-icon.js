const sharp = require('sharp');
const path = require('path');

// Create a 22x22 template icon (black on transparent)
// macOS template icons should be named with "Template" suffix
async function createIcon() {
  const size = 22;
  const size2x = 44;
  
  // SVG for a simple "C" shape (COPE)
  const svg = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="8" fill="none" stroke="black" stroke-width="2.5"/>
      <rect x="11" y="4" width="8" height="4" fill="white"/>
      <rect x="11" y="14" width="8" height="4" fill="white"/>
    </svg>
  `;
  
  // Create 1x icon
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(path.join(__dirname, 'IconTemplate.png'));
  
  // Create 2x icon for retina
  const svg2x = `
    <svg width="${size2x}" height="${size2x}" viewBox="0 0 ${size2x} ${size2x}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="22" cy="22" r="16" fill="none" stroke="black" stroke-width="5"/>
      <rect x="22" y="8" width="16" height="8" fill="white"/>
      <rect x="22" y="28" width="16" height="8" fill="white"/>
    </svg>
  `;
  
  await sharp(Buffer.from(svg2x))
    .resize(size2x, size2x)
    .png()
    .toFile(path.join(__dirname, 'IconTemplate@2x.png'));
  
  console.log('Created IconTemplate.png and IconTemplate@2x.png');
}

createIcon().catch(console.error);
