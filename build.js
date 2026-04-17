/**
 * Build script for prototype-host (Cloudflare Worker + R2)
 *
 * Steps:
 *   1. Copy all static prototype files to dist/
 *   2. Upload dist/ files to R2 bucket via wrangler
 *
 * CI/CD settings in Cloudflare:
 *   Build command:  npm run build
 *   Deploy command: npx wrangler deploy
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT   = __dirname;
const DIST   = path.join(ROOT, 'dist');
const BUCKET = 'prototypes-bucket';

// Files/dirs to exclude from the static asset copy
const EXCLUDE = new Set([
  'node_modules', 'dist', '.git', '.wrangler', '.gitignore',
  'package.json', 'package-lock.json', 'build.js', 'wrangler.toml', 'src',
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

// ── 1. Clean dist ─────────────────────────────────────
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// ── 2. Copy static assets ─────────────────────────────
const entries = fs.readdirSync(ROOT);
let copied = 0;

for (const entry of entries) {
  if (EXCLUDE.has(entry) || entry.startsWith('.')) continue;
  copyRecursive(path.join(ROOT, entry), path.join(DIST, entry));
  copied++;
  console.log(`  ✓ ${entry}`);
}

console.log(`\n✅ Build complete — ${copied} assets copied to dist/`);

// ── 3. Upload dist/ to R2 ─────────────────────────────
console.log(`\n📤 Uploading to R2 bucket: ${BUCKET}\n`);

function getAllFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...getAllFiles(fullPath, base));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllFiles(DIST);
let uploaded = 0;

for (const file of files) {
  const key = path.relative(DIST, file).replace(/\\/g, '/');
  try {
    execSync(
      `npx wrangler r2 object put ${BUCKET}/${key} --file "${file}"`,
      { stdio: 'pipe' }
    );
    console.log(`  ↑ ${key}`);
    uploaded++;
  } catch (err) {
    console.error(`  ✗ Failed: ${key}`);
    console.error(err.stderr?.toString() || err.message);
    process.exit(1);
  }
}

console.log(`\n✅ Uploaded ${uploaded} files to R2\n`);
