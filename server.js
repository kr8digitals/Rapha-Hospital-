/**
 * Chi-Tom Rapha Hospital & Maternity — Node.js web app
 * ------------------------------------------------------------------
 * Zero-dependency server: serves the static site and runs the content API.
 *
 * API (same URLs the front-end already calls):
 *   GET  /api/index.php?action=public          public content
 *   POST /api/index.php?action=testimonial     visitor submits a story
 *   POST /api/index.php?action=login           {password} -> {token}
 *   GET  /api/index.php?action=admin_content   full content (Bearer token)
 *   POST /api/index.php?action=save            {settings?,posts?,announcements?,testimonials?}
 *   GET  /api/index.php?action=backup          downloads full content JSON
 *   POST /api/index.php?action=import          replaces content from JSON
 *   POST /api/index.php?action=reset           restores the original seed
 *
 * Storage: data/content.json (live, auto-created) + data/seed.json (pristine).
 * /data/ is never served as a static file — only through the API.
 *
 * Config via environment (defaults work out of the box):
 *   PORT (default 3000) · ADMIN_PASS · API_TOKEN
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'content.json');
const SEED_FILE = path.join(DATA_DIR, 'seed.json');

const ADMIN_PASS = process.env.ADMIN_PASS || 'Rapha@Adm!no/*';
const API_TOKEN = process.env.API_TOKEN || 'ctrh-r7d41b8e63a55011c9d72e4ab6f30-9f2c';
const PORT = parseInt(process.env.PORT || '3000', 10);

/* ---------------- storage ---------------- */
function seed() {
  if (fs.existsSync(SEED_FILE)) {
    const d = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    if (d && d.settings && Array.isArray(d.posts) && Array.isArray(d.announcements)) {
      d.testimonials = Array.isArray(d.testimonials) ? d.testimonials : [];
      return d;
    }
  }
  return { settings: {}, posts: [], announcements: [], testimonials: [] };
}
function load() {
  if (fs.existsSync(DATA_FILE) && fs.statSync(DATA_FILE).size > 0) {
    try {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (d && d.settings && Array.isArray(d.posts) && Array.isArray(d.announcements) && Array.isArray(d.testimonials)) return d;
    } catch (e) { /* fall through and re-seed */ }
  }
  const s = seed();
  save(s);
  return s;
}
function save(s) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, DATA_FILE);
}

/* ---------------- api helpers ---------------- */
function publicView(s) {
  return {
    settings: s.settings || {},
    posts: (s.posts || []).filter(p => p.status !== 'draft'),
    announcements: s.announcements || [],
    testimonials: (s.testimonials || []).filter(t => t.status === 'publish')
  };
}
const NEG = /angry|anger|bad(ly)?|awful|horrible|terrible|atrocious|worst|disappoint|unhappy|unsatisfied|unprofessional|rud(e|ely|eness)|negligen|neglect|ignor(e|ed|ance)|abandon|dismiss|refus|waste of (time|money|resources)|scam|fraud|rip ?off|overcharg|filth|unhygienic|complain|abuse|poor (service|care|treatment|attitude)|never (again|come back|return)|avoid (this|them|it)|regret|useless|incompet|kept (me |us )?wait|waited (forever|hours|a long time|too long)|no (one|anyone|proper) (help|care|attention|respect)|indifferent|delay(ed)? (my |our )?(treatment|diagnosis|response)|missed (diagnosis|appointment)|died|killed|sue(d)?|court|legal action|threat|swindl|cheat(ed|ing)?|stole|robbed|dirty/i;
function isCriticism(msg, rating) { return NEG.test(String(msg || '')) || (rating && rating <= 2); }
function json(res, obj, code) {
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function isAuthed(req) {
  return (req.headers['authorization'] || '') === 'Bearer ' + API_TOKEN;
}

async function handleApi(req, res, action) {
  const store = load();

  if (action === 'public') {
    if (req.method !== 'GET') return json(res, { ok: false, error: 'GET only' }, 405);
    return json(res, { ok: true, content: publicView(store) });
  }
  if (action === 'testimonial') {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
    const b = await readBody(req);
    const msg = String(b.message || '').trim();
    if (msg.length < 12) return json(res, { ok: false, error: 'Please write a little more — at least a couple of sentences.' }, 422);
    const kind = b.kind === 'heard' ? 'heard' : 'experience';
    let rating = null;
    if (kind === 'experience' && b.rating >= 1 && b.rating <= 5) rating = b.rating;
    const flagged = isCriticism(msg, rating);
    store.testimonials = store.testimonials || [];
    store.testimonials.push({
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: String(b.name || '').trim().slice(0, 60),
      relation: String(b.relation || 'Community member').trim().slice(0, 40),
      kind, rating, message: msg.slice(0, 5000),
      date: new Date().toISOString().slice(0, 10),
      pinned: false, status: flagged ? 'hidden' : 'publish', flagged
    });
    save(store);
    return json(res, { ok: true, status: flagged ? 'hidden' : 'publish' });
  }
  if (action === 'login') {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
    const b = await readBody(req);
    if (b.password && b.password === ADMIN_PASS) return json(res, { ok: true, token: API_TOKEN });
    return json(res, { ok: false, error: 'Incorrect password.' }, 401);
  }
  if (!isAuthed(req)) return json(res, { ok: false, error: 'Unauthorized' }, 401);
  if (action === 'admin_content') {
    if (req.method !== 'GET') return json(res, { ok: false, error: 'GET only' }, 405);
    return json(res, { ok: true, content: store });
  }
  if (action === 'save') {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
    const b = await readBody(req);
    for (const k of ['settings', 'posts', 'announcements', 'testimonials']) {
      if (k === 'settings') { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) store[k] = b[k]; }
      else if (Array.isArray(b[k])) store[k] = b[k];
    }
    save(store);
    return json(res, { ok: true });
  }
  if (action === 'backup') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="chitom-rapha-content-' + new Date().toISOString().slice(0, 10) + '.json"',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(JSON.stringify(store, null, 2));
  }
  if (action === 'import') {
    if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
    const b = await readBody(req);
    if (!b.settings || !Array.isArray(b.posts) || !Array.isArray(b.announcements) || !Array.isArray(b.testimonials)) {
      return json(res, { ok: false, error: 'That file is not a valid site backup.' }, 422);
    }
    save(b);
    return json(res, { ok: true });
  }
  if (action === 'reset') {
    const s = seed();
    save(s);
    return json(res, { ok: true });
  }
  return json(res, { ok: false, error: 'Unknown action' }, 404);
}

/* ---------------- static ---------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, p) {
  if (p === '/') p = '/index.html';
  if (p.startsWith('/data/')) { res.writeHead(404); return res.end(); }   // never expose the data store
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    return res.end(fs.readFileSync(file));
  }
  const nf = path.join(ROOT, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { res.writeHead(400); return res.end(); }

  if (p === '/api/index.php') {
    const u = new URL(req.url, 'http://localhost');
    return handleApi(req, res, u.searchParams.get('action') || '');
  }
  if (p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false,"error":"Unknown action"}'); }
  return serveStatic(req, res, p);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Rapha Hospital web app running on port ' + PORT);
});
