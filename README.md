# Chi-Tom Rapha Hospital & Maternity — Website (Vercel + Supabase)

**We Care, God Heals.**

A modern, dynamic website for Chi-Tom Rapha Hospital & Maternity, Abakaliki, Ebonyi State, Nigeria.
Static pages (self-contained HTML) + a **Vercel serverless content API** backed by **Supabase Postgres**:
blog, announcements, testimonials and site settings are stored in the database and shared by every visitor.

## Structure

| Path | Purpose |
|---|---|
| `index.html`, `about.html`, `services.html`, `blog.html`, `contact.html`, `admin.html`, `404.html` | The website (served from the repo root) |
| `assets/` | Photos, the official CRHm logo, favicons |
| `api/index.js` | Vercel serverless content API (`/api/index.php?action=...` is rewritten here) |
| `api/_seed.json` | Pristine original content (used by *Reset* in the admin) |
| `supabase/schema.sql` | **Run this once** in the Supabase SQL Editor (tables, RLS locking, API functions, seed) |
| `vercel.json` | Clean URLs, API rewrite, security + cache headers |

## Clean URLs

`/about`, `/services`, `/blog`, `/contact`, `/admin` serve the pages directly;
`/about.html` (and friends) 301-redirect to the clean form. All internal links use the clean form.

## One-time setup

### 1) Supabase
1. Create a project at https://supabase.com (free tier is fine).
2. Open **SQL Editor → New query**, paste the entire contents of **`supabase/schema.sql`**, and **Run** it.
   This creates the locked `site_content` table, the `rapha_*` API functions, and seeds the original content.
3. Note your **Project URL** and **anon (publishable) key** from **Project Settings → API**.

### 2) Vercel
1. Import this repo (`kr8digitals/Rapha-Hospital-`, branch `main`).
2. Framework preset: **Other** — no build command, leave the output directory as the project root.
3. Add the environment variables (Project → Settings → Environment Variables, all environments):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_ANON_KEY` | your Supabase anon (publishable) key |
| `DB_SECRET` | `97a484b674822283dca2945cf96787df81f4cde59336818f` |
| `ADMIN_PASS` | `Rapha@Adm!no/*` |
| `TOKEN_SECRET` | `3528256971662b6c4c03df2adb82855986a1aed3186a0fb6` |

4. Deploy, then add your custom domain (e.g. `chitomraphahospital.com`) under **Settings → Domains**.

## Admin dashboard

`/admin` — password **`Rapha@Adm!no/*`** (server-side only, never in the page source).
Curation: publish / unpublish / pin / archive / edit / delete testimonials; edit posts and announcements;
site settings propagate across the whole site; **Backup** downloads the full content JSON and **Import**
restores it.

## Data & persistence

All content lives in Supabase (`public.site_content`, one row) — it survives redeploys.
The `site_content` table is locked by Row Level Security with `FORCE`: nothing can read or write it
directly; the only path in is the `rapha_*` functions, which require the `DB_SECRET`.
If you ever rotate the secret, update both `supabase/_rapha_secrets` (SQL: `update public._rapha_secrets
set v = '<new>' where k='db_secret';`) and the Vercel `DB_SECRET` variable.

## Other branches

`hostinger-node` — the previous zero-dependency Node.js version (for Hostinger "Web Apps" hosting),
kept for reference. `main` is the live Vercel + Supabase version.
