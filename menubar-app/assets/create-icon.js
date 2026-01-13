const fs = require('fs');
const path = require('path');

// Create a proper 22x22 template icon (black on transparent)
// This is a "C" letter icon for COPE

// PNG header + IHDR + IDAT for a simple 22x22 icon
// Using a base64 encoded minimal template icon

// Simple black "C" on transparent background (22x22)
const iconData = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, // IHDR length
  0x49, 0x48, 0x44, 0x52, // IHDR type
  0x00, 0x00, 0x00, 0x16, // width: 22
  0x00, 0x00, 0x00, 0x16, // height: 22
  0x08, 0x06, // 8-bit RGBA
  0x00, 0x00, 0x00, // compression, filter, interlace
  0xbe, 0xd6, 0xed, 0xa0, // IHDR CRC
  // ... rest would be IDAT data
]);

// For simplicity, let's create an SVG and convert description
// Actually, let's create a simple monochrome PNG properly

const { execSync } = require('child_process');

// Create SVG first
const svg = `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
  <circle cx="11" cy="11" r="9" fill="none" stroke="black" stroke-width="2"/>
  <path d="M15 7 Q11 5 7 7 Q5 9 5 11 Q5 13 7 15 Q11 17 15 15" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"/>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svg);

// Try to use sips to convert (macOS built-in)
try {
  // Create a simple PNG with ImageMagick or sips if available
  // For now, just create a placeholder that Electron can use
  console.log('Created icon.svg - you may need to manually convert to PNG');
  console.log('Run: sips -s format png icon.svg --out IconTemplate.png');
} catch (e) {
  console.log('Note: Install imagemagick to auto-convert SVG to PNG');
}
