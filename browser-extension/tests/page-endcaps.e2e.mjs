// Local pointer/keyboard checks only; no extension, Native host, account or clipboard.
import assert from 'node:assert/strict';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const root = resolve(process.argv[2]), bundle = resolve(process.argv[5] || 'browser-extension/dist');
const selectionOnly = process.argv.includes('--selection-only');
await mkdir(root);
await cp(new URL(import.meta.url), join(root, 'executed-script.mjs'));
for (const [from, to] of [[process.argv[3], 'source.mp4'], [join(bundle, 'page.js'), 'page.js'], [join(bundle, 'page.css'), 'page.css']]) await cp(resolve(from), join(root, to));
await writeFile(join(root, 'fixture.html'), '<!doctype html><link rel="stylesheet" href="page.css"><style>body{margin:0;font:16px Georgia,serif}#outside{margin:20px}.bpx-player-container{position:relative;width:640px;height:360px;margin:50px auto}video{width:100%;height:100%}#host-edit,#host-note,#host-label{position:absolute;left:12px;top:12px;z-index:4}#host-note{top:40px;background:white}#host-label{top:66px;color:white}</style><p id="outside">Outside page words remain selectable</p><div class="bpx-player-container"><video src="source.mp4" controls></video><input id="host-edit" value="original input"><div id="host-note" contenteditable="true">original editable</div><span id="host-label">Player display words</span></div>');
const report = { scope: 'own local media and actual pointer/keyboard; mock binding, no extension/Native/clipboard/video recording', checks: {}, selectionOnly };
const context = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: process.argv[4], headless: true, locale: "zh-CN", viewport: { width: 848, height: 780 }, args: ['--disable-extensions', '--no-first-run', '--no-default-browser-check'] });
let page;
try {
  page = await context.newPage();
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await page.goto(pathToFileURL(join(root, 'fixture.html')).href);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  const selected = () => page.evaluate(() => window.getSelection().toString());
  const resetSelection = () => page.evaluate(() => window.getSelection().removeAllRanges());
  await page.locator('#outside').dblclick(); assert((await selected()).length > 0); await resetSelection();
  await page.evaluate(() => { globalThis.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} }, sendMessage: async m => {
    if (m.action === 'page-binding') return { ok: true, value: { key: 'local:1', url: 'https://www.bilibili.com/video/BV17x411w7KC/', duration: document.querySelector('video').duration } };
    throw Error('UNEXPECTED_ACTION');
  }, connectNative() { throw Error('FORBIDDEN_NATIVE'); }, sendNativeMessage() { throw Error('FORBIDDEN_NATIVE'); } } }; });
  await page.addScriptTag({ path: join(root, 'page.js') });
  await page.locator('ameow-page-tools').waitFor();
  await page.evaluate(() => ameowPageTools.openPeek());
  await page.locator('.ameow-peek[data-transition]').waitFor({ state: 'detached' });
  const controls = page.locator('ameow-peek-controls'), marker = controls.locator('[data-action=marker]');
  const at = async t => { await page.evaluate(t => { ameowPageTools.video.pause(); ameowPageTools.video.currentTime = t; }, t); await page.waitForFunction(() => !ameowPageTools.video.seeking); };
  const snapshot = () => page.evaluate(() => ({ draft: { ...ameowPageTools.draft }, time: ameowPageTools.video.currentTime }));
  for (const [name, locator] of [['time', controls.locator('.time')], ['tick', controls.locator('.ticks span').nth(1)], ['playerDisplay', page.locator('#host-label')]]) {
    await resetSelection(); await locator.dblclick();
    report.checks[name + 'DoubleClickSelection'] = await selected(); assert.equal(await selected(), '');
  }
  const timeBox = await controls.locator('.time').boundingBox();
  await resetSelection(); await page.mouse.move(timeBox.x + 2, timeBox.y + timeBox.height / 2); await page.mouse.down(); await page.mouse.move(timeBox.x + timeBox.width - 2, timeBox.y + timeBox.height / 2, { steps: 12 }); await page.mouse.up();
  report.checks.timeDragSelection = await selected(); assert.equal(await selected(), '');
  await page.locator('#host-edit').focus(); await page.keyboard.press('Control+A');
  assert(await page.locator('#host-edit').evaluate(e => e.selectionStart === 0 && e.selectionEnd === e.value.length));
  await page.keyboard.type('native input'); assert.equal(await page.locator('#host-edit').inputValue(), 'native input');
  await page.locator('#host-note').dblclick(); assert((await selected()).length > 0);
  await page.keyboard.press('Control+A'); await page.keyboard.type('editable o'); assert.equal(await page.locator('#host-note').innerText(), 'editable o');
  report.checks.hostEditableNativeSelection = true;
  assert.equal(await controls.getByRole('textbox').count(), 0);
  assert.equal(await controls.locator('[data-action=edit]').count(), 0);
  report.checks.timeEditorRemoved = true;
  if(await marker.getAttribute('aria-pressed')==='true') await marker.click(); await at(3); await marker.press('Space');
  const singlePath = await controls.locator('.handle.single:not([hidden]) path').getAttribute('d');
  assert.equal(singlePath, await marker.locator('path').getAttribute('d'));
  report.singlePath = singlePath;
  const fullTipY = await controls.locator('.handle.single:not([hidden]) svg').evaluate(e => new DOMPoint(12,20).matrixTransform(e.getScreenCTM()).y);
  await resetSelection();
  const h = controls.locator('.handle.single:not([hidden])'), hb = await h.boundingBox(), x = hb.x + hb.width / 2 + 10;
  await page.mouse.move(x, hb.y + 12); await page.mouse.down(); await page.mouse.move(x + 90, hb.y + 12, { steps: 12 }); await page.mouse.up();
  assert.equal((await snapshot()).time, 3); assert.equal(await selected(), '');
  assert((await snapshot()).draft.end_ms > 3000);
  if (!selectionOnly) {
    const left = controls.getByRole('slider', { name: '拖动入点', exact: true }), right = controls.getByRole('slider', { name: '拖动出点', exact: true });
    const leftPath = await left.locator('path').getAttribute('d'), rightPath = await right.locator('path').getAttribute('d');
    assert.notEqual(leftPath, rightPath); assert.notEqual(leftPath, singlePath); assert.notEqual(rightPath, singlePath);
    report.endcapPaths = { left: leftPath, right: rightPath };
    report.endcapGeometry = [];
    for (const [control,key] of [[left,'start_ms'],[right,'end_ms']]) {
      const geometry = await control.locator('svg').evaluate(e => { const tip=new DOMPoint(7,12.5125).matrixTransform(e.getScreenCTM()),box=e.getBoundingClientRect(),path=e.querySelector('path');return {width:box.width,height:box.height,tip:{x:tip.x,y:tip.y},strokeWidth:getComputedStyle(path).strokeWidth,vectorEffect:getComputedStyle(path).vectorEffect}; });
      const track = await controls.locator('.track').boundingBox(),value=(await snapshot()).draft[key];
      assert.equal(geometry.width,14);assert.equal(geometry.height,14);assert.equal(geometry.strokeWidth,'1.5px');assert.equal(geometry.vectorEffect,'non-scaling-stroke');
      assert(Math.abs(geometry.tip.x-(track.x+value/8000*track.width))<.05);assert(Math.abs(geometry.tip.y-fullTipY)<.05);report.endcapGeometry.push(geometry);
    }
    const box = await left.boundingBox(); await page.mouse.move(box.x + box.width - 5, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + box.width - 40, box.y + 12, { steps: 10 }); await page.mouse.up();
    const before = await snapshot(); assert.equal(before.time, 3); assert(before.draft.start_ms < 3000); assert.equal(await selected(), '');
    await left.focus(); assert((await controls.getByRole('tooltip').innerText()).includes('入点'));
    await left.press('ArrowLeft'); assert.equal((await snapshot()).draft.start_ms, before.draft.start_ms - 1);
    await right.focus(); assert((await controls.getByRole('tooltip').innerText()).includes('出点'));
    await marker.focus(); await at(1.25); await marker.press('KeyI'); await at(4.75); await marker.press('Shift+KeyO');
    assert.deepEqual((await snapshot()).draft, { start_ms: 1250, end_ms: 4750 });
    const cb = await controls.boundingBox(); await page.screenshot({ path: join(root, 'endcaps-light.png'), clip: { x: cb.x, y: cb.y - 44, width: cb.width, height: cb.height + 44 } });
    await page.emulateMedia({ colorScheme: 'dark' }); await page.screenshot({ path: join(root, 'endcaps-dark.png'), clip: { x: cb.x, y: cb.y - 44, width: cb.width, height: cb.height + 44 } });
    await marker.press('Space'); assert.deepEqual((await snapshot()).draft, { start_ms: null, end_ms: null });
    await marker.press('Space'); assert.equal(await controls.locator('.handle.single:not([hidden]) path').getAttribute('d'), singlePath);
    report.checks.endcapsPointerKeyboardAndReset = true;
  }
  await page.keyboard.press('Escape'); await page.locator('.ameow-peek').waitFor({ state: 'detached' });
  await resetSelection(); await page.locator('#outside').dblclick(); assert((await selected()).length > 0); report.checks.outsidePageStillSelectable = true;
  report.build = JSON.parse(await readFile(join(bundle, 'build.json'), 'utf8'));
  report.bundleSha256 = createHash('sha256').update(await readFile(join(root, 'page.js'))).digest('hex'); report.pass = true;
} catch (error) { report.error = error.stack; if (page) { report.selectionAtFailure = await page.evaluate(() => window.getSelection().toString()).catch(() => null); await page.screenshot({ path: join(root, 'failure.png') }).catch(() => {}); } process.exitCode = 1; }
finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(root);
