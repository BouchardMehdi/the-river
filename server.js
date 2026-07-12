const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const backDir = path.join(rootDir, 'back');
const rootEntry = path.join(rootDir, 'dist', 'main.js');
const backEntry = path.join(backDir, 'dist', 'main.js');

if (fs.existsSync(backEntry)) {
  process.chdir(backDir);
  require(backEntry);
} else if (fs.existsSync(rootEntry)) {
  require(rootEntry);
} else {
  throw new Error('Build introuvable: impossible de trouver dist/main.js ou back/dist/main.js.');
}
