// Actual network starvation/seek, with mocked work binding and no extension/Native.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve(process.argv[2]); await mkdir(root);
const source = await readFile(resolve(process.argv[3])), timers = [], requests = [];
const report = { scope: 'owned throttled HTTP media and fresh profile, mock page binding, no extension/Native/account', requests, results: {} };
const html = '<!doctype html><link rel="stylesheet" href="/page.css"><style>.bpx-player-container{position:relative;width:640px;height:360px;margin:80px auto}video{width:100%;height:100%}</style><div class="bpx-player-container"><video src="/source.mp4" preload="auto" controls></video></div>';
const server = http.createServer(async (req, res) => {
  if (req.url !== '/source.mp4') { res.end(req.url === '/page.js' ? await readFile(resolve('browser-extension/dist/page.js')) : req.url === '/page.css' ? await readFile(resolve('browser-extension/dist/page.css')) : html); return; }
  const values = req.headers.range?.replace('bytes=', '').split('-'), start = Number(values?.[0] || 0), end = values?.[1] ? Number(values[1]) : source.length - 1;
  requests.push({ start, end });
  const respond = () => {
    res.writeHead(values ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(values ? { 'Content-Range': 'bytes ' + start + '-' + end + '/' + source.length } : {}) });
    if (start === 0) { res.write(source.subarray(0, 100000)); timers.push(setTimeout(() => res.end(source.subarray(100000, end + 1)), 10000)); }
    else res.end(source.subarray(start, end + 1));
  };
  if (start > 0) timers.push(setTimeout(respond, 3500)); else respond();
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = 'http://127.0.0.1:' + server.address().port;
const context = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: process.argv[4], headless: true, viewport: { width: 1100, height: 900 }, args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check'] });
try {
  const page = await context.newPage(); await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await page.evaluate(() => {
    globalThis.fixturePart = 1; globalThis.fixtureVideo = document.querySelector('video');
    globalThis.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async () => ({ ok: true, value: { key: 'bilibili:fixture:' + fixturePart, url: 'https://www.bilibili.com/video/BV17x411w7KC/?p=' + fixturePart, duration: fixtureVideo.duration } }), connectNative() { throw Error('FORBIDDEN_NATIVE'); }, sendNativeMessage() { throw Error('FORBIDDEN_NATIVE'); } } };
  });
  await page.addScriptTag({ url: origin + '/page.js' }); await page.locator('ameow-page-tools').waitFor(); await page.evaluate(() => ameowPageTools.openPeek());
  const controls = page.locator('ameow-peek-controls'); await controls.getByRole('textbox', { name: '入点时间' }).fill('1.250'); await controls.getByRole('textbox', { name: '出点时间' }).fill('4.750');
  await controls.getByRole('button',{name:'聚焦选区',exact:true}).click();
  report.results.before = await page.evaluate(() => ({ readyState: fixtureVideo.readyState, buffered: Array.from({ length: fixtureVideo.buffered.length }, (_, i) => [fixtureVideo.buffered.start(i), fixtureVideo.buffered.end(i)]) }));
  await controls.getByRole('slider', { name: '播放位置', exact: true }).evaluate(input => { input.value = '7'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => fixtureVideo.readyState === 1 && fixtureVideo.seeking);
  await page.waitForTimeout(1300);
  const snapshot = () => page.evaluate(() => ({ readyState: fixtureVideo.readyState, seeking: fixtureVideo.seeking, sameNode: ameowPageTools.video === fixtureVideo, dialogOpen: !!document.querySelector('.ameow-peek[open]'), binding: ameowPageTools.binding?.key, draft: { ...ameowPageTools.draft }, waiting: document.querySelector('ameow-peek-controls')?.shadowRoot.querySelector('.buffering')?.textContent }));
  report.results.buffering = await snapshot(); assert.equal(report.results.buffering.readyState, 1); assert.equal(report.results.buffering.waiting,'缓冲中…'); await page.locator('.ameow-peek').screenshot({path:join(root,'buffering.png')}); assert(report.results.buffering.dialogOpen && report.results.buffering.sameNode); assert.equal(report.results.buffering.draft.start_ms, 1250);
  await page.waitForFunction(() => fixtureVideo.readyState >= 2 && !fixtureVideo.seeking, null, { timeout: 15000 });
  report.results.recovered = await snapshot(); assert(report.results.recovered.dialogOpen && report.results.recovered.sameNode); assert.equal(report.results.recovered.draft.end_ms, 4750);
  await controls.getByRole('textbox', { name: '出点时间' }).fill('5.750'); assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isEnabled());
  await page.evaluate(async () => { fixturePart = 2; await ameowPageTools.refresh(); }); await page.locator('.ameow-peek').waitFor({ state: 'detached' });
  report.results.changedWork = await snapshot(); assert.equal(report.results.changedWork.draft.start_ms, null); assert(!report.results.changedWork.dialogOpen); assert.equal(report.results.changedWork.binding, 'bilibili:fixture:2');
  await page.evaluate(() => ameowPageTools.stop()); report.browserVersion = context.browser().version(); report.productBuild = JSON.parse(await readFile(resolve('browser-extension/dist/build.json'), 'utf8'));
} catch (error) { report.error = error.stack; throw error; }
finally { await context.close(); for (const timer of timers) clearTimeout(timer); server.closeAllConnections(); server.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
