const path = require('path');
const fs = require('fs');

const backEntry = path.join(__dirname, 'back', 'dist', 'main.js');
const rootEntry = path.join(__dirname, 'dist', 'main.js');

if (fs.existsSync(backEntry)) {
  process.chdir(path.join(__dirname, 'back'));
  require(backEntry);
} else if (fs.existsSync(rootEntry)) {
  require(rootEntry);
} else {
  throw new Error('Aucun point d entree NestJS trouve: back/dist/main.js ou dist/main.js.');
}
