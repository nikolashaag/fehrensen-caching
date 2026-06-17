#!/usr/bin/env node
/*
 * Tiny, zero-dependency static-site builder for the Git + Cloudflare Access CMS.
 *
 * It injects values from content.json into HTML templates in srcDir, replacing
 * tokens of the form {{cms:dotted.key}}, and copies everything to outDir.
 * Per-project behaviour is set in cms.config.json. No framework, no deps.
 *
 * Reuse: drop the `cms/` folder, `admin/`, `functions/`, this build script and a
 * cms.config.json into any static project. Set the Cloudflare Pages build command
 * to `node cms/build.mjs` and the output directory to whatever `outDir` is.
 */
import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = {
  srcDir: 'src',
  outDir: 'dist',
  contentFile: 'content.json',
  tokenPrefix: 'cms:',
  passthrough: [],
  ...(existsSync(path.join(root, 'cms.config.json'))
    ? JSON.parse(await readFile(path.join(root, 'cms.config.json'), 'utf8'))
    : {}),
};

const srcDir = path.join(root, cfg.srcDir);
const outDir = path.join(root, cfg.outDir);

// --- load + flatten content into dotted keys ---
const content = JSON.parse(await readFile(path.join(root, cfg.contentFile), 'utf8'));
const flat = {};
(function flatten(obj, prefix = '') {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key);
    else flat[key] = v;
  }
})(content);

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const tokenRe = new RegExp(
  '\\{\\{\\s*' + cfg.tokenPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([\\w.\\-]+)\\s*\\}\\}',
  'g'
);

const missing = new Set();
function inject(html) {
  return html.replace(tokenRe, (_, key) => {
    if (key in flat) return esc(flat[key]);
    missing.add(key);
    return '';
  });
}

// --- walk srcDir, inject into HTML, copy the rest ---
async function walk(dir, rel = '') {
  for (const entry of await readdir(dir)) {
    const abs = path.join(dir, entry);
    const r = path.join(rel, entry);
    if ((await stat(abs)).isDirectory()) {
      await walk(abs, r);
    } else {
      const out = path.join(outDir, r);
      await mkdir(path.dirname(out), { recursive: true });
      if (/\.html?$/i.test(entry)) {
        await writeFile(out, inject(await readFile(abs, 'utf8')));
      } else {
        await cp(abs, out);
      }
    }
  }
}

// --- run ---
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await walk(srcDir);
for (const p of cfg.passthrough) {
  const from = path.join(root, p);
  if (existsSync(from)) await cp(from, path.join(outDir, p), { recursive: true });
}

console.log(`CMS build: ${Object.keys(flat).length} content keys -> ${cfg.outDir}/`);
if (missing.size) {
  console.warn('WARNING: tokens with no matching content key (rendered empty): ' + [...missing].join(', '));
  process.exitCode = 0; // non-fatal; surfaces in build logs
}
