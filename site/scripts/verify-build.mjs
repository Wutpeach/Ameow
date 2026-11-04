import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  return nested.flat();
}
const built = await files(dist);
const existing = new Set(built.map((name) => path.relative(dist, name).replaceAll('\\', '/')));
const pages = new Map(await Promise.all(built.filter((name) => name.endsWith('.html')).map(async (name) => [
  path.relative(dist, name).replaceAll('\\', '/'), await readFile(name, 'utf8'),
])));
const required = ['docs', 'en/docs', 'docs/developer', 'en/docs/developer', 'docs/downloads', 'en/docs/downloads'];
for (const route of required) assert(pages.has(route + '/index.html'), 'Missing required route: ' + route);
for (const route of ['docs', 'en/docs']) {
  const html = pages.get(route + '/index.html');
  assert.match(html, /class="card-grid\b/, route + ' must render CardGrid');
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh/i, route + ' must not redirect');
}
for (const route of ['docs/downloads', 'en/docs/downloads']) {
  assert.match(pages.get(route + '/index.html'), /<ol\b[^>]*\bsl-steps\b/i, route + ' must render Steps');
}
// Generated static HTML is the contract: check every local URL and fragment, not only source Markdown.
const origin = 'https://wutpeach.github.io';
const base = '/Ameow/';
const decode = (text) => text.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"');
const ids = new Map([...pages].map(([name, html]) => [name, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => decode(m[1])))]));
function targetFor(url) {
  const pathname = decodeURIComponent(url.pathname);
  assert(pathname.startsWith(base), 'Local URL lost /Ameow/ base: ' + url.href);
  const relative = pathname.slice(base.length);
  // Starlight emits /404/ as the canonical URL for the actual Pages fallback.
  if (relative === '404/' || relative === 'en/404/') return '404.html';
  if (existing.has(relative + '/index.html')) return relative + '/index.html';
  return pathname.endsWith('/') ? relative + 'index.html' : relative;
}
// Guard the base-path resolver against the common root/locale regression.
assert.equal(targetFor(new URL(base + 'en/docs/', origin)), 'en/docs/index.html');
assert.throws(() => targetFor(new URL(origin + '/docs/')));
let checked = 0;
for (const [name, html] of pages) {
  const route = name.endsWith('index.html') ? name.slice(0, -'index.html'.length) : name;
  const current = new URL(base + route, origin);
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const raw = decode(match[1]);
    const url = new URL(raw, current);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) continue;
    const target = targetFor(url);
    assert(existing.has(target), name + ' links to missing ' + raw);
    if (url.hash && ids.has(target)) {
      assert(ids.get(target).has(decodeURIComponent(url.hash.slice(1))), name + ' links to missing fragment ' + raw);
    }
    checked++;
  }
  assert.doesNotMatch(html, /\[(?:截图|示意图|Screenshot|Diagram)[:：]/i, name + ' contains a placeholder');
}
const zh = [...pages.keys()].filter((name) => name.startsWith('docs/'));
const en = [...pages.keys()].filter((name) => name.startsWith('en/docs/')).map((name) => name.slice(3));
assert.deepEqual(zh.sort(), en.sort(), 'Chinese and English route coverage differs');
console.log('Verified ' + pages.size + ' HTML pages, ' + zh.length + ' bilingual route pairs and ' + checked + ' local links/assets/fragments.');
