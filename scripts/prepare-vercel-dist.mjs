import { copyFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'staging/combined-app/dist');

renameSync(resolve(distDir, 'index.html'), resolve(distDir, 'app.html'));

for (const file of [
  'logo.png',
  'vibora-littx.html',
  'dholida-garba-royale.png',
]) {
  copyFileSync(resolve(repoRoot, file), resolve(distDir, file));
}

// The user's full-screen Vibora HTML app is the public landing experience.
// Keep the React shell available as app.html for its dedicated portal routes.
copyFileSync(resolve(repoRoot, 'vibora-littx.html'), resolve(distDir, 'index.html'));
copyFileSync(
  resolve(repoRoot, 'vibora-littx.html'),
  resolve(distDir, 'vibora.html'),
);
