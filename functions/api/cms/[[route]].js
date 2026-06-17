/*
 * Reusable CMS API as a Cloudflare Pages Function.
 *
 * Routes (all under /api/cms/, gated by Cloudflare Access):
 *   GET  /api/cms/me        -> { email }                 the logged-in editor
 *   GET  /api/cms/content   -> content.json              current content from the repo
 *   POST /api/cms/save      <- { content }               commits content.json
 *   POST /api/cms/upload    <- multipart (file)          commits an image, returns its path
 *
 * The GitHub token lives ONLY here (server-side env), never in the browser.
 * Auth is enforced two ways: Cloudflare Access gates the route at the edge,
 * and this function also verifies the Access JWT (defence in depth).
 *
 * Required env vars (Cloudflare Pages > Settings > Variables and Secrets):
 *   GITHUB_TOKEN           fine-grained PAT, Contents: Read and write on the repo (secret)
 *   GITHUB_REPO            "owner/repo"
 *   GITHUB_BRANCH          e.g. "main"            (optional, default "main")
 *   CONTENT_PATH           e.g. "content.json"    (optional, default "content.json")
 *   MEDIA_DIR              e.g. "assets/uploads"  (optional, default "assets/uploads")
 *   CF_ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
 *   CF_ACCESS_AUD          the Access application Audience (AUD) tag
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

// ----- Cloudflare Access JWT verification -----
let jwksCache = null;
const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function verifyAccess(request, env) {
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  // If not configured, rely on the edge Access policy and return an unknown identity.
  if (!team || !aud) return { email: null, verified: false };

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) throw new Response('Unauthorized', { status: 401 });

  const [h, p, sig] = token.split('.');
  const header = b64urlToJson(h);
  if (!jwksCache) {
    jwksCache = await (await fetch(`https://${team}/cdn-cgi/access/certs`)).json();
  }
  let jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    jwksCache = await (await fetch(`https://${team}/cdn-cgi/access/certs`)).json();
    jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Response('Unauthorized', { status: 401 });

  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`)
  );
  if (!ok) throw new Response('Unauthorized', { status: 401 });

  const claims = b64urlToJson(p);
  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(aud) : claims.aud === aud;
  if (!audOk || claims.iss !== `https://${team}` || claims.exp * 1000 < Date.now()) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return { email: claims.email || claims.identity_nonce || null, verified: true };
}

// ----- GitHub helpers -----
function gh(env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const headers = {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cf-pages-cms',
  };
  const api = `https://api.github.com/repos/${repo}/contents`;
  return {
    branch,
    async get(path) {
      const r = await fetch(`${api}/${encodeURI(path)}?ref=${branch}`, { headers });
      if (r.status === 404) return null;
      if (!r.ok) throw new Response(`GitHub read failed: ${r.status}`, { status: 502 });
      return r.json();
    },
    async put(path, base64, sha, message) {
      const r = await fetch(`${api}/${encodeURI(path)}`, {
        method: 'PUT',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ message, content: base64, sha: sha || undefined, branch }),
      });
      if (!r.ok) throw new Response(`GitHub write failed: ${r.status} ${await r.text()}`, { status: 502 });
      return r.json();
    },
  };
}

const utf8ToB64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));
const bytesToB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (Array.isArray(params.route) ? params.route : [params.route]).filter(Boolean).join('/');

  try {
    const user = await verifyAccess(request, env);
    const repo = gh(env);
    const contentPath = env.CONTENT_PATH || 'content.json';

    if (request.method === 'GET' && route === 'me') {
      return json({ email: user.email });
    }

    if (request.method === 'GET' && route === 'content') {
      const file = await repo.get(contentPath);
      const text = file ? new TextDecoder().decode(b64urlToBytes(file.content.replace(/\n/g, ''))) : '{}';
      return new Response(text, { headers: { 'content-type': 'application/json' } });
    }

    if (request.method === 'POST' && route === 'save') {
      const body = await request.json();
      const file = await repo.get(contentPath);
      const pretty = JSON.stringify(body.content ?? body, null, 2) + '\n';
      await repo.put(
        contentPath,
        utf8ToB64(pretty),
        file?.sha,
        `content: update via CMS${user.email ? ` (${user.email})` : ''}`
      );
      return json({ ok: true });
    }

    if (request.method === 'POST' && route === 'upload') {
      const form = await request.formData();
      const f = form.get('file');
      if (!f || typeof f === 'string') return json({ error: 'no file' }, 400);
      const dir = env.MEDIA_DIR || 'assets/uploads';
      const safe = (f.name || 'upload').toLowerCase().replace(/[^a-z0-9.\-]+/g, '-');
      const path = `${dir}/${Date.now()}-${safe}`;
      const bytes = new Uint8Array(await f.arrayBuffer());
      await repo.put(path, bytesToB64(bytes), null, `media: upload ${path}${user.email ? ` (${user.email})` : ''}`);
      return json({ path });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e instanceof Response) return e; // thrown auth/upstream errors
    return json({ error: String(e && e.message || e) }, 500);
  }
}
