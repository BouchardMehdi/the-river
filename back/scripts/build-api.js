const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const backDir = path.resolve(__dirname, '..');
const distDir = path.join(backDir, 'dist');
const tscBin = path.join(backDir, 'node_modules', 'typescript', 'bin', 'tsc');
const entryFile = path.join(distDir, 'main.js');

if (!fs.existsSync(tscBin)) {
  throw new Error('TypeScript est introuvable dans back/node_modules. Lance npm install --include=dev avant le build.');
}

console.log('[build:api] Nettoyage du dossier dist...');
fs.rmSync(distDir, { recursive: true, force: true });

console.log('[build:api] Compilation TypeScript du back...');
execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.build.json'], {
  cwd: backDir,
  stdio: 'inherit',
  env: process.env,
});

if (!fs.existsSync(entryFile)) {
  throw new Error('La compilation API est terminee, mais dist/main.js est introuvable.');
}

console.log('[build:api] OK: dist/main.js genere.');
