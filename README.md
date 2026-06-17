# Fehrensen Coaching

Static one-page website for Fehrensen Coaching (Christine Fehrensen, Trostberg):
Entspannungscoaching, Ernährungsberatung and Meditationsreisen in die Mongolei.

Style: **Serene** (Jost + Hanken Grotesk). Now editable through a built-in CMS.

## How it builds

Content lives in `content.json` and is injected into the templates in `src/` by a
tiny build step. Editable fields use `{{cms:dotted.key}}` tokens.

- Source templates: `src/*.html`
- Content values: `content.json`
- Build: `node cms/build.mjs` (outputs `dist/`)
- Assets: `assets/` (copied to `dist/assets`)

## Deploy (Cloudflare Pages)

- Framework preset: **None**
- Build command: **`node cms/build.mjs`**
- Build output directory: **`dist`**
- Functions in `/functions` are picked up automatically.

Every push to `main` triggers a rebuild and deploy.

## Editing content (the CMS)

The owner edits text and images at **`/admin`**, logging in with a Cloudflare
Access email code (no password, no account). On save the change is committed to
this repo and the site redeploys. Full setup, reuse instructions, the Cloudflare
Access policy, and the required environment variables are documented in
[`cms/README.md`](cms/README.md).

## Pages

- `src/index.html` — the website (rendered to `dist/index.html`)
- `src/impressum.html`, `src/datenschutz.html` — legal pages
- `admin/` — the content editor
- `assets/` — optimized images

## Notes

- Contact form opens the visitor's mail client pre-filled to kontakt@fehrensen-coaching.de.
- Fonts load from Google Fonts. For full DSGVO safety, consider self-hosting them.
