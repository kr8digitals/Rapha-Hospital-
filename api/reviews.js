/**
 * Chi-Tom Rapha Hospital & Maternity — Google Reviews sync (Vercel serverless)
 *
 * GET  /api/reviews            public read: fresh-or-cached reviews for the site
 * POST /api/reviews?force=1    admin (Bearer token): force an immediate re-sync
 *
 * Providers (in order):
 *   1. Google Business Profile API v4 (recommended) —
 *      accounts.locations.reviews.list with full pagination.
 *      Env: GBP_API_KEY, GBP_LOCATION_NAME  (e.g. "accounts/{account}/locations/{location}")
 *   2. Places API (Details, fields=reviews) — known-limited review window; used
 *      only as a fallback and labelled "google-places (limited)".
 *      Env: PLACES_API_KEY, GBP_PLACE_ID
 *
 * Cache: Supabase table public.google_reviews_cache via SECURITY DEFINER functions
 * rapha_reviews_get / rapha_reviews_set (see supabase/schema.sql, v2 section).
 * TTL: 6 hours. A failed sync falls back to the stale cache.
 *
 * Compliance note: Google's review-snippet policy does not allow self-serving
 * aggregate-rating markup, so the front-end renders individual reviews verbatim
 * (name, stars, date, text) with attribution and a link back to the profile —
 * no aggregate "4.8 stars" JSON-LD is emitted.
 *
 * Required env: SUPABASE_URL, SUPABASE_ANON_KEY, DB_SECRET (same as api/index.js)
 * Optional env: GBP_API_KEY, GBP_LOCATION_NAME, PLACES_API_KEY, GBP_PLACE_ID
 */
'use strict';

const crypto = require('crypto');
const env = (k) => process.env[k] || '';
const PROFILE_URL = 'https://share.google/uTVHrFwhDPnr8HXfU';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/* ---------- helpers (mirror api/index.js) ---------- */
function json(res, obj, code) {
  res.status(code || 200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}
const b64u = (b) => Buffer.from(b).toString('base64url');
function sign(payload) {
  return crypto.createHmac('sha256', env('TOKEN_SECRET')).update(payload).digest('base64url');
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

/* ---------- cache ---------- */
async function cacheGet() {
  try {
    const d = await rpc('rapha_reviews_get', {});
    return d && d.payload ? { payload: d.payload, synced_at: d.synced_at } : null;
  } catch (e) { return null; }
}
async function cacheSet(payload) {
  try { await rpc('rapha_reviews_set', { p_payload: payload }); } catch (e) { /* cache is best-effort */ }
}

/* ---------- seeded snapshot (real reviews captured from the public profile,
   pasted by the owner — used until live API credentials are configured) ---- */
let SEED_SNAPSHOT = null;
try { SEED_SNAPSHOT = require('./_reviews_seed.json'); } catch (e) { /* not present */ }

/* ---------- providers ---------- */
async function gbpReviews() {
  const key = env('GBP_API_KEY');
  const loc = env('GBP_LOCATION_NAME');
  if (!key || !loc) throw new Error('GBP_API_KEY / GBP_LOCATION_NAME not configured');
  const out = [];
  let token = '';
  do {
    const u = 'https://mybusinessbusinessinformation.googleapis.com/v4/' +
      loc.split('/').map(encodeURIComponent).join('/') +
      '/reviews?pageSize=50' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    const r = await fetch(u, { headers: { 'X-Goog-Api-Key': key, 'X-Goog-AuthUser': 'blocked' } });
    if (!r.ok) {
      const t = await r.text();
      throw new Error('GBP API ' + r.status + ' ' + t.slice(0, 180));
    }
    const d = await r.json();
    (d.reviews || []).forEach((rv) => out.push({
      name: rv.authorDisplayName || 'Google user',
      rating: Number(rv.starRating) || 0,
      text: rv.comment || '',
      date: String(rv.timePosted || '').slice(0, 10)
    }));
    token = d.nextPageToken || '';
  } while (token);
  return out;
}
async function placesReviews() {
  const key = env('PLACES_API_KEY');
  const pid = env('GBP_PLACE_ID');
  if (!key || !pid) throw new Error('PLACES_API_KEY / GBP_PLACE_ID not configured');
  const u = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' +
    encodeURIComponent(pid) + '&fields=reviews,rating&key=' + encodeURIComponent(key);
  const r = await fetch(u);
  if (!r.ok) throw new Error('Places API ' + r.status);
  const d = await r.json();
  if (d.status !== 'OK') throw new Error('Places status ' + d.status);
  return (d.result.reviews || []).map((rv) => ({
    name: rv.authorName || 'Google user',
    rating: Number(rv.rating) || 0,
    text: rv.text || '',
    date: rv.time ? new Date(rv.time * 1000).toISOString().slice(0, 10) : ''
  }));
}
async function sync() {
  const errors = [];
  try {
    const v = await gbpReviews();
    if (v.length) return { reviews: v, source: 'google-business-profile' };
    errors.push('GBP: API ok but 0 reviews on the profile yet');
  } catch (e) { errors.push('GBP: ' + e.message); }
  try {
    const v = await placesReviews();
    if (v.length) return { reviews: v, source: 'google-places (limited)' };
    errors.push('Places: 0 reviews returned');
  } catch (e) { errors.push('Places: ' + e.message); }
  throw new Error(errors.join(' | '));
}

/* ---------- handler ---------- */
exports.handler = async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && !isAuthed(req)) {
    return json(res, { ok: false, error: 'Unauthorized' }, 401);
  }
  const force = u.searchParams.get('force') === '1';
  const cached = await cacheGet();
  const fresh = cached && cached.payload && Array.isArray(cached.payload.reviews) &&
    cached.synced_at && (Date.now() - new Date(cached.synced_at).getTime()) < CACHE_TTL_MS;
  if (!force && fresh) {
    return json(res, { ok: true, cached: true, profile_url: PROFILE_URL, synced_at: cached.synced_at,
      reviews: cached.payload.reviews, source: cached.payload.source || 'cache' });
  }
  try {
    const data = await sync();
    const payload = {
      reviews: data.reviews,
      source: data.source,
      synced_at: new Date().toISOString(),
      profile_url: PROFILE_URL
    };
    await cacheSet(payload);
    return json(res, { ok: true, cached: false, ...payload });
  } catch (e) {
    if (cached && cached.payload) {
      return json(res, { ok: true, cached: true, stale: true, profile_url: PROFILE_URL,
        synced_at: cached.synced_at, reviews: cached.payload.reviews,
        source: (cached.payload.source || 'cache') + ' (stale)', message: 'Live sync failed: ' + e.message });
    }
    if (SEED_SNAPSHOT && Array.isArray(SEED_SNAPSHOT.reviews) && SEED_SNAPSHOT.reviews.length) {
      return json(res, { ok: true, cached: true, seeded: true, profile_url: PROFILE_URL,
        synced_at: SEED_SNAPSHOT.captured_at || null, reviews: SEED_SNAPSHOT.reviews,
        source: 'google (profile snapshot)', message: SEED_SNAPSHOT.note || '' });
    }
    return json(res, { ok: true, cached: false, profile_url: PROFILE_URL, synced_at: null,
      reviews: [], source: 'none', message: 'Google reviews not live yet — ' + e.message });
  }
};
