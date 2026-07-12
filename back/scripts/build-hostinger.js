const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(__dirname, '..', '..');
const backDir = path.join(rootDir, 'back');
const frontDir = path.join(rootDir, 'front');
const frontOutDir = path.join(frontDir, 'out');
const publicDir = path.join(backDir, 'public');

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
}

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!fs.existsSync(frontDir)) {
  throw new Error('Le dossier front est introuvable. Le depot complet doit etre disponible pendant le build.');
}

console.log('[build] Installation des dependances du back avec les devDependencies...');
run(npm, ['ci', '--include=dev'], { cwd: backDir });

console.log('[build] Installation des dependances du front...');
run(npm, ['ci'], { cwd: frontDir });

console.log('[build] Build statique du front Next.js...');
run(npm, ['run', 'build'], {
  cwd: frontDir,
  env: {
    STATIC_EXPORT: '1',
  },
});

if (!fs.existsSync(frontOutDir)) {
  throw new Error("Le build front n'a pas genere le dossier front/out.");
}

console.log('[build] Copie du front compile dans back/public...');
fs.rmSync(publicDir, { recursive: true, force: true });
copyDir(frontOutDir, publicDir);

console.log('[build] Build du back NestJS...');
run(npm, ['run', 'build:api'], { cwd: backDir });
