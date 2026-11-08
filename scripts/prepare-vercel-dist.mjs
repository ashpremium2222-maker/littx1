import { copyFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'staging/combined-app/dist');

renameSync(resolve(distDir, 'index.html'), resolve(distDir, 'app.html'));

for (const file of [
  'index.html',
  'logo.png',
  'dholida-garba-royale.png',
]) {
  copyFileSync(resolve(repoRoot, file), resolve(distDir, file));
}

// Retain legacy URLs as aliases for the main LITTX index page.
copyFileSync(resolve(repoRoot, 'index.html'), resolve(distDir, 'vibora-littx.html'));
copyFileSync(
  resolve(repoRoot, 'index.html'),
  resolve(distDir, 'vibora.html'),
);
