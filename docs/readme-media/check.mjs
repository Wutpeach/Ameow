// Check the actual delivered media, local references, and GitHub-rendered reading view.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'docs/readme-media/.work/check');
const port = Number(process.env.README_PREVIEW_PORT || 8871);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('README_PREVIEW_PORT must be an integer from 1024 to 65535');
const origin = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });
const images = ['desktop-cat', 'paste-link', 'clip-selection', 'session-sync'];
const posters = ['desktop-cat-poster', 'paste-link-poster', 'clip-poster', 'session-sync-poster'];
const report = { media: [], views: [] };
for (const [index, name] of images.entries()) {
  const file = join(root, 'docs/images/readme', name + '.gif');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=width,height,nb_frames,duration','-of','json',file], { encoding:'utf8' })).streams[0];
  assert(+probe.nb_frames > 1 && +probe.duration >= 4 && +probe.duration <= 10, name);
  // Decode every frame, including the last one, instead of relying on a header probe.
  execFileSync('ffmpeg', ['-v','error','-i',file,'-f','null','-'], { stdio:'pipe' });
  const size = (await stat(file)).size;
  const poster = join(root, 'docs/images/readme', posters[index] + '.png');
  assert((await stat(poster)).size > 0);
  report.media.push({ name, ...probe, bytes:size });
}
// Keep the other three demonstrations byte-for-byte at the reviewed README baseline.
const preserved = {
  'desktop-cat.gif': 'e773eabe1a47107519b1b2ddb8b482bf8ce9cb5e66bfd02e19b726f1416a8caf',
  'desktop-cat-poster.png': '82ca1279f3b6a064d828178345a3129ea440bbaf7a90900567bc94f80bfa960b',
  'paste-link.gif': 'cd894a9370797d40f0d6056b9cf8104af69655715195826688db400473ab0c82',
  'paste-link-poster.png': '8f57a0560983e85d0866718311b0687169d4c566eca96052d35a4a1f472c2c17',
  'clip-selection.gif': 'a185f9c069426b852a87e6f248feb6ff44fab7ec5f51fc5433144c175d36233d',
  'clip-poster.png': 'f069e0c1394ad40fdeb788633a9e4df73546cf73e3a37b6d57852214be02bb94',
};
for (const [name, expected] of Object.entries(preserved)) {
  assert.equal(createHash('sha256').update(await readFile(join(root,'docs/images/readme',name))).digest('hex'), expected, name + ' must retain its reviewed bytes');
}
for (const file of ['README.md', 'README.en.md']) {
  const source = await readFile(join(root,file), 'utf8');
  assert.equal((source.match(/https:\/\/img\.shields\.io\//g) || []).length, 6);
  assert.equal((source.match(/<img[^>]+src="docs\/images\/readme\/[^\"]+\.gif"/g) || []).length, 4);
  for (const match of source.matchAll(/(?:src|href)="([^\"]+)"|\]\(([^)]+)\)/g)) {
    const link = match[1] || match[2];
    if (!/^https?:/.test(link)) await stat(join(root,link));
  }
}
const module = process.env.PLAYWRIGHT_MODULE || 'D:/Ameow-handoffs/issue50-marker-toggle-20261120/candidate-ui-ec57a670-r7/payload/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(module));
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe', args:['--disable-extensions','--no-first-run'] });
try {
  for (const lang of ['zh','en']) for (const theme of ['light','dark']) for (const width of [980,320]) {
    const page = await browser.newPage({ viewport:{ width,height:900 }, colorScheme:theme });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/?lang=' + lang + '&theme=' + theme + '&static=1', { waitUntil:'networkidle' });
    await page.locator('article img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const metrics = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, images:[...document.querySelectorAll('article img')].map(i => ({ source:i.getAttribute('src'), naturalWidth:i.naturalWidth, width:i.getBoundingClientRect().width, alt:i.alt })), headings:[...document.querySelectorAll('article h2')].map(h => h.textContent), background:getComputedStyle(document.body).backgroundColor }));
    assert(metrics.scroll <= width, JSON.stringify(metrics));
    assert.equal(metrics.headings.length,5);
    assert(metrics.images.every(image => image.naturalWidth > 0 && image.width <= width && image.alt));
    assert.deepEqual(errors, []);
    // Tight section crops keep review evidence readable on phones and desktop.
    const crops = await page.locator('article h2').evaluateAll(headings => headings.slice(0,4).map(h => { const a=h.getBoundingClientRect(); let end=h.nextElementSibling; while (end && !end.querySelector('img')) end=end.nextElementSibling; if (!end) throw Error('Missing section image'); const image=end.getBoundingClientRect(); return { x:Math.max(0,a.x), y:a.y+scrollY, width:a.width, height:image.bottom-a.y }; }));
    for (let i=0;i<crops.length;i++) await page.screenshot({ path:join(output,[lang,theme,width,images[i]].join('-') + '.png'), clip:crops[i], fullPage:true });
    const header = await page.locator('article h2').first().boundingBox();
    await page.screenshot({ path:join(output,[lang,theme,width,'intro'].join('-') + '.png'), clip:{x:0,y:0,width,height:Math.ceil(header.y)} });
    report.views.push({ lang,theme,...metrics });
    await page.close();
  }
  // The GIF reading view uses the same four native GitHub image slots.
  const page = await browser.newPage({ viewport:{width:320,height:900} });
  await page.goto(origin + '/');
  await page.locator('article img[src$=".gif"]').evaluateAll(images => Promise.all(images.map(i => i.decode())));
  assert.equal(await page.locator('article img[src$=".gif"]').count(),4);
  report.pass = true;
} finally { await browser.close(); await writeFile(join(output,'result.json'), JSON.stringify(report,null,2)); }
console.log(JSON.stringify({pass:report.pass,media:report.media,views:report.views.length,output},null,2));
