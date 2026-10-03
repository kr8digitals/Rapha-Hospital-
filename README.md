# Chi-Tom Rapha Hospital & Maternity — Website (Node.js web app)

**We Care, God Heals.**

A modern, dynamic website for Chi-Tom Rapha Hospital & Maternity, Abakaliki, Ebonyi State, Nigeria. The public pages are fully self-contained HTML (all styles, scripts and images inlined), and a **zero-dependency Node.js server** (`server.js`) serves the site and runs the content API: blog, announcements, testimonials and site settings are stored on the server and shared by every visitor.

## Structure

| Path | Purpose |
|---|---|
| `public/` | The website: `index`, `about`, `services`, `blog`, `contact`, `admin`, `404` (.html) and `assets/` |
| `api/index.js` | Vercel serverless content API (`/api/index.php?action=...` is rewritten here) |
| `api/_seed.json` | Pristine original content (used by *Reset* in the admin) |
| `vercel.json` | Rewrite for the API URL + security/cache headers |

## Backend

Content (settings, posts, announcements, testimonials) is stored in **Supabase Postgres** (`public.site_content`, one row). The table is locked by Row Level Security; the API reaches it only through `SECURITY DEFINER` functions (`rapha_*`) that require a server-side secret.

### Environment variables (Vercel → Settings → Environment Variables)

| Variable | Meaning |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon (publishable) key |
| `DB_SECRET` | Server-only secret the database functions check |
| `ADMIN_PASS` | Admin dashboard password |
| `TOKEN_SECRET` | Signs admin session tokens (12-hour expiry) |

## Deployment

Import the repo in Vercel (Framework: **Other**, no build command, output directory `public`), set the variables above, deploy, then add the domain.
