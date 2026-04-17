/**
 * prototype-host Worker
 *
 * Serves static files from R2 with HMAC-cookie password protection.
 *
 * Required secrets (set in Cloudflare dashboard → Settings → Variables & Secrets):
 *   ACCESS_PASSWORD — the password clients must enter
 *
 * R2 binding:
 *   BUCKET → prototypes-bucket
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Auth endpoints ──────────────────────────────────
    if (url.pathname === '/api/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }
    if (url.pathname === '/api/logout') {
      return handleLogout();
    }

    // ── Check authentication ────────────────────────────
    // Only lock the root gallery and project list. 
    // Subdirectories (individual prototypes) are public.
    const requiresAuth = url.pathname === '/' || 
                         url.pathname === '/index.html' || 
                         url.pathname === '/projects.json';

    if (requiresAuth) {
      const authenticated = await isAuthenticated(request, env);
      if (!authenticated) {
        return loginPage();
      }
    }

    // ── Canonical redirect: /index.html → / ────────────
    if (url.pathname === '/index.html') {
      return Response.redirect(new URL('/', url).href, 301);
    }

    // ── Serve from R2 ───────────────────────────────────
    let path = url.pathname.slice(1); // Remove leading slash

    // Normalise trailing slash → directory index
    if (!path || path.endsWith('/')) {
      path = path + 'index.html';
    }

    let object = await env.BUCKET.get(path);

    // If not found and no extension, try as a directory index
    if (!object && !path.includes('.')) {
      object = await env.BUCKET.get(path + '/index.html');
    }

    if (!object) {
      // Try root 404 page, else plain text
      const notFound = await env.BUCKET.get('404.html');
      return new Response(notFound ? notFound.body : 'Not found: ' + path, {
        status: 404,
        headers: { 'Content-Type': notFound ? 'text/html; charset=utf-8' : 'text/plain' },
      });
    }

    const contentType = getContentType(path);
    const ext = path.split('.').pop().toLowerCase();
    const isStatic = ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'webm'].includes(ext);
    const cacheControl = isStatic ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate';

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};

/* ═══════════════════════════════════════════════════════
   AUTH HELPERS
═══════════════════════════════════════════════════════ */

async function generateToken(secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('wf-proto-authenticated'));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isAuthenticated(request, env) {
  if (!env.ACCESS_PASSWORD) return true; // No password configured → open
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/wf_auth=([a-f0-9]+)/);
  if (!match) return false;
  const expected = await generateToken(env.ACCESS_PASSWORD);
  return match[1] === expected;
}

async function handleAuth(request, env) {
  try {
    const body = await request.formData();
    const password = body.get('password') || '';
    if (password === env.ACCESS_PASSWORD) {
      const token = await generateToken(env.ACCESS_PASSWORD);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `wf_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      });
    }
    return loginPage('Incorrect password. Please try again.');
  } catch {
    return loginPage('Something went wrong. Please try again.');
  }
}

function handleLogout() {
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': 'wf_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
}

/* ═══════════════════════════════════════════════════════
   CONTENT TYPE
═══════════════════════════════════════════════════════ */

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
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
    'zip': 'application/zip',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
  };
  return types[ext] || 'application/octet-stream';
}

/* ═══════════════════════════════════════════════════════
   LOGIN PAGE
═══════════════════════════════════════════════════════ */

function loginPage(error = '') {
  const errorHTML = error
    ? `<p class="auth-error visible">${error}</p>`
    : `<p class="auth-error"></p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Required — Webflow Lab</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #06060b; --bg2: #0d0d15; --border: rgba(255,255,255,0.06);
      --text: #f0f0f5; --text2: rgba(240,240,245,0.55); --text3: rgba(240,240,245,0.3);
      --accent: #7c6aff; --accent-soft: rgba(124,106,255,0.12); --accent-glow: rgba(124,106,255,0.25);
      --red: #f87171; --red-soft: rgba(248,113,113,0.1);
    }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; align-items: center; justify-content: center; -webkit-font-smoothing: antialiased; }
    .glow { position: fixed; width: 500px; height: 500px; border-radius: 50%; filter: blur(120px); opacity: 0.06; pointer-events: none; }
    .glow--a { background: var(--accent); top: -200px; right: -100px; }
    .glow--b { background: #3b82f6; bottom: -250px; left: -150px; }
    .card { width: 100%; max-width: 400px; padding: 48px 40px; background: var(--bg2); border: 1px solid var(--border); border-radius: 16px; text-align: center; position: relative; animation: enter 0.6s cubic-bezier(0.16,1,0.3,1) both; }
    @keyframes enter { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .card::before { content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 200px; height: 1px; background: linear-gradient(90deg, transparent, var(--accent), transparent); }
    .icon { width: 56px; height: 56px; margin: 0 auto 24px; border-radius: 14px; background: var(--accent-soft); border: 1px solid rgba(124,106,255,0.15); display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 24px; height: 24px; stroke: var(--accent); fill: none; stroke-width: 1.5; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.02em; }
    .sub { font-size: 0.875rem; color: var(--text2); margin-bottom: 32px; line-height: 1.5; }
    .field { position: relative; margin-bottom: 16px; }
    .field input { width: 100%; padding: 14px 48px 14px 16px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 0.875rem; letter-spacing: 0.08em; outline: none; transition: border-color 0.25s, box-shadow 0.25s; }
    .field input::placeholder { color: var(--text3); font-family: 'Inter', sans-serif; letter-spacing: 0; }
    .field input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .toggle { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 4px; color: var(--text3); }
    .toggle svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 1.5; }
    .btn { width: 100%; padding: 14px; border: none; border-radius: 10px; background: var(--accent); color: #fff; font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: background 0.2s, transform 0.15s; }
    .btn:hover { background: #6b58f0; }
    .btn:active { transform: scale(0.98); }
    .auth-error { margin-top: 16px; font-size: 0.8125rem; color: var(--red); opacity: 0; transition: opacity 0.25s; }
    .auth-error.visible { opacity: 1; }
    @media (max-width: 640px) { .card { margin: 0 20px; padding: 36px 28px; } }
  </style>
</head>
<body>
  <div class="glow glow--a"></div>
  <div class="glow glow--b"></div>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
      </svg>
    </div>
    <h1>Prototype Access</h1>
    <p class="sub">Enter the password to view project prototypes.</p>
    <form method="POST" action="/api/auth" autocomplete="off">
      <div class="field">
        <input type="password" name="password" id="pw" placeholder="Enter password" autocomplete="off" spellcheck="false" autofocus>
        <button type="button" class="toggle" onclick="togglePw()">
          <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
      <button type="submit" class="btn">Unlock</button>
    </form>
    ${errorHTML}
  </div>
  <script>
    function togglePw() {
      const pw = document.getElementById('pw');
      pw.type = pw.type === 'password' ? 'text' : 'password';
    }
    ${error ? "document.getElementById('pw').classList.add('error'); setTimeout(() => document.getElementById('pw').classList.remove('error'), 500);" : ''}
  </script>
</body>
</html>`;

  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
