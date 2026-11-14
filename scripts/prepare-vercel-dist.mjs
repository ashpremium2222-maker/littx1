import { copyFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'staging/combined-app/dist');

renameSync(resolve(distDir, 'index.html'), resolve(distDir, 'app.html'));

for (const file of [
  'index.html',
  'logo.png',
  'vibora-littx.html',
  'dholida-garba-royale.png',
]) {
  copyFileSync(resolve(repoRoot, file), resolve(distDir, file));
}

// Retain the legacy Vibora URL as an alias for the standalone app.
copyFileSync(
  resolve(repoRoot, 'vibora-littx.html'),
  resolve(distDir, 'vibora.html'),
);
