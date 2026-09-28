# Chi-Tom Rapha Hospital & Maternity — Website (Node.js web app)

**We Care, God Heals.**

A modern, dynamic website for Chi-Tom Rapha Hospital & Maternity, Abakaliki, Ebonyi State, Nigeria. The public pages are fully self-contained HTML (all styles, scripts and images inlined), and a **zero-dependency Node.js server** (`server.js`) serves the site and runs the content API: blog, announcements, testimonials and site settings are stored on the server and shared by every visitor.

## Structure

| Path | Purpose |
|---|---|
| `server.js` | The Node.js web app — static file serving + content API (zero npm dependencies) |
| `package.json` | Project manifest — start command `npm start` |
| `index.html` | Home — hero, quick actions, announcements, services, why-choose-us, maternity, health insights, **Community Voices (testimonials)**, FAQ |
| `about.html` | About — mission, vision, core values, approach, founder profile |
| `services.html` | Services — all service areas plus maternity |
| `blog.html` | Health Insights — searchable, filterable articles with full article views |
| `contact.html` | Contact — validated booking form, phones, email, map |
| `admin.html` | Admin dashboard (server-verified login) — manage posts, announcements, testimonials (pin / publish / unpublish / archive / edit / delete), settings, backup & restore |
| `404.html` | Friendly not-found page |
| `data/seed.json` | Pristine copy of the original content (used by *Reset*) |
| `data/content.json` | Live content store — created automatically on first API call (never committed) |

## The content API (run inside `server.js`)

`/api/index.php?action=…` (JSON — the front-end already calls these URLs):

- `public` — published posts, announcements, published testimonials, settings
- `testimonial` — visitor submits a story (screened automatically: criticism and 1–2★ ratings are hidden until the admin reviews them)
- `login` — `{password}` → bearer token (verified on the server; the password is **not** in any page's JavaScript)
- `admin_content`, `save`, `backup`, `import`, `reset` — authenticated (bearer token)

**Configuration:** defaults work out of the box. Optionally set environment variables (e.g. in hPanel → your app → Environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the app listens on (match the port Hostinger expects) |
| `ADMIN_PASS` | the hospital's dashboard password | Change it here (or in `server.js`) |
| `API_TOKEN` | a fixed long string | Internal admin token |

The `data/` folder is never served as a file — it is only reachable through the API.

## Features

- **Mobile-first responsive**, tested from 360px up to widescreen; contact strip removed on mobile (phone stays one tap away via the floating button)
- **Community Voices** — engagement-triggered experience popup (frequency-capped, reduced-motion aware), automatic criticism screening, quality-weighted curation (recency + rating + substance; pinned stories featured)
- **CMS dashboard** connected to the server — changes apply to every visitor immediately; JSON backup/restore
- **Progressive enhancement** — the full site renders even if JavaScript is blocked
- Accessible: semantic landmarks, ARIA labels, keyboard focus states, AA-friendly contrast
- Fast: zero JavaScript libraries on the front-end, zero npm dependencies on the server, lazy-loaded images

## Deployment (Hostinger — "Web Apps" / Node.js from GitHub)

1. hPanel → **Websites → Deploy from GitHub** (the Node.js web-app flow — this is the one that asked for `package.json`; it's now present)
2. Select this repository (`Rapha-Hospital-`), branch `main`
3. **Start command:** `npm start`
4. **Port:** `3000` (or set `PORT` as an environment variable and match it)
5. Deploy — `npm install` is a no-op (no dependencies), and the app is live

Notes:
- If a redeploy ever wipes `data/content.json`, the server re-creates it from `data/seed.json` on first use — but your changes since the seed would be lost, so keep using **Backup & Restore** in the admin for regular JSON backups.
- `.cpanel.yml` (leftover from a Truehost setup) is inert here and can be deleted.
- The site also renders fully (embedded seed content) if the API is ever unreachable.

## Security

- Dashboard login is verified server-side; the password is only in `server.js` / the `ADMIN_PASS` environment variable — never in client JavaScript.
- `data/` cannot be browsed or fetched directly.
- Keep the repository **private** — the app configuration lives in the source.
