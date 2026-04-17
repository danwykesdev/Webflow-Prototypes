/**
 * Build script for Cloudflare Pages deployment.
 * Copies all static prototype files into dist/ and injects the _worker.js.
 * Automatically picks up new prototype folders — no edits needed when adding projects.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Files/dirs to exclude from the static asset copy
const EXCLUDE = new Set([
  'node_modules',
  'dist',
  '.git',
  '.wrangler',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'build.js',
  'wrangler.toml',
  'src',
  'README.md',
]);

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 2. Copy static assets (everything not excluded)
const entries = fs.readdirSync(ROOT);
let copied = 0;

for (const entry of entries) {
  if (EXCLUDE.has(entry) || entry.startsWith('.')) continue;
  const srcPath = path.join(ROOT, entry);
  const destPath = path.join(DIST, entry);
  copyRecursive(srcPath, destPath);
  copied++;
  console.log(`  ✓ ${entry}`);
}

// 3. Copy _worker.js into dist
const workerSrc = path.join(ROOT, 'src', '_worker.js');
const workerDest = path.join(DIST, '_worker.js');

if (fs.existsSync(workerSrc)) {
  fs.copyFileSync(workerSrc, workerDest);
  console.log('  ✓ _worker.js (server-side auth)');
} else {
  console.warn('  ⚠ src/_worker.js not found — deploying without server-side auth');
}

console.log(`\n✅ Build complete — ${copied} assets → dist/\n`);
