const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = __dirname;
const backDir = path.join(rootDir, 'back');
const frontDir = path.join(rootDir, 'front');

const publicPort = Number(process.env.PORT || 3000);
const apiPort = String(process.env.API_INTERNAL_PORT || process.env.BACK_PORT || 4000);

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.API_INTERNAL_PORT = apiPort;
process.env.API_PROXY_URL = process.env.API_PROXY_URL || `http://127.0.0.1:${apiPort}`;

const apiProcess = spawn(process.execPath, ['dist/main.js'], {
  cwd: backDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: apiPort,
  },
  stdio: 'inherit',
});

apiProcess.on('exit', (code, signal) => {
  console.error(`[api] process stopped with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
  process.exit(code || 1);
});

function shutdown() {
  if (!apiProcess.killed) apiProcess.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const next = require(path.join(frontDir, 'node_modules', 'next'));
const app = next({ dev: false, dir: frontDir });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http
    .createServer((req, res) => {
      handle(req, res);
    })
    .listen(publicPort, () => {
      console.log(`[front] ready on port ${publicPort}`);
      console.log(`[api] proxied internally on ${process.env.API_PROXY_URL}`);
    });
});
