# Lightweight Git CMS (Cloudflare Access + GitHub commits)

A tiny, reusable content editor for static sites. The client logs in at `/admin`
via **Cloudflare Access** (passwordless email code, no account to create), edits
text and images in a form, and on save a **Cloudflare Pages Function** commits the
change to the GitHub repo. The push triggers the normal Pages rebuild. The GitHub
token lives only in the Function, never in the browser.

No SaaS, no database, no client passwords. Everything lives inside the Pages project.

## Pieces

```
cms/build.mjs                 build: injects content.json into src/ templates -> dist/
cms.config.json               per-project build config (src/out/content/passthrough)
content.json                  the editable values (committed by the CMS)
src/*.html                    templates with {{cms:dotted.key}} tokens
admin/index.html, cms.js      the editor UI (generic)
admin/schema.json             per-project field list (what is editable)
functions/api/cms/[[route]].js the API: content read/save, image upload, Access check
```

## How content flows

1. `src/index.html` contains tokens like `{{cms:hero.headline}}`.
2. `content.json` holds the values. `node cms/build.mjs` renders `dist/`.
3. The client edits at `/admin`; the form is built from `admin/schema.json`.
4. On save the Function commits `content.json` (and uploaded images) to GitHub.
5. Cloudflare Pages rebuilds and the site updates.

## Add it to a new project

1. Copy `cms/`, `admin/`, `functions/`, `cms.config.json`, `package.json`, `.nvmrc`
   into the repo. Put your HTML in `src/` and your assets in `assets/`.
2. In `src/*.html`, replace editable text/image with `{{cms:some.key}}` tokens.
3. Create `content.json` with those keys and their current values.
4. List the editable fields in `admin/schema.json` (label + type: `text`, `textarea`, `image`).
5. Configure Cloudflare (below).

## Cloudflare Pages build settings

- Build command: `node cms/build.mjs`
- Build output directory: `dist`
- (Functions in `/functions` are picked up automatically.)

## Cloudflare Access (the login)

In the Cloudflare dashboard, **Zero Trust > Access > Applications > Add a self-hosted app**:

- Application domain: your site, path `/admin` (add a second app or path for `/api/cms` too).
- Identity / login method: **One-time PIN** (email code, passwordless).
- Policy: **Allow**, Include = **Emails** = the client's email address(es) only.
  (Do not leave email open, or anyone could request a code.)
- After creating the app, copy its **Application Audience (AUD) tag** and your team
  domain (`yourteam.cloudflareaccess.com`) for the env vars below.

Free for up to 50 users.

## Environment variables (Pages > Settings > Variables and Secrets)

| Name | Value |
|---|---|
| `GITHUB_TOKEN` | fine-grained PAT, **Contents: Read and write** on this repo (mark as secret) |
| `GITHUB_REPO` | `owner/repo` |
| `GITHUB_BRANCH` | `main` (optional) |
| `CONTENT_PATH` | `content.json` (optional) |
| `MEDIA_DIR` | `assets/uploads` (optional) |
| `CF_ACCESS_TEAM_DOMAIN` | `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | the Access application AUD tag |

`CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` let the Function verify the Access login
itself (defence in depth). Cloudflare Access already blocks unauthenticated requests
at the edge, but set them anyway.

## Local development

```
node cms/build.mjs        # renders dist/
```

The `/admin` API calls need the deployed Functions + env, so the editor is tested on
a Cloudflare preview/production deployment, not from `file://`.

## Security notes

- The GitHub token never reaches the browser; only the Function uses it.
- Scope the PAT to the single repo, Contents only.
- The Access policy must whitelist specific emails (not "any email").
