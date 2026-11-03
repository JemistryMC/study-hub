const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const staticFiles = [
  'index.html',
  'manifest.json',
  'sw.js',
  'favicon.png',
  'icon-192.png',
  'icon-512.png'
];

for (const file of staticFiles) {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
  }
}

console.log('Build complete: static assets copied to dist/');
