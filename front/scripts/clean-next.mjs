import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const target = process.argv[2] || '.next';
const resolved = resolve(process.cwd(), target);
const cwd = resolve(process.cwd());

if (!resolved.startsWith(cwd)) {
  throw new Error(`Refusing to remove path outside project: ${resolved}`);
}

await rm(resolved, { force: true, recursive: true });
console.log(`Removed ${target}`);
