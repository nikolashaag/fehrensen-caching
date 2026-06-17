# Fehrensen Coaching

Static one-page website for Fehrensen Coaching (Christine Fehrensen, Trostberg):
Entspannungscoaching, Ernährungsberatung and Meditationsreisen in die Mongolei.

Style: **Serene** (Jost + Hanken Grotesk, dusty-rose accent).

## Deploy (Cloudflare Pages)

This is a plain static site with no build step. In the Cloudflare Pages project
connected to this repo, use:

- Framework preset: **None**
- Build command: **(leave empty)**
- Build output directory: **`/`** (repository root)

`index.html` sits at the repository root, so it serves at `/` with zero config.
Every push to `main` triggers a new deployment.

## Pages

- `index.html` — the website
- `impressum.html`, `datenschutz.html` — legal pages
- `assets/` — optimized images

## Notes

- Contact form opens the visitor's mail client pre-filled to kontakt@fehrensen-coaching.de (no backend).
- Fonts load from Google Fonts. For full DSGVO safety, consider self-hosting them.
