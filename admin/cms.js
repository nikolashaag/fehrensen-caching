// Schema-driven editor. Reusable: only admin/schema.json changes per project.
const API = '/api/cms';
const $ = (id) => document.getElementById(id);

const getAt = (o, k) => k.split('.').reduce((a, c) => (a == null ? a : a[c]), o);
const setAt = (o, k, v) => {
  const ks = k.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] = a[ks[i]] || {};
  a[ks[ks.length - 1]] = v;
};

let data = {};

async function jsonOrNull(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function field(f) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = f.label;
  wrap.appendChild(label);
  const val = getAt(data, f.key) ?? '';

  if (f.type === 'image') {
    const row = document.createElement('div');
    row.className = 'imgrow';
    const img = document.createElement('img');
    img.src = val || '';
    img.alt = '';
    const pick = document.createElement('div');
    pick.className = 'pick';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:.78rem;color:var(--muted);margin-top:.3rem';
    hint.textContent = val || '';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      hint.textContent = 'Lädt hoch …';
      const fd = new FormData();
      fd.append('file', file);
      const res = await jsonOrNull(`${API}/upload`, { method: 'POST', body: fd });
      if (res && res.path) {
        setAt(data, f.key, res.path);
        img.src = res.path;
        hint.textContent = res.path;
        markDirty();
      } else {
        hint.textContent = 'Upload fehlgeschlagen';
      }
    });
    pick.appendChild(input);
    pick.appendChild(hint);
    row.appendChild(img);
    row.appendChild(pick);
    wrap.appendChild(row);
    return wrap;
  }

  const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
  if (f.type !== 'textarea') el.type = 'text';
  el.value = val;
  el.addEventListener('input', () => {
    setAt(data, f.key, el.value);
    markDirty();
  });
  wrap.appendChild(el);
  return wrap;
}

let dirty = false;
function markDirty() {
  dirty = true;
  $('save').disabled = false;
  $('status').textContent = 'Nicht gespeicherte Änderungen.';
}

function render(schema) {
  if (schema.title) {
    $('title').textContent = schema.title;
    document.title = schema.title + ' · Inhalte';
  }
  const form = $('form');
  form.innerHTML = '';
  for (const g of schema.groups) {
    const group = document.createElement('div');
    group.className = 'group';
    const h = document.createElement('h2');
    h.textContent = g.label;
    group.appendChild(h);
    for (const f of g.fields) group.appendChild(field(f));
    form.appendChild(group);
  }
}

async function save() {
  $('save').disabled = true;
  $('status').textContent = 'Speichert …';
  const r = await fetch(`${API}/save`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: data }),
  });
  if (r.ok) {
    dirty = false;
    $('status').textContent = 'Gespeichert. Die Website wird in 1–2 Minuten aktualisiert.';
  } else {
    $('save').disabled = false;
    $('status').textContent = 'Fehler beim Speichern (' + r.status + ').';
  }
}

(async function init() {
  const [schema, content, me] = await Promise.all([
    jsonOrNull('./schema.json'),
    jsonOrNull(`${API}/content`),
    jsonOrNull(`${API}/me`),
  ]);
  if (!schema) {
    $('form').innerHTML = '<p class="loading">Konnte schema.json nicht laden.</p>';
    return;
  }
  data = content || {};
  if (me && me.email) $('who').textContent = 'Angemeldet als ' + me.email;
  render(schema);
  $('save').addEventListener('click', save);
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
