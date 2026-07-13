const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(__dirname, '..', '..');
const backDir = path.join(rootDir, 'back');
const frontDir = path.join(rootDir, 'front');
const frontOutDir = path.join(frontDir, 'out');
const frontNextBuildDir = path.join(frontDir, '.next-build');
const backPublicDir = path.join(backDir, 'public');
const rootPublicDir = path.join(rootDir, 'public');
const backDistDir = path.join(backDir, 'dist');
const rootDistDir = path.join(rootDir, 'dist');

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

function resolveFrontOutputDir() {
  const candidates = [frontOutDir, frontNextBuildDir];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  const checked = candidates.map((candidate) => path.relative(rootDir, candidate)).join(', ');
  throw new Error(`Le build front n'a pas genere de sortie statique valide. Dossiers verifies: ${checked}.`);
}

if (!fs.existsSync(frontDir)) {
  throw new Error('Le dossier front est introuvable. Le depot complet doit etre disponible pendant le build.');
}

console.log('[build] Installation des dependances du back avec les devDependencies...');
run(npm, ['install', '--include=dev', '--no-audit', '--no-fund'], { cwd: backDir });

console.log('[build] Installation des dependances du front...');
run(npm, ['ci', '--no-audit', '--no-fund'], { cwd: frontDir });

console.log('[build] Build statique du front Next.js...');
run(npm, ['run', 'build'], {
  cwd: frontDir,
  env: {
    STATIC_EXPORT: '1',
  },
});

const staticFrontDir = resolveFrontOutputDir();

console.log(`[build] Copie du front compile depuis ${path.relative(rootDir, staticFrontDir)} dans back/public...`);
fs.rmSync(backPublicDir, { recursive: true, force: true });
copyDir(staticFrontDir, backPublicDir);

console.log('[build] Build du back NestJS...');
run(npm, ['run', 'build:api'], { cwd: backDir });

console.log('[build] Copie des artefacts a la racine pour Hostinger...');
fs.rmSync(rootDistDir, { recursive: true, force: true });
fs.rmSync(rootPublicDir, { recursive: true, force: true });
copyDir(backDistDir, rootDistDir);
copyDir(backPublicDir, rootPublicDir);

if (!fs.existsSync(path.join(rootDistDir, 'main.js'))) {
  throw new Error('Le fichier dist/main.js attendu par Hostinger est introuvable apres la copie.');
}
