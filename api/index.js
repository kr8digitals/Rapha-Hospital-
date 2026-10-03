/**
 * Chi-Tom Rapha Hospital & Maternity — content API (Vercel serverless + Supabase)
 * Same contract the front-end already calls: /api/index.php?action=...
 * (vercel.json rewrites /api/index.php -> /api/index)
 *
 * Storage: Supabase Postgres (table public.site_content, locked by RLS).
 * All database access goes through SECURITY DEFINER functions that require DB_SECRET,
 * which exists only as a server-side environment variable.
 *
 * Required env: SUPABASE_URL, SUPABASE_ANON_KEY, DB_SECRET, ADMIN_PASS, TOKEN_SECRET
 */
'use strict';

const crypto = require('crypto');
const SEED = require('./_seed.json');

const env = (k) => process.env[k] || '';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/* ---------- database (Supabase RPC over HTTPS) ---------- */
async function rpc(fn, args) {
  const url = env('SUPABASE_URL').replace(/\/$/, '') + '/rest/v1/rpc/' + fn;
  const key = env('SUPABASE_ANON_KEY');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
    body: JSON.stringify(Object.assign({ p_secret: env('DB_SECRET') }, args || {}))
  });
  const text = await r.text();
  if (!r.ok) throw new Error('db ' + fn + ' ' + r.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

function seed() {
  const d = JSON.parse(JSON.stringify(SEED));
  d.testimonials = Array.isArray(d.testimonials) ? d.testimonials : [];
  return d;
}

/* ---------- auth (signed, expiring bearer token) ---------- */
const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(payload) {
  return crypto.createHmac('sha256', env('TOKEN_SECRET')).update(payload).digest('base64url');
}
function makeToken() {
  const p = b64u(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  return p + '.' + sign(p);
}
function safeEq(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function isAuthed(req) {
  const h = String(req.headers['authorization'] || '');
  if (!h.startsWith('Bearer ')) return false;
  const [p, s] = h.slice(7).split('.');
  if (!p || !s || !safeEq(s, sign(p))) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}

/* ---------- helpers ---------- */
const NEG = /angry|anger|bad(ly)?|awful|horrible|terrible|atrocious|worst|disappoint|unhappy|unsatisfied|unprofessional|rud(e|ely|eness)|negligen|neglect|ignor(e|ed|ance)|abandon|dismiss|refus|waste of (time|money|resources)|scam|fraud|rip ?off|overcharg|filth|unhygienic|complain|abuse|poor (service|care|treatment|attitude)|never (again|come back|return)|avoid (this|them|it)|regret|useless|incompet|kept (me |us )?wait|waited (forever|hours|a long time|too long)|no (one|anyone|proper) (help|care|attention|respect)|indifferent|delay(ed)? (my |our )?(treatment|diagnosis|response)|missed (diagnosis|appointment)|died|killed|sue(d)?|court|legal action|threat|swindl|cheat(ed|ing)?|stole|robbed|dirty/i;
const isCriticism = (msg, rating) => NEG.test(String(msg || '')) || (rating && rating <= 2);

function json(res, obj, code) {
  res.status(code || 200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(JSON.stringify(obj));
}
function body(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(String(b || '')); } catch (e) { return {}; }
}

/* ---------- handler ---------- */
module.exports = async function handler(req, res) {
  const action = String((req.query && req.query.action) || '');
  try {
    if (action === 'public') {
      if (req.method !== 'GET') return json(res, { ok: false, error: 'GET only' }, 405);
      return json(res, { ok: true, content: await rpc('rapha_public_content') });
    }

    if (action === 'testimonial') {
      if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
      const b = body(req);
      const msg = String(b.message || '').trim();
      if (msg.length < 12) return json(res, { ok: false, error: 'Please write a little more — at least a couple of sentences.' }, 422);
      const kind = b.kind === 'heard' ? 'heard' : 'experience';
      let rating = null;
      if (kind === 'experience' && b.rating >= 1 && b.rating <= 5) rating = b.rating;
      const flagged = !!isCriticism(msg, rating);
      await rpc('rapha_add_testimonial', {
        p_item: {
          id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name: String(b.name || '').trim().slice(0, 60),
          relation: String(b.relation || 'Community member').trim().slice(0, 40),
          kind, rating, message: msg.slice(0, 5000),
          date: new Date().toISOString().slice(0, 10),
          pinned: false, status: flagged ? 'hidden' : 'publish', flagged
        }
      });
      return json(res, { ok: true, status: flagged ? 'hidden' : 'publish' });
    }

    if (action === 'login') {
      if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
      const b = body(req);
      if (env('ADMIN_PASS') && b.password && safeEq(b.password, env('ADMIN_PASS'))) return json(res, { ok: true, token: makeToken() });
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return json(res, { ok: false, error: 'Incorrect password.' }, 401);
    }

    if (!isAuthed(req)) return json(res, { ok: false, error: 'Unauthorized' }, 401);

    if (action === 'admin_content') {
      if (req.method !== 'GET') return json(res, { ok: false, error: 'GET only' }, 405);
      return json(res, { ok: true, content: await rpc('rapha_admin_content') });
    }
    if (action === 'save') {
      if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
      const b = body(req), patch = {};
      for (const k of ['settings', 'posts', 'announcements', 'testimonials']) {
        if (k === 'settings') { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) patch[k] = b[k]; }
        else if (Array.isArray(b[k])) patch[k] = b[k];
      }
      await rpc('rapha_save_content', { p_patch: patch });
      return json(res, { ok: true });
    }
    if (action === 'backup') {
      const content = await rpc('rapha_admin_content');
      res.status(200);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="chitom-rapha-content-' + new Date().toISOString().slice(0, 10) + '.json"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(JSON.stringify(content, null, 2));
    }
    if (action === 'import') {
      if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
      const b = body(req);
      if (!b.settings || !Array.isArray(b.posts) || !Array.isArray(b.announcements) || !Array.isArray(b.testimonials)) {
        return json(res, { ok: false, error: 'That file is not a valid site backup.' }, 422);
      }
      await rpc('rapha_replace_content', { p_content: b });
      return json(res, { ok: true });
    }
    if (action === 'reset') {
      if (req.method !== 'POST') return json(res, { ok: false, error: 'POST only' }, 405);
      await rpc('rapha_replace_content', { p_content: seed() });
      return json(res, { ok: true });
    }
    return json(res, { ok: false, error: 'Unknown action' }, 404);
  } catch (e) {
    console.error('[api]', action, e && e.message);
    return json(res, { ok: false, error: 'The server could not complete that request. Please try again.' }, 500);
  }
};
