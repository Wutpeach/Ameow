// Local media + mock page binding only: no extension, Native host or account.
import assert from 'node:assert/strict';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const root = resolve(process.argv[2]);
await mkdir(root); // Fail rather than overwrite evidence.
await cp(resolve(process.argv[3]), join(root, 'source.mp4'));
await cp(resolve('browser-extension/dist/page.js'), join(root, 'page.js'));
await cp(resolve('browser-extension/dist/page.css'), join(root, 'page.css'));
await writeFile(join(root, 'fixture.html'), '<!doctype html><link rel="stylesheet" href="page.css"><style>body{margin:0}.bpx-player-container{position:relative;width:640px;height:360px;margin:80px auto}video{width:100%;height:100%}</style><div class="bpx-player-container"><video src="source.mp4" controls></video></div>');
const report = { scope: 'local synthetic page, mocked page binding/submit, no extension or Native APIs', results: {} };
const context = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: process.argv[4], headless: true, viewport: { width: 1100, height: 900 }, args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check'] });
try {
  const page = await context.newPage();
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(join(root, 'fixture.html')).href);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await page.evaluate(() => {
    globalThis.fixtureSubmits = [];
    globalThis.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async message => {
      if (message.action === 'page-binding') return { ok: true, value: { key: 'bilibili:fixture:1:1', url: 'https://www.bilibili.com/video/BV17x411w7KC/?p=1', duration: document.querySelector('video').duration } };
      if (message.action === 'page-submit') { fixtureSubmits.push(message); return { ok: true, value: { task_id: 'mock:1' } }; }
      throw Error('UNEXPECTED_MOCK_ACTION');
    }, connectNative() { throw Error('FORBIDDEN_NATIVE'); }, sendNativeMessage() { throw Error('FORBIDDEN_NATIVE'); } } };
  });
  await page.addScriptTag({ path: join(root, 'page.js') });
  await page.locator('ameow-page-tools').waitFor();
  const open = async () => { await page.evaluate(() => ameowPageTools.openPeek()); await page.locator('.ameow-peek[data-transition]').waitFor({ state: 'detached' }); };
  const controls = page.locator('ameow-peek-controls');
  const marks = async () => { await controls.getByRole('textbox', { name: '入点时间' }).fill('1.250'); await controls.getByRole('textbox', { name: '出点时间' }).fill('4.750'); };
  await open(); await marks();
  await page.evaluate(() => ameowPageTools.video.pause());
  const clear = controls.getByRole('button', { name: '清除选区' });
  await clear.focus(); await clear.press('Space');
  assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isDisabled());
  assert(await page.evaluate(() => ameowPageTools.video.paused));
  report.results.spaceClear = await page.evaluate(() => ({ draft: { ...ameowPageTools.draft }, dialogOpen: !!document.querySelector('.ameow-peek[open]') }));
  assert.equal(report.results.spaceClear.draft.start_ms, null); assert(report.results.spaceClear.dialogOpen);
  await marks(); await clear.press('Enter'); assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isDisabled()); report.results.enterClear = true;
  const close = controls.getByRole('button', { name: '关闭预览' }); await close.focus(); await close.press('Space');
  await page.locator('.ameow-peek').waitFor({ state: 'detached' }); report.results.spaceClose = true;
  await open(); await marks();
  const submit = controls.getByRole('button', { name: '下载片段', exact: true }); await submit.focus(); await submit.press('Space');
  await controls.getByRole('button', { name: '已加入队列', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => fixtureSubmits.length), 1); report.results.spaceSubmit = true;
  await page.evaluate(() => { ameowPageTools.video.pause(); ameowPageTools.stage.tabIndex = 0; ameowPageTools.stage.focus(); });
  await page.keyboard.press('Space'); assert(await page.evaluate(() => !ameowPageTools.video.paused)); report.results.backgroundSpacePlayback = true;
  await page.keyboard.press('Escape'); await page.locator('.ameow-peek').waitFor({ state: 'detached' }); report.results.escapeRestores = true;
  await page.evaluate(() => ameowPageTools.stop());
  report.browserVersion = context.browser().version();
  report.productBuild = JSON.parse(await readFile(resolve('browser-extension/dist/build.json'), 'utf8'));
  report.bundleSha256 = createHash('sha256').update(await readFile(join(root, 'page.js'))).digest('hex');
} finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
