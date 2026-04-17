/**
 * Build script for prototype-host (Cloudflare Worker + R2)
 *
 * Steps:
 *   1. Copy all static prototype files to dist/
 *   2. Upload dist/ files to R2 via S3-compatible API
 *
 * Required CI environment variables:
 *   R2_ACCESS_KEY_ID     — from Cloudflare R2 → Manage R2 API Tokens
 *   R2_SECRET_ACCESS_KEY — from Cloudflare R2 → Manage R2 API Tokens
 *
 * CI/CD settings:
 *   Build command:  npm run build
 *   Deploy command: npx wrangler deploy
 */

const fs   = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const ROOT       = __dirname;
const DIST       = path.join(ROOT, 'dist');
const BUCKET     = 'prototypes-bucket';
const ACCOUNT_ID = 'f208aa20bfcf583465999a026900910e';

// Files/dirs to exclude from the static asset copy
const EXCLUDE = new Set([
  'node_modules', 'dist', '.git', '.wrangler', '.gitignore',
  'package.json', 'package-lock.json', 'bun.lockb', 'build.js',
  'wrangler.toml', 'src', 'README.md',
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

function getContentType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const types = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'pdf': 'application/pdf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
  };
  return types[ext] || 'application/octet-stream';
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

// ── 3. Upload dist/ to R2 via S3-compatible API ───────
const accessKeyId     = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  console.warn('\n⚠️  R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY not set — skipping R2 upload.');
  console.warn('   Files are in dist/ but NOT uploaded to the bucket.\n');
  process.exit(0);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

console.log(`\n📤 Uploading to R2 bucket: ${BUCKET}\n`);

async function upload() {
  const files = getAllFiles(DIST);
  let uploaded = 0;

  for (const file of files) {
    const key         = path.relative(DIST, file).replace(/\\/g, '/');
    const body        = fs.readFileSync(file);
    const contentType = getContentType(file);

    try {
      await s3.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         key,
        Body:        body,
        ContentType: contentType,
      }));
      console.log(`  ↑ ${key}  (${contentType})`);
      uploaded++;
    } catch (err) {
      console.error(`  ✗ Failed: ${key}`);
      console.error(`     ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Uploaded ${uploaded} files to R2\n`);
}

upload().catch(err => {
  console.error('Upload failed:', err.message);
  process.exit(1);
});
