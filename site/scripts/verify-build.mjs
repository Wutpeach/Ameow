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
const home = pages.get('index.html');
assert(home, 'Missing product homepage');
assert.doesNotMatch(home, /http-equiv\s*=\s*["']refresh/i, 'Homepage must not redirect to the manual');
assert.doesNotMatch(home, /name="robots"\s+content="noindex"/, 'Product homepage must be indexable');
assert.match(home, /id="top"/, 'Homepage must retain the brand target');
assert.match(home, /id="get"/, 'Homepage must retain the platform download section');
assert.equal([...home.matchAll(/href="#get"/g)].length, 1, 'Homepage must have one acquisition CTA');
const required = ['docs', 'en/docs', 'docs/developer', 'en/docs/developer', 'docs/downloads', 'en/docs/downloads', 'docs/extension', 'en/docs/extension', 'docs/cli', 'en/docs/cli'];
for (const locale of ['docs', 'en/docs']) required.push(locale + '/changelog/0-5-0', locale + '/changelog/0-5-1');
for (const route of required) assert(pages.has(route + '/index.html'), 'Missing required route: ' + route);
for (const route of ['docs', 'en/docs']) {
  const html = pages.get(route + '/index.html');
  assert.match(html, /class="card-grid\b/, route + ' must render CardGrid');
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh/i, route + ' must not redirect');
}
for (const route of ['docs/downloads', 'en/docs/downloads']) {
  assert.match(pages.get(route + '/index.html'), /<ol\b[^>]*\bsl-steps\b/i, route + ' must render Steps');
}
const figures = [
  ['', 'start'],
  ['desktop/links-and-queue/', 'queue'],
  ['desktop/output-folder/', 'folder'],
  ['desktop/output-folder/', 'settings-download'],
  ['desktop/settings/', 'shortcut'],
  ['troubleshooting/', 'mac'],
];
for (const locale of ['docs', 'en/docs']) for (const [route, kind] of figures) {
  const name = locale + '/' + route + 'index.html';
  const html = pages.get(name);
  assert(html, 'Missing illustration page: ' + name);
  const start = html.indexOf('data-figure="' + kind + '"');
  assert(start >= 0, name + ' must render ' + kind);
  const figure = html.slice(start, html.indexOf('</figure>', start));
  assert.match(figure, /role="(?:img|group)"[^>]*aria-label="[^"]+"/, name + ' must describe ' + kind);
  assert.doesNotMatch(figure, /<figcaption\b/, name + ' must omit repetitive illustration captions');
}
for (const locale of ['docs', 'en/docs']) {
  const extension = pages.get(locale + '/extension/index.html');
  assert.match(extension, /<ameow-clip-demo\b/, locale + ' must include the interactive clip illustration');
  assert.doesNotMatch(extension.slice(extension.indexOf('<ameow-clip-demo'), extension.indexOf('</ameow-clip-demo>')), /<details|<summary/, locale + ' clip steps must be always visible');
  const clip = extension.slice(extension.indexOf('<ameow-clip-demo'), extension.indexOf('</ameow-clip-demo>'));
  assert.doesNotMatch(clip, /data-play|data-replay/, locale + ' must use automatic clip playback with step controls');
  assert.equal([...clip.matchAll(/data-step=/g)].length, 4, locale + ' must expose four clip steps');
  assert.match(extension, /manual\/browser\/popup[.]html/, locale + ' must embed the real extension popup');
  assert.match(extension, /manual\/browser\/clip[.]html/, locale + ' must embed the real clip frontend');

  assert.doesNotMatch(extension, /review-banner|review-notes/, locale + ' must not expose internal review records');
  assert.match(pages.get(locale + '/desktop/output-folder/index.html'), /data-folder-ghost[^>]*aria-hidden="true"/, locale + ' must retain the visible drag object');
  const release = pages.get(locale + '/changelog/0-5-1/index.html');
  assert.match(release, /2026-11-22/, locale + ' must show the publication date');
  assert(release.includes('https://github.com/Wutpeach/Ameow/releases/tag/v0.5.1'), locale + ' must link to the published release');
}
for (const locale of ['docs', 'en/docs']) for (const route of [
  'review-notes', 'browser-extension', 'extension/install', 'extension/connection', 'extension/cookies-and-login',
  'troubleshooting/extension-disconnected', 'advanced/ae-compatibility', 'releases',
]) {
  assert(!pages.has(locale + '/' + route + '/index.html'), 'Retired manual route returned: ' + route);
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
  assert.doesNotMatch(html, /review-banner|review-notes|本地候选|审阅说明|朋友试用包|special-token|Local documentation candidate/, name + ' exposes internal handoff notes');
  assert.doesNotMatch(html, /rust-(?:settings|compact)[^" ]*[.]png/, name + ' must not reuse retired application screenshots');
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
const contentPairs = zh.filter(name => pages.get(name).includes('data-pagefind-body')).length;
// Layer precedence is fixed by first appearance, including declarations in earlier project CSS.
const styleLinks = [...pages.get('docs/index.html').matchAll(/<link\b[^>]*href="([^"]+[.]css)"[^>]*>/g)];
const styles = (await Promise.all(styleLinks.map(([, href]) => readFile(path.join(dist, targetFor(new URL(href, origin))), 'utf8')))).join('\n');
const firstLayer = (css) => css.match(/@layer\s+([\w.-]+)/)?.[1].split('.')[0];
assert.equal(firstLayer('@layer black { } @layer starlight, black;'), 'black', 'Detect the previous reversed cascade');
assert.equal(firstLayer(styles), 'starlight', 'Black theme layers must be declared before project/component CSS can reverse them');
console.log('Verified ' + pages.size + ' HTML pages, ' + contentPairs + ' bilingual content pairs, ' + (zh.length - contentPairs) + ' bilingual redirect pairs and ' + checked + ' local links/assets/fragments.');
