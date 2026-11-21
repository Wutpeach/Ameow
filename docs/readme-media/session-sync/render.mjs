// Run the unchanged product popup with a local, credential-free example transport.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dist = resolve(process.argv[2] || 'browser-extension/dist');
const playwright = process.env.PLAYWRIGHT_MODULE || 'D:/Ameow-handoffs/issue50-marker-toggle-20261120/candidate-ui-ec57a670-r7/payload/node_modules/playwright-core/index.mjs';
const executablePath = process.env.CHROMIUM_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const { chromium } = await import(pathToFileURL(playwright));
const revision = '13107cefd22c3397b238daf05dce74625c00017b';
const output = join(root, 'docs/readme-media/.work/session-sync');
const assets = join(root, 'docs/images/readme');
await mkdir(join(output, 'frames'), { recursive: true });
const build = JSON.parse(await readFile(join(dist, 'build.json')));
const sourceHash = createHash('sha256');
for (const path of ['manifest.json','popup.html','popup.css','build.mjs','package-lock.json','src/core.mjs','src/background.mjs','src/popup.mjs']) {
  sourceHash.update(path);
  sourceHash.update(execFileSync('git', ['show', `${revision}:browser-extension/${path}`], { cwd: root }));
}
assert.equal(sourceHash.digest('hex'), build.sourceSha256, 'Build must match the pinned product source');
const files = {};
const hashes = {};
for (const name of ['popup.html', 'popup.css', 'popup.js']) {
  files['/' + name] = await readFile(join(dist, name));
  hashes[name] = createHash('sha256').update(files['/' + name]).digest('hex');
}
// Verified by an isolated write:false rebuild of PR63 with locked esbuild 0.28.2.
assert.equal(hashes['popup.js'], 'b84ffd7ff514b38baebc63b5377f18f70c27e437605a079679e08169efd53118', 'Popup bundle differs from the reviewed product build');
// HTML and CSS must also be the exact product blobs, with no production-UI edits.
for (const name of ['popup.html', 'popup.css']) {
  assert(files['/' + name].equals(execFileSync('git', ['show', `${revision}:browser-extension/${name}`], { cwd: root })));
}
const server = createServer((request, response) => {
  const data = files[request.url];
  if (!data) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : request.url.endsWith('.js') ? 'text/javascript' : 'text/html');
  response.end(data);
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-extensions', '--no-first-run'] });
const errors = [], requests = [];
const fps = 20, frameCount = 140;
const report = { revision, build, hashes, fps, seconds: frameCount / fps, width: 640, height: 760,
  scope: 'Unchanged extension popup, already-authorized synthetic site; no permission dialog, Native host, account, Cookie or download', states: [] };
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 380 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', userAgent: 'Mozilla/5.0 Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.request().url().startsWith(origin + '/') ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    const source_id = 'a1b2c300112233445566778899aabbcc';
    let synced = false, finish;
    globalThis.exampleCalls = [];
    globalThis.finishExampleSync = () => { synced = true; finish(); };
    globalThis.chrome = {
      tabs: { query: async () => [{ url: 'https://www.bilibili.com/' }] },
      permissions: { request: async () => { throw Error('Permission confirmation is outside this demonstration'); } },
      runtime: { sendMessage: async ({ action, site }) => {
        exampleCalls.push({ action, site });
        if (action === 'sync') { await new Promise(resolve => { finish = resolve; }); return { ok: true, value: { 'bilibili.com': 'synced' } }; }
        if (action === 'status') return { ok: true, value: { source_id, grant: { pending: !synced, last_sync: synced ? Date.UTC(2026,10,20,14,0) : null }, sites: synced ? [{ site: 'bilibili.com', source_id, source_name: 'Microsoft Edge · 示例来源', synced_at: Date.UTC(2026,10,20,14,0)/1000, skipped_partitioned: 0, last_result: { error: null } }] : [] } };
        throw Error('Unexpected demonstration action: ' + action);
      } }
    };
  });
  await page.goto(origin + '/popup.html');
  await page.getByRole('button', { name: '立即同步', exact: true }).waitFor();
  assert.equal(await page.locator('#status').textContent(), '授权尚未完成同步。');
  report.states.push({ at: 0, status: await page.locator('#status').textContent() });
  // A cursor is a capture overlay. The product DOM, font, layout and response stay unchanged.
  await page.evaluate(() => {
    const cursor = document.createElement('div'); cursor.id = 'capture-cursor';
    cursor.style.cssText = 'position:fixed;z-index:10;pointer-events:none;width:22px;height:28px;display:none';
    cursor.innerHTML = '<svg width=22 height=28 viewBox="0 0 24 30"><path d="M3 2v21l6-5 4 9 4-2-4-9h8Z" fill="#292a2c" stroke="white" stroke-width="2"/></svg>';
    document.body.append(cursor);
  });
  const sync = page.getByRole('button', { name: '立即同步', exact: true });
  const box = await sync.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  for (let index = 0; index < frameCount; index++) {
    let p;
    if (index >= 22 && index <= 35) { const t = (index - 22) / 13; p = { x: 250 + (point.x - 250) * t, y: 255 + (point.y - 255) * t }; }
    else if (index > 35 && index < 71) p = point;
    else if (index >= 71 && index <= 83) { const t = (index - 71) / 12; p = { x: point.x + (275 - point.x) * t, y: point.y + (347 - point.y) * t }; }
    await page.evaluate(p => { const c = document.querySelector('#capture-cursor'); c.style.display = p ? 'block' : 'none'; if (p) { c.style.left = p.x + 'px'; c.style.top = p.y + 'px'; } }, p);
    if (p) await page.mouse.move(p.x, p.y);
    if (index === 36) await page.mouse.down();
    if (index === 38) { await page.mouse.up(); await page.waitForFunction(() => exampleCalls.some(c => c.action === 'sync')); assert(await sync.isDisabled()); }
    if (index === 53) {
      await page.evaluate(() => finishExampleSync());
      await page.waitForFunction(() => document.querySelector('#status').textContent.includes('最近收到的同步结果：成功。'));
      assert.match(await page.locator('#source').textContent(), /Microsoft Edge · 示例来源 · a1b2c3/);
      report.states.push({ at: index / fps, source: await page.locator('#source').textContent(), status: await page.locator('#status').textContent() });
    }
    await page.screenshot({ path: join(output, 'frames', `frame-${String(index).padStart(3, '0')}.png`) });
  }
  assert.deepEqual(errors, []);
  assert(requests.every(url => url.startsWith(origin + '/')));
  assert.deepEqual((await page.evaluate(() => exampleCalls)).map(c => c.action), ['status','sync','status']);
  assert(await page.locator('body').evaluate(e => e.scrollHeight <= innerHeight));
  await copyFile(join(output, 'frames/frame-120.png'), join(assets, 'session-sync-poster.png'));
  execFileSync('ffmpeg', ['-v','error','-y','-framerate',String(fps),'-i',join(output,'frames/frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',join(assets,'session-sync.gif')], { stdio: 'inherit' });
  report.initialHoldSeconds = 1.1; report.finalHoldSeconds = (frameCount - 84) / fps; report.pass = true;
} finally {
  await browser.close(); await new Promise(done => server.close(done));
  await writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
