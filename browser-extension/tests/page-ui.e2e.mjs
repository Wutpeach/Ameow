// Own profiles and public VOD. Browser permission is seeded, not native consent evidence.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prepareIsolatedExtension, assertRuntimeIsolation, nativeAudit } from './isolation.mjs';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2]);
const brand = process.argv[3] || 'cft';
try { await access(root); throw Error('Use a fresh evidence directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(root, { recursive: true });
const extension = join(root, 'extension');
// UI-only runs must never call the user's registered native host, even for List.
const fixtureHost = 'org.ameow.browser_sessions.fixture.ui_' + randomUUID().replaceAll('-', '');
const fixtureBuild = await prepareIsolatedExtension(resolve('browser-extension/dist'), extension, fixtureHost);
const context = await chromium.launchPersistentContext(join(root, 'profile'), {
  ...(brand === 'edge' ? { channel: 'msedge' } : { executablePath: 'D:/Ameow-handoffs/issue24-browser-validation/chrome-for-testing/158.0.8127.36/chrome-win64/chrome.exe' }),
  headless: true, colorScheme: brand === 'edge' ? 'dark' : 'light', ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: join(root, 'video'), size: { width: 1440, height: 1000 } },
  args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'],
});
const extensionId = 'icedkidcbbbijndplfofcbhikohlcool';
const report = { brand, version: context.browser().version(), fixtureHost, fixtureBuild, native: 'unique unregistered host; API guard rejects all other hosts before API', permission: 'seeded in own profile', checks: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  report.isolation = await assertRuntimeIsolation(worker, fixtureHost);
  const manager = await context.newPage(); await manager.goto(brand === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
  await manager.evaluate(async id => { for (const origin of ['https://www.youtube.com/*', 'https://www.bilibili.com/*']) await chrome.developerPrivate.addHostPermission(id, origin); }, extensionId);
  await manager.close();
  for (const [site, url] of [['youtube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'], ['bilibili', 'https://www.bilibili.com/video/BV17x411w7KC/']]) {
    const page = await context.newPage();
    const row = { site, url, startedAt: Date.now(), events: [] }; report.checks.push(row);
    page.on('console', msg => { if (msg.type() === 'error' && msg.text().includes('ameow')) row.console = msg.text().slice(0, 300); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => [...document.querySelectorAll('video, bwp-video')].some(v => v.readyState >= 2 && v.duration > 0 && Number.isFinite(v.duration)), null, { timeout: 30000 });
    await page.bringToFront();
    const active = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
    const tab = { id: active.id, url: page.url() };
    row.tab = tab ? { id: tab.id, url: tab.url } : null;
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 320, height: 600 });
    await popup.addInitScript(tab => { chrome.tabs.query = async () => [tab]; }, tab);
    await popup.goto('chrome-extension://' + extensionId + '/popup.html');
    assert.equal(await popup.evaluate(() => globalThis.ameowFixtureNativeGuard), fixtureHost, 'popup entry has live native boundary');
    await sleep(1500);
    row.popup = await popup.locator('body').innerText();
    await popup.screenshot({ path: join(root, site + '-popup.png') });
    await popup.getByRole('button', { name: '启用页面工具' }).click();
    await popup.getByRole('button', { name: '关闭页面工具' }).waitFor();
    await popup.close(); await page.bringToFront();
    // Persistent browser windows share compositor bounds; restore them after the popup.
    await page.setViewportSize({ width: 1441, height: 1000 });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const toolbar = page.locator('ameow-page-tools');
    await toolbar.waitFor({ state: 'visible', timeout: 20000 });
    const cat = toolbar.getByRole('button', { name: '下载整段', exact: true });
    const before = await cat.boundingBox();
    await cat.hover(); await sleep(250);
    const select = toolbar.getByRole('button', { name: '选择片段', exact: true });
    const clickSelect = async () => {
      await cat.hover(); await sleep(230);
      const box = await select.boundingBox();
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
      assert.equal(hit, 'AMEOW-PAGE-TOOLS', 'real pointer target is unobscured');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    await select.hover(); await sleep(600);
    assert(await select.isVisible());
    assert.deepEqual(await cat.boundingBox(), before, 'download hit area remains fixed');
    await toolbar.screenshot({ path: join(root, site + '-toolbar.png') });
    await page.evaluate(() => { const video = document.querySelector('#movie_player video, .bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video'); video.pause(); window.ameowEvidence = { video, parent: video.closest('#movie_player,.bpx-player-container').parentNode, source: video.currentSrc, time: video.currentTime, scrollY }; });
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      row.events.push({ action: reduced ? 'reduced-entry' : 'normal-entry', seconds: (Date.now() - row.startedAt) / 1000 });
      await clickSelect();
      const controls = page.locator('ameow-peek-controls');
      await controls.getByRole('button', { name: '播放', exact: true }).waitFor();
      await controls.getByRole('textbox', { name: '入点时间', exact: true }).fill('0:01.250');
      await controls.getByRole('textbox', { name: '出点时间', exact: true }).fill('0:04.750');
      assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isEnabled());
      const inHandle = controls.getByRole('slider', { name: '拖动入点', exact: true });
      await inHandle.focus(); await inHandle.press('ArrowRight');
      assert.equal(await controls.getByRole('textbox', { name: '入点时间' }).inputValue(), '0:01.251');
      assert(await page.evaluate(() => Math.abs(window.ameowEvidence.video.currentTime - 1.251) < .01), 'range input seeks immediately');
      await inHandle.press('ArrowLeft');
      await page.evaluate(() => { window.ameowEvidence.time = window.ameowEvidence.video.currentTime; });
      await sleep(300);
      await page.locator('.ameow-peek').screenshot({ path: join(root, site + (reduced ? '-reduced' : '-normal') + '-peek.png') });
      await controls.getByRole('button', { name: '清除选区' }).click();
      assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isDisabled());
      assert(await page.locator('.ameow-peek').isVisible());
      await controls.getByRole('textbox', { name: '入点时间', exact: true }).fill('0:01.250');
      await controls.getByRole('textbox', { name: '出点时间', exact: true }).fill('0:04.750');
      row.events.push({ action: reduced ? 'reduced-exit' : 'normal-exit', seconds: (Date.now() - row.startedAt) / 1000 });
      await page.keyboard.press('Escape');
      await page.locator('.ameow-peek').waitFor({ state: 'detached' });
      const identity = await page.evaluate(() => { const p = window.ameowEvidence; return { sameNode: p.video === document.querySelector('#movie_player video, .bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video'), sameSource: p.source === p.video.currentSrc, time: p.video.currentTime, originalTime: p.time, restored: p.video.closest('#movie_player,.bpx-player-container').parentNode === p.parent, scrollUnlocked: document.documentElement.style.overflow !== 'hidden' }; });
      assert(identity.sameNode && identity.sameSource && identity.restored && identity.scrollUnlocked);
      assert(Math.abs(identity.time - identity.originalTime) < .05);
      assert(await page.evaluate(() => Math.abs(scrollY - window.ameowEvidence.scrollY) < 1));
      row[reduced ? 'reduced' : 'normal'] = identity;
      row.restoredGeometry = await page.evaluate(() => { const v = window.ameowEvidence.video.closest('#movie_player,.bpx-player-container'); return { player: v.getBoundingClientRect().toJSON(), parent: v.parentNode.getBoundingClientRect().toJSON(), style: v.getAttribute('style'), scrollY }; });
      await clickSelect();
      assert.equal(await controls.getByRole('textbox', { name: '入点时间' }).inputValue(), '0:01.250', 'same-work draft retained');
      await controls.getByRole('button', { name: '关闭预览' }).click();
      await page.locator('.ameow-peek').waitFor({ state: 'detached' });
    }
    row.events.push({ action: 'fast-hover', seconds: (Date.now() - row.startedAt) / 1000 });
    for (let n = 0; n < 4; n++) { await cat.hover(); await sleep(65); await page.mouse.move(20, 20); await sleep(90); }
    await cat.focus(); await sleep(500); assert(await select.isVisible());
    if (site === 'bilibili') {
      await page.evaluate(() => window.player.next());
      await page.waitForFunction(() => window.player?.getManifest?.().p === 2, null, { timeout: 20000 });
      await untilBinding();
      await clickSelect();
      assert.equal(await page.locator('ameow-peek-controls').getByRole('textbox', { name: '入点时间' }).inputValue(), '');
      assert.equal(await page.locator('ameow-peek-controls').getByRole('textbox', { name: '出点时间' }).inputValue(), '');
      await page.keyboard.press('Escape'); await page.locator('.ameow-peek').waitFor({ state: 'detached' });
      row.partSwitchClearsDraft = true;
    }
    const state = await worker.evaluate(async () => chrome.storage.local.get(['grants', 'page_tools']));
    assert.equal(Object.keys(state.grants || {}).length, 0, 'page tools do not grant cookie sync'); row.noCookieGrant = true;
    row.pass = true; row.video = await page.video().path();
    await page.close();
    async function untilBinding() {
      await page.waitForURL(/p=2/, { timeout: 20000 });
      await sleep(1500); await toolbar.waitFor({ state: 'visible', timeout: 20000 });
    }
  }
  report.nativeAudit = await nativeAudit(worker);
  assert(report.nativeAudit.every(e => e.allowed ? e.host === fixtureHost : e.host === 'FORBIDDEN'));
} catch (e) { report.error = e.stack; throw e; }
finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
