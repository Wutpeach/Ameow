import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.lab.config.ts', '--host', '127.0.0.1', '--port', '61341'], { stdio: 'inherit' });
const base = 'http://127.0.0.1:61341/';
for (let attempt = 0; attempt < 100; attempt += 1) {
  try { if ((await fetch(`${base}lab.html`)).ok) break; } catch {}
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const browser = await chromium.launch();
let releasePending = () => {};
const url = (id) => `${base}lab.html?scenario=${id}&capture=true&reducedMotion=true`;
const select = (page, id) => page.evaluate((scenario) => {
  const next = new URL(location.href);
  next.searchParams.set('scenario', scenario);
  history.pushState(null, '', next);
  dispatchEvent(new PopStateEvent('popstate'));
}, id);
const ready = (page, id) => page.locator(`[data-lab-selected-scenario="${id}"][data-lab-ready]`);
try {
  const page = await browser.newPage();
  await page.goto(url('ripple-reference'), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ready(page, 'ripple-reference').waitFor();
  console.log('Initial Ripple ready');
  await select(page, 'compact-pointer');
  await ready(page, 'compact-pointer').waitFor();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  releasePending = release;
  await page.route('**/ameow-download-active-200.png', async (route) => { await pending; await route.continue(); });
  await select(page, 'ripple-reference');
  console.log('Ripple revisit selected');
  await page.locator('[data-lab-selected-scenario="ripple-reference"]').waitFor();
  await page.waitForTimeout(150);
  assert.equal(await ready(page, 'ripple-reference').count(), 0, 'revisit must not reuse prior readiness while image is pending');
  release();
  await ready(page, 'ripple-reference').waitFor();
  await page.close();
  for (const id of ['download-active', 'ripple-reference']) {
    const failed = await browser.newPage();
    await failed.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind === 'webgl' || kind === 'webgl2') return null;
        return original.call(this, kind, ...args);
      };
    });
    await failed.goto(url(id), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await failed.locator(`[data-lab-selected-scenario="${id}"]`).waitFor();
    await failed.waitForTimeout(300);
    assert.equal(await ready(failed, id).count(), 0, `${id}: unavailable WebGL must not report ready`);
    await failed.close();
  }
  console.log('PASS: delayed Ripple revisit generation; WebGL2 unavailable; Ripple WebGL1 unavailable');
} finally {
  releasePending();
  await browser.close();
  server.kill();
}
