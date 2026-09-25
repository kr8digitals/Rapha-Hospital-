# Chi-Tom Rapha Hospital & Maternity — Website

**We Care, God Heals.**

A modern, fully self-contained static website for Chi-Tom Rapha Hospital & Maternity, Abakaliki, Ebonyi State, Nigeria. Every page is a single HTML file with all styles, scripts and images inlined — no build step, no external dependencies required (only a Google Fonts link with system fallbacks), works on any static host.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home — hero, quick actions, announcements, services, why-choose-us, maternity, health insights, **Community Voices (testimonials)**, FAQ, contact details |
| `about.html` | About — mission, vision, core values, approach, founder profile |
| `services.html` | Services — all six service areas plus maternity split |
| `blog.html` | Health Insights — searchable, filterable health-education articles with full article views |
| `contact.html` | Contact — validated booking/consultation form, phone, email, map |
| `admin.html` | Admin dashboard — manage posts, announcements, testimonials (pin / publish / unpublish / archive / edit / delete), site settings, export/import backup. Access restricted by password. |
| `404.html` | Friendly not-found page |

## Features

- **Mobile-first responsive** design, tested from 360px up to widescreen
- **CMS-lite dashboard** (browser local storage) — content updates apply across the whole site immediately, with JSON export/import backup
- **Community Voices** — visitor experience collection popup (engagement-triggered, frequency-capped), automatic criticism screening, and quality-weighted curation (recency + rating + substance; pinned stories featured)
- **Announcements & blog** with pinned items, categories, search and related posts
- 24/7 emergency call and WhatsApp action points throughout
- Tasteful scroll/entrance animations, disabled for users who prefer reduced motion
- Accessible: semantic landmarks, ARIA labels, keyboard focus states, AA-friendly contrast
- Fast: zero JavaScript libraries, lazy-loaded images, one request per page

## Deployment

Any static host works — GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a plain web server:

```bash
# serve locally
python3 -m http.server 8080 --bind 0.0.0.0
# then open http://localhost:8080
```

For GitHub Pages: set the repository's *Pages* source to `main` branch (root).

## Site owner notes

- `admin.html` is the content dashboard. Access is password-protected; keep that password with the site owner only.
- Content created in the dashboard is stored in the browser's local storage and can be backed up / restored via **Backup & Restore** in the dashboard (single JSON file).
- The emergency number, address, email and hero message can all be changed once in **Site Settings** and update across every page.
