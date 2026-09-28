# Chi-Tom Rapha Hospital & Maternity — Website (dynamic web app)

**We Care, God Heals.**

A modern, dynamic website for Chi-Tom Rapha Hospital & Maternity, Abakaliki, Ebonyi State, Nigeria. The public pages are fully self-contained HTML (all styles, scripts and images inlined), and a small built-in **PHP content API** makes the site dynamic: blog, announcements, testimonials and site settings are stored on the server and shared by every visitor.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Home — hero, quick actions, announcements, services, why-choose-us, maternity, health insights, **Community Voices (testimonials)**, FAQ |
| `about.html` | About — mission, vision, core values, approach, founder profile |
| `services.html` | Services — all service areas plus maternity |
| `blog.html` | Health Insights — searchable, filterable articles with full article views |
| `contact.html` | Contact — validated booking form, phones, email, map |
| `admin.html` | Admin dashboard (server-verified login) — manage posts, announcements, testimonials (pin / publish / unpublish / archive / edit / delete), settings, backup & restore |
| `404.html` | Friendly not-found page |
| `api/index.php` | The content API (PHP 7.4+, no dependencies) |
| `data/seed.json` | Pristine copy of the original content (used by *Reset*) |
| `data/content.json` | Live content store — created automatically on first API call (never committed) |

## The content API

`api/index.php?action=…` (JSON):

- `public` — published posts, announcements, published testimonials, settings
- `testimonial` — visitor submits a story (screened automatically: criticism and 1–2★ ratings are hidden until the admin reviews them)
- `login` — `{password}` → bearer token (verified on the server; the password is **not** in any page's JavaScript)
- `admin_content`, `save`, `backup`, `import`, `reset` — authenticated (bearer token)

**Configuration:** open `api/index.php` and edit the two constants at the top — `ADMIN_PASS` (dashboard password) and `API_TOKEN`. The `data/` folder is blocked from direct web access by `data/.htaccess`; the live file `data/content.json` must be writable by PHP (true by default on cPanel/Hostinger).

## Features

- **Mobile-first responsive**, tested from 360px up to widescreen; contact strip removed on mobile (phone stays one tap away via the floating button)
- **Community Voices** — engagement-triggered experience popup (frequency-capped, reduced-motion aware), automatic criticism screening, quality-weighted curation (recency + rating + substance; pinned stories featured)
- **CMS dashboard** connected to the server — changes apply to every visitor immediately; JSON backup/restore
- **Progressive enhancement** — the full site renders even if JavaScript is blocked
- Accessible: semantic landmarks, ARIA labels, keyboard focus states, AA-friendly contrast
- Fast: zero JavaScript libraries, lazy-loaded images, one request per page

## Deployment (Hostinger)

Any Hostinger plan with PHP works (no Node.js needed):

1. **hPanel → Files → Git** (or upload these files to `public_html/` via File Manager)
2. Connect this repository, branch `main`, deploy to `public_html` (the domain root) — or to the subdomain's folder if using a subdomain
3. Check **hPanel → Files → PHP** is 8.x (anything 7.4+ works)
4. Done — the site is live; the API works out of the box (`data/content.json` is created on first use)

Notes:
- If a previous static-only version exists on the host, the deploy overwrites it cleanly.
- The site also works fully offline (embedded seed content) if the API is ever unreachable.
- `.cpanel.yml` remains in the repo for Truehost's git deploy; it is inert on Hostinger and can be deleted if you're fully moving off Truehost.

## Security

- Dashboard login is verified server-side; the password lives only in `api/index.php`.
- `data/` cannot be browsed or fetched directly.
- Keep the repository **private** — the API configuration lives in the source.
