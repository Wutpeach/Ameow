// Actual browser -> unique native fixture -> owned desktop -> public media.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, access, writeFile, readFile, cp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { prepareIsolatedExtension, assertRuntimeIsolation, nativeAudit } from './isolation.mjs';
const directory = resolve(process.argv[2]);
const binary = resolve(process.argv[3]);
const brand = process.argv[4] || 'cft';
try { await access(directory); throw Error('Use a fresh owned directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(directory, { recursive: true });
const instance = join(directory, 'desktop'), extension = join(directory, 'extension');
await mkdir(join(instance, 'output'), { recursive: true });
await mkdir(join(instance, 'runtime'), { recursive: true });
const runtimeName = 'runtime-8C3467B59F393E0435078D6094061207733E3561A9CA649AF56C4E04D814888F';
await cp('D:/Ameow-handoffs/issue50-implementation/media-runtime/' + runtimeName, join(instance, 'runtime', runtimeName), { recursive: true });
const host = 'org.ameow.browser_sessions.fixture.submit_' + randomUUID().replaceAll('-', '');
const fixtureBuild = await prepareIsolatedExtension(resolve('browser-extension/dist'), extension, host);
const key = 'HKCU\\Software\\' + (brand === 'edge' ? 'Microsoft\\Edge' : 'Google\\Chrome') + '\\NativeMessagingHosts\\' + host;
const helper = join(binary, 'ameow-browser-host.exe'), cli = join(binary, 'ameow-cli.exe'), app = join(binary, 'ameow.exe');
const manifest = join(directory, 'native-host.json');
await writeFile(manifest, JSON.stringify({ name: host, path: helper, description: 'Owned #50 page submit fixture', type: 'stdio', allowed_origins: ['chrome-extension://icedkidcbbbijndplfofcbhikohlcool/'] }));
const report = { brand, instance, host, fixtureBuild, nativeManifest: manifest, registry: key, checks: [], binarySha256: {} };
for (const [name, path] of Object.entries({ helper, cli, app })) report.binarySha256[name] = createHash('sha256').update(await readFile(path)).digest('hex');
const pause = ms => new Promise(r => setTimeout(r, ms));
const reg = args => execFileSync('reg.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
function command(...args) { return JSON.parse(execFileSync(cli, ['--json', '--no-start', '--instance-root', instance, ...args], { windowsHide: true, timeout: 180000, encoding: 'utf8' })); }
async function until(action, label, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { const result = await action(); if (result) return result; await pause(200); } throw Error('Timed out: ' + label); }
let registered = false, desktop, context, worker;
try {
  let exists = false; try { reg(['query', key]); exists = true; } catch {} assert(!exists);
  reg(['add', key, '/ve', '/t', 'REG_SZ', '/d', manifest, '/f']); registered = true;
  assert(reg(['query', key, '/ve']).toString().includes(manifest)); report.registrationConfirmed = true;
  const log = createWriteStream(join(directory, 'desktop.log'));
  desktop = spawn(app, ['--instance-root', instance, '--cli-launch'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); desktop.stdout.pipe(log); desktop.stderr.pipe(log);
  await until(() => { try { return command('list').ok; } catch { return false; } }, 'same private desktop handshake');
  context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    ...(brand === 'edge' ? { channel: 'msedge' } : { executablePath: 'D:/Ameow-handoffs/issue24-browser-validation/chrome-for-testing/158.0.8127.36/chrome-win64/chrome.exe' }),
    headless: true, ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: join(directory, 'video'), size: { width: 1440, height: 1000 } },
    args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'],
    env: { ...process.env, AMEOW_BROWSER_TEST_INSTANCE: instance },
  });
  report.browserVersion = context.browser().version();
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'); report.isolation = await assertRuntimeIsolation(worker, host);
  const manager = await context.newPage(); await manager.goto(brand === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
  await manager.evaluate(async () => { for (const origin of ['https://www.youtube.com/*', 'https://www.bilibili.com/*']) await chrome.developerPrivate.addHostPermission('icedkidcbbbijndplfofcbhikohlcool', origin); }); await manager.close();
  // Source/profile/Store are private. No Cookie authorization is granted in this test.
  for (const [site, url] of [['youtube', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'], ['bilibili', 'https://www.bilibili.com/video/BV17x411w7KC/']]) {
    const page = await context.newPage(); const row = { site, url }; report.checks.push(row);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => [...document.querySelectorAll('video, bwp-video')].some(v => v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0), null, { timeout: 30000 });
    await page.bringToFront(); const tab = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
    const popup = await context.newPage(); await popup.setViewportSize({ width: 320, height: 600 });
    await popup.addInitScript(tab => { chrome.tabs.query = async () => [tab]; }, { id: tab.id, url: page.url() });
    await popup.goto('chrome-extension://icedkidcbbbijndplfofcbhikohlcool/popup.html'); assert.equal(await popup.evaluate(() => globalThis.ameowFixtureNativeGuard), host);
    await popup.getByRole('button', { name: '启用页面工具' }).click(); await popup.getByRole('button', { name: '关闭页面工具' }).waitFor(); await popup.close(); await page.bringToFront();
    await page.setViewportSize({ width: 1441, height: 1000 }); await page.setViewportSize({ width: 1440, height: 1000 });
    const toolbar = page.locator('ameow-page-tools'); await toolbar.waitFor({ timeout: 20000 });
    await toolbar.getByRole('button', { name: '下载', exact: true }).hover({position:{x:60,y:14}}); await pause(240);
    const select = toolbar.getByRole('button', { name: '切片' }); const box = await select.boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const controls = page.locator('ameow-peek-controls');
    await controls.getByRole('textbox', { name: '入点时间' }).fill('0:01.250'); await controls.getByRole('textbox', { name: '出点时间' }).fill('0:04.750');
    await controls.getByRole('button', { name: '下载片段', exact: true }).click();
    await controls.getByRole('button', { name: '已加入队列', exact: true }).waitFor({ timeout: 45000 });
    const list = command('list'); const accepted = list.result.jobs.at(-1); row.accepted = accepted;
    assert(accepted.task_id, 'real desktop task identity');
    row.queueAck = true;
    await page.locator('.ameow-peek').screenshot({ path: join(directory, site + '-accepted.png') });
    await controls.locator('[data-action=marker]').click(); assert(await controls.getByRole('button', { name: '下载片段', exact: true }).isDisabled());
    await page.mouse.click(3, 3); await page.locator('.ameow-peek').waitFor({ state: 'detached' });
    let done;
    await until(() => { const value = command('show', accepted.task_id); done = value.result; return done?.resources_released && ['Success', 'Failure', 'Cancelled'].includes(done.phase); }, 'owned public clip settlement', 150000);
    row.result = done;
    assert.deepEqual(done.accepted.intent.clip, { start_ms: 1250, end_ms: 4750 });
    assert.equal(done.phase, 'Success', 'public clip delivered by the production verifier');
    if (brand === 'edge' && site === 'youtube') {
      const full = toolbar.getByRole('button', { name: '下载', exact: true });
      await full.click();
      await toolbar.getByRole('button', { name: '已加入队列', exact: true }).waitFor({ timeout: 45000 });
      const acceptedFull = command('list').result.jobs.at(-1);
      assert(!acceptedFull.accepted.intent.clip, 'cat click submits the whole work');
      let fullResult;
      await until(() => { fullResult = command('show', acceptedFull.task_id).result; return fullResult.resources_released && ['Success', 'Failure'].includes(fullResult.phase); }, 'whole-work delivery', 150000);
      assert.equal(fullResult.phase, 'Success'); row.wholeResult = fullResult;
    }
    row.video = await page.video().path(); await page.close();
  }
  report.nativeAudit = await nativeAudit(worker);
  assert(report.nativeAudit.every(e => e.allowed ? e.host === host : e.host === 'FORBIDDEN'));
  assert(report.nativeAudit.some(e => e.operation === 'submit' && e.allowed));
  assert.equal(Object.keys((await worker.evaluate(() => chrome.storage.local.get('grants'))).grants || {}).length, 0);
} catch (e) { report.error = e.stack; throw e; }
finally {
  if (context) await context.close();
  if (desktop && desktop.exitCode === null) desktop.kill();
  if (registered) { reg(['delete', key, '/f']); let remains = false; try { reg(['query', key]); remains = true; } catch {} report.fixtureRegistrationRemoved = !remains; }
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
