// Owned browser, intercepted XHS-shaped fixture, actual binding functions; no Native/account.
import assert from 'node:assert/strict';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { canonicalTarget } from '../src/page-core.mjs';
import { readPlayer } from '../src/page-background.mjs';

const root = resolve(process.argv[2]);
await mkdir(root);
await cp(new URL(import.meta.url), root + '/executed-script.mjs');
const id = '6b08a8be000000002903d864', other = '6b08a8be000000002903d865';
const url = 'https://www.xiaohongshu.com/explore/' + id + '?xsec_token=fixture&xsec_source=pc_feed&source=webshare';
const media = 'data:video/mp4;base64,' + (await readFile(resolve(process.argv[3]))).toString('base64');
const report = { scope:'owned headless Edge, intercepted XHS-shaped DOM and local media; actual readPlayer/canonicalTarget/current bundle, simulated ACK, no Native', checks:{} };
const context = await chromium.launchPersistentContext(root + '/profile', { executablePath:process.argv[4], headless:true, locale:'zh-CN', viewport:{ width:320, height:780 }, args:['--disable-extensions','--no-first-run','--no-default-browser-check'] });
try {
  const page = await context.newPage();
  await page.route('**/*', async route => {
    if (route.request().url() === url) return route.fulfill({ contentType:'text/html', body:'<!doctype html><style>body{margin:0}#noteContainer{width:100%;max-width:800px;margin:40px auto}.player-el{position:relative;width:100%;aspect-ratio:1}video{width:100%;height:100%;object-fit:contain}</style><div id="noteContainer"><div class="player-el xhsplayer-skin-default"><video src="' + media + '"></video><xg-controls class="xgplayer-controls">Site controls</xg-controls><xg-start class="xgplayer-start">Site start</xg-start><xg-error class="xgplayer-error">Site error</xg-error></div></div>' });
    return route.abort();
  });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await page.addStyleTag({ path:'browser-extension/dist/page.css' });
  await page.evaluate(({ id, read, canonical }) => {
    const video = document.querySelector('video');
    globalThis.originalVideo = video; globalThis.originalPlayer = video.parentElement; globalThis.originalParent = video.parentElement.parentElement;
    globalThis.__INITIAL_STATE__ = { note:{ currentNoteId:{ value:id }, noteDetailMap:{ [id]:{ note:{ noteId:id, type:'video', video:{ media:{ stream:{ h264:[{ duration:video.duration * 1000 }] } } } } } } } };
    const readPlayer = (0, eval)('(' + read + ')');
    const PAGE_ORIGINS = { 'www.xiaohongshu.com':'https://www.xiaohongshu.com/*' };
    const pageHost = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && Object.hasOwn(PAGE_ORIGINS, u.hostname) ? u.hostname : null; } catch { return null; } };
    const target = eval('(' + canonical + ')');
    globalThis.fixtureBinding = () => target(location.href, readPlayer());
    globalThis.fixtureSubmits = [];
    globalThis.chrome = { runtime:{ onMessage:{ addListener(){}, removeListener(){} }, sendMessage:async m => {
      if (m.action === 'page-binding') return { ok:true, value:fixtureBinding() };
      if (m.action === 'page-submit') { fixtureSubmits.push(m); return { ok:true, value:{ task_id:'mock:xhs' } }; }
      throw Error('UNEXPECTED_ACTION');
    }, connectNative(){ throw Error('FORBIDDEN_NATIVE'); }, sendNativeMessage(){ throw Error('FORBIDDEN_NATIVE'); } } };
  }, { id, read:readPlayer.toString(), canonical:canonicalTarget.toString() });
  await page.addScriptTag({ path:'browser-extension/dist/page.js' });
  await page.locator('ameow-page-tools').waitFor();
  assert.equal(await page.evaluate(() => ameowPageTools.binding.url), url);
  await page.evaluate(() => ameowPageTools.openPeek());
  await page.locator('.ameow-peek[data-transition]').waitFor({ state:'detached' });
  const controls = page.locator('ameow-peek-controls');
  const dimensions = await controls.evaluate(h => ({ width:h.clientWidth, scroll:h.shadowRoot.querySelector('.controls').scrollWidth }));
  assert(dimensions.scroll <= dimensions.width);
  const stage = await page.locator('.ameow-peek-stage').boundingBox();
  const naturalAspect = await page.evaluate(() => originalVideo.videoWidth / originalVideo.videoHeight);
  report.geometry = { stage, naturalAspect, dimensions };
  assert(Math.abs(stage.width / stage.height - naturalAspect) < .02);
  assert.equal(await page.locator('xg-controls').evaluate(e => getComputedStyle(e).visibility), 'hidden');
  assert.equal(await page.locator('xg-error').evaluate(e => getComputedStyle(e).visibility), 'visible');
  await controls.locator('[data-action=marker]').focus();
  for (const [key, value] of [['KeyI', 1.25], ['KeyO', 4.75]]) {
    await page.evaluate(value => { originalVideo.currentTime = value; }, value);
    await page.waitForFunction(value => !originalVideo.seeking && Math.abs(originalVideo.currentTime - value) < .01, value);
    await page.keyboard.press(key);
  }
  report.marked = await page.evaluate(() => ({ draft:ameowPageTools.draft, duration:originalVideo.duration, currentTime:originalVideo.currentTime, binding:ameowPageTools.binding }));
  assert.deepEqual(report.marked.draft, { start_ms:1250, end_ms:4750 });
  await controls.locator('[data-action=precise]').click();
  await controls.locator('[data-action=submit]').click();
  assert.deepEqual(await page.evaluate(() => fixtureSubmits[0].clip), { start_ms:1250, end_ms:4750, precise:true });
  assert.equal(await page.evaluate(() => fixtureSubmits[0].url), url);
  await page.locator('.ameow-peek').screenshot({ path:root + '/xhs-320-light.png' });
  await page.emulateMedia({ colorScheme:'dark' });
  await page.locator('.ameow-peek').screenshot({ path:root + '/xhs-320-dark.png' });
  report.checks.narrowAspectKeyboardAndSubmission = dimensions;
  await page.keyboard.press('Escape');
  await page.locator('.ameow-peek').waitFor({ state:'detached' });
  assert(await page.evaluate(() => originalPlayer.parentElement === originalParent && originalPlayer.querySelector('video') === originalVideo));
  assert.equal(await page.locator('xg-controls').evaluate(e => getComputedStyle(e).visibility), 'visible');
  assert.deepEqual(await page.evaluate(() => ameowPageTools.draft), { start_ms:1250, end_ms:4750 });
  report.checks.samePlayerAndControlsRestored = true;
  await page.evaluate(() => ameowPageTools.openPeek());
  await page.locator('.ameow-peek[data-transition]').waitFor({ state:'detached' });
  await page.evaluate(async other => {
    const note = __INITIAL_STATE__.note, previous = note.noteDetailMap[note.currentNoteId.value].note;
    note.currentNoteId.value = other; note.noteDetailMap[other] = { note:{ ...previous, noteId:other } };
    history.pushState({}, '', '/explore/' + other + location.search);
    await ameowPageTools.refresh();
  }, other);
  assert.equal(await page.evaluate(() => ameowPageTools.binding.key), 'xiaohongshu:' + other);
  assert.deepEqual(await page.evaluate(() => ameowPageTools.draft), { start_ms:null, end_ms:null });
  assert.equal(await page.evaluate(() => ameowPageTools.precise), false);
  assert.equal(await page.locator('.ameow-peek').count(), 0);
  report.checks.spaWorkChangeResetsPeekAndDraft = true;
  await page.evaluate(async () => { __INITIAL_STATE__.note.noteDetailMap[__INITIAL_STATE__.note.currentNoteId.value].note.type = 'normal'; await ameowPageTools.refresh(); });
  assert.equal(await page.locator('ameow-page-tools').count(), 0);
  report.checks.imageNoteRefused = true;
  await page.evaluate(async () => { __INITIAL_STATE__.note.noteDetailMap[__INITIAL_STATE__.note.currentNoteId.value].note.type = 'video'; await ameowPageTools.refresh(); ameowPageTools.openPeek(); });
  await page.locator('.ameow-peek[data-transition]').waitFor({ state:'detached' });
  await page.evaluate(async () => { document.querySelector('#noteContainer').remove(); await ameowPageTools.refresh(); });
  assert.equal(await page.locator('.ameow-peek, ameow-page-tools').count(), 0);
  assert(await page.evaluate(() => originalVideo.paused && !originalPlayer.classList.contains('ameow-peek-player') && !originalPlayer.isConnected));
  report.checks.removedNoteClosesPeekAndPausesDetachedPlayer = true;
  await page.evaluate(() => ameowPageTools.stop());
} catch (error) { report.error = error.stack; throw error; }
finally { await context.close(); await writeFile(root + '/report.json', JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
