// Owned profile + real action popups/content scripts; intercepted synthetic VOD, no desktop.
// Run from the repository root: node browser-extension/tests/extension-ui.e2e.mjs <fresh-output> <browser> <8s-mp4>
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { prepareIsolatedExtension, assertRuntimeIsolation, nativeAudit } from './isolation.mjs';

const root = resolve(process.argv[2]), executablePath = resolve(process.argv[3]);
const longDomain = 'a-very-long-website-name-that-must-stay-readable-in-popup.example';
await mkdir(root); // Preserve earlier evidence.
await copyFile(new URL(import.meta.url), join(root, 'executed-script.mjs'));
const media = await readFile(resolve(process.argv[4]));
const extension = join(root, 'extension'), fixtureHost = 'org.ameow.browser_sessions.fixture.ui_' + randomUUID().replaceAll('-', '');
const fixtureBuild = await prepareIsolatedExtension(resolve('browser-extension/dist'), extension, fixtureHost);
// Programmatic openPopup does not grant activeTab; give only this intercepted fixture an origin.
const fixtureManifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
fixtureManifest.host_permissions.push('https://' + longDomain + '/*');
await writeFile(join(extension, 'manifest.json'), JSON.stringify(fixtureManifest, null, 2));
const context = await chromium.launchPersistentContext(join(root, 'profile'), {
  executablePath, headless: true, viewport: { width: 1100, height: 900 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--headless=new', '--load-extension=' + extension, '--disable-extensions-except=' + extension, '--no-first-run', '--no-default-browser-check'],
});
const report = { scope: 'real extension/action host; synthetic intercepted players/media plus one fixture-only long domain origin; unique unregistered guarded native host; no desktop/account/config changes', fixtureBuild, checks: [] };
const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
const cdp = await context.browser().newBrowserCDPSession();
const pause = ms => new Promise(r => setTimeout(r, ms));
async function contentState(page) {
  const tab = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url), page.url());
  return worker.evaluate(async tabId => (await chrome.scripting.executeScript({ target: { tabId }, func: () => ({
    enabled: !!globalThis.ameowPageTools && !ameowPageTools.stopped,
    draft: globalThis.ameowPageTools?.draft,
    capsuleFocused: globalThis.ameowPageTools?.root?.activeElement === globalThis.ameowPageTools?.select,
  }) }))[0].result, tab.id);
}
async function actionPopup() {
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.action.openPopup({ windowId: tab.windowId });
  });
  const views = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }));
  assert.equal(views.length, 1, 'must be a native POPUP context');
  const target = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.url === views[0].documentUrl);
  assert(target);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let serial = 0;
  const pending = new Map();
  const onMessage = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), waiter = pending.get(message.id);
    if (waiter) { clearTimeout(waiter.timeout); pending.delete(message.id); waiter.resolve(message); }
  };
  cdp.on('Target.receivedMessageFromTarget', onMessage);
  async function send(method, params = {}) {
    const id = ++serial;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, timeout: setTimeout(() => reject(Error('Popup CDP timeout: ' + method)), 10000) }));
    await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
    const response = await result;
    if (response.error) throw Error(JSON.stringify(response.error));
    return response.result;
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await send('Runtime.enable');
  for (let n = 0; n < 50 && !await evaluate('!!document.querySelector("#site")?.textContent'); n++) await pause(50);
  for (let n = 0; n < 200 && !await evaluate('!!document.querySelector("#connection[data-error],#connection[data-ready]")'); n++) await pause(50);
  return {
    evaluate, context: views[0],
    click: async selector => {
      const point = await evaluate('(()=>{const r=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    },
    metrics: () => evaluate('({width:innerWidth,height:innerHeight,bodyWidth:document.body.getBoundingClientRect().width,contentHeight:document.body.getBoundingClientRect().height,scrollWidth:document.documentElement.scrollWidth,site:document.querySelector("#site").textContent})'),
    screenshot: async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(root, name), Buffer.from(shot.data, 'base64')); },
    close: async () => {
      cdp.off('Target.receivedMessageFromTarget', onMessage);
      await cdp.send('Target.closeTarget', { targetId: target.targetId });
      for (let n = 0; n < 50 && (await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }))).length; n++) await pause(50);
    },
  };
}
function playerHtml(site) {
  const youtube = site === 'youtube';
  return '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#eee;font:13px Segoe UI,sans-serif}h1{font-size:15px;margin:24px}.player{position:relative;width:800px;height:450px;margin:30px auto}video{width:100%;height:100%}</style><h1>Owned ' + site + ' player fixture</h1><div class="player ' + (youtube ? '' : 'bpx-player-container') + '" ' + (youtube ? 'id="movie_player"' : '') + '><video src="/ameow-owned.mp4" controls preload="auto"></video></div><script>' + (youtube ? 'document.querySelector("#movie_player").getVideoData=()=>({video_id:"aqz-KE-bpKQ"});' : 'window.player={getManifest:()=>({bvid:"BV17x411w7KC",cid:12345,aid:1,p:1}),mediaElement:()=>document.querySelector("video")};') + '</script>';
}
try {
  report.browserVersion = context.browser().version();
  report.isolation = await assertRuntimeIsolation(worker, fixtureHost);
  await context.route('https://**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/ameow-owned.mp4') return route.fulfill({ status: 200, contentType: 'video/mp4', body: media });
    if (url.hostname === 'www.youtube.com') return route.fulfill({ contentType: 'text/html', body: playerHtml('youtube') });
    if (url.hostname === 'www.bilibili.com') return route.fulfill({ contentType: 'text/html', body: playerHtml('bilibili') });
    if (url.hostname.endsWith('.example')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Owned long domain</title>Owned long domain fixture' });
    return route.abort();
  });
  for (const site of ['youtube', 'bilibili']) {
    const page = await context.newPage();
    await page.goto(site === 'youtube' ? 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' : 'https://www.bilibili.com/video/BV17x411w7KC/');
    await page.locator('ameow-page-tools').waitFor();
    await page.evaluate(() => { const v = document.querySelector('video'); v.pause(); v.currentTime = 1.25; });
    const host = page.locator('ameow-page-tools'), controls = page.locator('ameow-peek-controls');
    const open = async () => {
      const button = host.getByRole('button', { name: '下载', exact: true }), b = await button.boundingBox();
      await page.mouse.move(b.x + b.width - 14, b.y + 14);
      await host.getByRole('button', { name: '切片', exact: true }).click();
      await page.locator('.ameow-peek[data-transition]').waitFor({ state: 'detached' });
    };
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference', colorScheme: reduced ? 'dark' : 'light' });
      for (const exit of ['escape', 'backdrop']) {
        await open();
        await pause(900); // Let the original capsule idle while the modal holds focus.
        const submit = controls.getByRole('button', { name: '下载片段', exact: true });
        assert(await submit.isDisabled());
        assert.equal(await controls.locator('[data-action=close]').count(), 0);
        assert.equal(await submit.innerText(), '下载');
        await submit.hover();
        const logo = await submit.evaluate(b => ({ color: getComputedStyle(b).color, fill: getComputedStyle(b.querySelector('path')).fill, opacity: getComputedStyle(b).opacity, d: b.querySelector('path').getAttribute('d') }));
        const approved = await readFile('assets/brand/tray/macos/ameow-menu-bar-white.svg', 'utf8');
        assert.equal(logo.d, approved.match(/<path d="([^"]+)"/)[1]);
        assert.equal(logo.fill, logo.color);
        assert.equal(logo.opacity, '0.45');
        await controls.getByRole('button', { name: '编辑选区时间', exact: true }).click();
        await controls.getByRole('textbox', { name: '入点时间' }).fill('1.250');
        await controls.getByRole('textbox', { name: '出点时间' }).fill('4.750');
        assert(await submit.isEnabled());
        await page.locator('.ameow-peek').screenshot({ path: join(root, site + '-' + (reduced ? 'dark' : 'light') + '-peek.png') });
        if (exit === 'escape') await page.keyboard.press('Escape');
        else await page.mouse.click(4, 4);
        await page.locator('.ameow-peek').waitFor({ state: 'detached' });
        await pause(900);
        const state = await contentState(page);
        assert(state.enabled, 'closing Peek must keep tools enabled');
        assert(state.capsuleFocused, 'closing Peek must restore focus to the capsule');
        assert.deepEqual(state.draft, { start_ms: 1250, end_ms: 4750 });
        assert(await host.isVisible());
        const preference = await worker.evaluate(() => chrome.storage.local.get('page_tools'));
        assert.notEqual(preference.page_tools?.[site === 'youtube' ? 'www.youtube.com' : 'www.bilibili.com'], false);
        await host.locator('.toolbar').screenshot({ path: join(root, site + '-reopened-capsule.png') });
        report.checks.push({ site, reduced, exit, state, logo: { ...logo, d: undefined } });
        // Begin the next cycle with an empty draft and an idle capsule.
        await open(); await controls.locator('[data-action=marker]').click();
        await page.mouse.click(4, 4);
        await page.locator('.ameow-peek').waitFor({ state: 'detached' });
      }
    }
    // Explicit OFF is a separate real popup action, including while Peek is open.
    await open();
    const popup = await actionPopup();
    const before = await popup.metrics();
    assert.equal(before.width, 320); assert.equal(before.bodyWidth, 320); assert.equal(before.scrollWidth, 320);
    await popup.screenshot(site + '-native-popup.png');
    await popup.click('#toggle-tools');
    for (let n = 0; n < 50 && await popup.evaluate('document.querySelector("#toggle-tools").getAttribute("aria-pressed") !== "false"'); n++) await pause(50);
    const off = await worker.evaluate(() => chrome.storage.local.get('page_tools'));
    assert.equal(off.page_tools[site === 'youtube' ? 'www.youtube.com' : 'www.bilibili.com'], false);
    await popup.close();
    await page.locator('ameow-page-tools').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.ameow-peek').count(), 0);
    await page.reload(); await pause(1200);
    assert.equal(await page.locator('ameow-page-tools').count(), 0);
    const on = await actionPopup();
    await on.click('#toggle-tools');
    for (let n = 0; n < 50 && await on.evaluate('document.querySelector("#toggle-tools").getAttribute("aria-pressed") !== "true"'); n++) await pause(50);
    await on.close(); await page.bringToFront();
    await page.locator('ameow-page-tools').waitFor(); await open();
    await page.mouse.click(4, 4);
    await page.locator('.ameow-peek').waitFor({ state: 'detached' });
    report.checks.push({ site, explicitOffRemovesPeekAndCapsule: true, offSurvivesReload: true, reenableAndReopen: true, nativePopup: before });
    await page.close();
  }
  const page = await context.newPage(); await page.goto('https://' + longDomain + '/'); await page.bringToFront();
  const popup = await actionPopup();
  await pause(250);
  const closed = await popup.metrics();
  assert.equal(closed.site, longDomain); assert.equal(closed.width, 320); assert.equal(closed.scrollWidth, 320);
  await popup.screenshot('long-domain-native-popup.png');
  await popup.evaluate('document.querySelector("#site").focus()'); await pause(150);
  const focused = await popup.metrics(); assert.equal(focused.width, 320); assert.equal(focused.scrollWidth, 320);
  await popup.evaluate('document.querySelector("#diagnostics").open = true'); await pause(250);
  const expanded = await popup.metrics(); assert.equal(expanded.width, 320); assert.equal(expanded.scrollWidth, 320); assert(expanded.contentHeight > closed.contentHeight);
  await popup.screenshot('long-domain-diagnostics-native-popup.png');
  await popup.evaluate('document.querySelector("#copy-diagnostic").focus()');
  const diagnosticScroll = await popup.evaluate('({top:document.scrollingElement.scrollTop,bottom:document.querySelector("#copy-diagnostic").getBoundingClientRect().bottom,height:innerHeight})');
  assert(diagnosticScroll.bottom <= diagnosticScroll.height, 'diagnostic copy remains keyboard reachable');
  report.popup = { context: popup.context, closed, focused, expanded, diagnosticScroll };
  // The browser decodes each manifest/action image at its advertised dimensions.
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  report.icons = [];
  for (const [size, path] of Object.entries({ ...manifest.icons, ...manifest.action.default_icon })) {
    const bytes = await readFile(join(extension, path));
    assert.equal(bytes.readUInt32BE(16), Number(size)); assert.equal(bytes.readUInt32BE(20), Number(size));
    const image = await popup.evaluate('new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=reject;image.src=chrome.runtime.getURL(' + JSON.stringify(path) + ')})');
    assert.equal(image.width, Number(size)); assert.equal(image.height, Number(size));
    report.icons.push({ size, path, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await popup.close();
  report.nativeAudit = await nativeAudit(worker);
  assert(report.nativeAudit.filter(row => row.allowed).every(row => row.host === fixtureHost));
  report.result = 'PASS';
} catch (error) { report.error = error.stack; throw error; }
finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ result: report.result, checks: report.checks.length, popup: report.popup, icons: report.icons }, null, 2));
