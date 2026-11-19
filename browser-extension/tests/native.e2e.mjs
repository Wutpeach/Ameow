// Fresh owned Edge profile + synthetic cookies + real stdio bridge + ordinary desktop owner.
// Permission is seeded through the isolated browser's extension manager, since headless
// Edge cannot accept its native consent prompt. This is not real-user consent evidence.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, cp, readFile, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
const project = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(process.argv[2]);
const syncStatusOnly = process.argv.includes('--sync-status-only');
const instance = join(directory, 'desktop');
const extensionId = 'icedkidcbbbijndplfofcbhikohlcool';
const hostName = 'org.ameow.browser_sessions.fixture';
const registry = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\' + hostName;
const native = join(project, 'target/debug/ameow-browser-host.exe');
const cli = join(project, 'target/debug/ameow-cli.exe');
const app = join(project, 'target/debug/ameow.exe');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(action, description, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const value = await action(); if (value) return value; await pause(200); }
  throw Error('Timed out: ' + description);
}
try { await access(directory); throw Error('Choose a new fixture directory'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(directory, { recursive: true });
await writeFile(join(directory, 'SYNTHETIC_FIXTURE.txt'), 'Ameow browser session fixture\n');
const extension = join(directory, 'extension');
await cp(join(project, 'browser-extension/dist'), extension, { recursive: true });
const background = await readFile(join(extension, 'background.js'), 'utf8');
await writeFile(join(extension, 'background.js'), background.replaceAll('org.ameow.browser_sessions', hostName));
const manifest = join(directory, 'native-host.json');
await writeFile(manifest, JSON.stringify({ name: hostName, description: 'Isolated Ameow synthetic fixture', path: native, type: 'stdio', allowed_origins: ['chrome-extension://' + extensionId + '/'] }));
let registered = false, context, desktop;
const evidence = { fixture: true, realMembership: 'NOT TESTED', permissionConsent: 'seeded through isolated Edge extension manager', checks: [] };
function reg(args) { return execFileSync('reg.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
function desktopSessions() {
  try { return JSON.parse(execFileSync(cli, ['--json', '--instance-root', instance, 'sessions'], { windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })).result; }
  catch { return undefined; }
}
function snapshot(stage) {
  execFileSync('cargo', ['test', '--locked', '--lib', 'browser_sessions::tests::native_browser_fixture_snapshot', '--', '--ignored', '--exact'], {
    cwd: project, windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AMEOW_BROWSER_E2E_INSTANCE: instance, AMEOW_BROWSER_E2E_STAGE: stage },
  });
  evidence.checks.push('native CookieJar snapshot: ' + stage);
}
async function launch() {
  return chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'msedge', headless: true,
    args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'],
    env: { ...process.env, AMEOW_BROWSER_TEST_INSTANCE: instance },
  });
}
async function popup() {
  const page = await context.newPage(); await page.setViewportSize({ width: 320, height: 430 });
  // A tab displaying the popup cannot inherit the toolbar popup's active-tab context.
  // Only this API result is replaced, with the local fixture page's public identity.
  await page.addInitScript(() => { chrome.tabs.query = async () => [{ url: 'https://www.example.com/fixture' }]; });
  await page.goto('chrome-extension://' + extensionId + '/popup.html'); return page;
}
try {
  let exists = false; try { reg(['query', registry]); exists = true; } catch {}
  assert.equal(exists, false, 'fixture registration must be unused');
  reg(['add', registry, '/ve', '/t', 'REG_SZ', '/d', manifest, '/f']); registered = true;
  await mkdir(join(instance, 'output'), { recursive: true });
  const log = createWriteStream(join(directory, 'desktop.log'));
  desktop = spawn(app, ['--instance-root', instance, '--cli-launch'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  desktop.stdout.pipe(log); desktop.stderr.pipe(log);
  evidence.desktopPid = desktop.pid;
  await until(() => desktopSessions(), 'ordinary desktop control handshake');
  context = await launch(); evidence.browserVersion = context.browser().version();
  const manager = await context.newPage(); await manager.goto('edge://extensions/');
  await manager.evaluate(async id => {
    await chrome.developerPrivate.addHostPermission(id, 'https://*.example.com/*');
    await chrome.developerPrivate.addHostPermission(id, 'http://*.example.com/*');
  }, extensionId);
  await manager.close();
  await context.addCookies([
    { name: 'ameow_synthetic', value: 'AMEOW_SYNTHETIC_V1', domain: '.example.com', path: '/', httpOnly: true, secure: true, expires: Date.now() / 1000 + 86400 },
    { name: 'unrelated', value: 'UNAUTHORIZED_SYNTHETIC', domain: '.evil.net', path: '/', secure: true },
  ]);
  let page = await popup();
  await page.getByRole('button', { name: '授权此站点', exact: true }).click();
  await until(() => desktopSessions()?.sites?.find(s => s.site === 'example.com' && s.cookie_count === 1), 'first browser authorization reaches desktop');
  snapshot('v1');
  await page.screenshot({ path: join(directory, 'extension-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: join(directory, 'extension-dark.png') });
  assert.equal(await page.evaluate(() => chrome.permissions.contains({ origins: ['https://*.evil.net/*'] })), false);
  evidence.checks.push('unrelated site remains ungranted');
  if (syncStatusOnly) {
    const cached = desktopSessions().sites[0].synced_at;
    const worker = context.serviceWorkers()[0];
    await worker.evaluate(() => { globalThis.originalCookieRead = chrome.cookies.getAll; chrome.cookies.getAll = async () => { throw Error('synthetic read failure'); }; });
    await page.getByRole('button', {name:'立即同步',exact:true}).click();
    await until(() => desktopSessions()?.sites?.[0]?.last_result?.error === 'E_COOKIE_READ', 'browser failure reaches desktop status');
    await pause(1100);
    assert.equal(desktopSessions().sites[0].synced_at,cached);
    assert.equal(desktopSessions().sites[0].last_result.error,'E_COOKIE_READ');
    evidence.checks.push('failed browser sync preserves cached time and survives desktop polling');
    await page.screenshot({path:join(directory,'sync-failure.png')});
    await worker.evaluate(() => { chrome.cookies.getAll = globalThis.originalCookieRead; });
    await page.getByRole('button', {name:'立即同步',exact:true}).click();
    await until(() => desktopSessions()?.sites?.[0]?.last_result?.error === null, 'fresh successful sync clears failure');
    evidence.checks.push('fresh successful browser receipt clears the reported failure');
  } else {
  const first = desktopSessions().sites[0].synced_at; await pause(1100);
  await context.addCookies([{ name: 'ameow_synthetic', value: 'AMEOW_SYNTHETIC_V2', domain: '.example.com', path: '/', httpOnly: true, secure: true, expires: Date.now() / 1000 + 86400 }]);
  await until(() => desktopSessions()?.sites?.[0]?.synced_at > first, 'Cookie change auto-sync'); snapshot('v2');
  const beforeRestart = desktopSessions().sites[0].synced_at; await pause(1100);
  await context.close(); context = await launch();
  await until(() => desktopSessions()?.sites?.[0]?.synced_at > beforeRestart, 'browser restart resynchronization'); snapshot('v2');
  await context.clearCookies({ name: 'ameow_synthetic', domain: '.example.com' });
  await until(() => desktopSessions()?.sites?.[0]?.cookie_count === 0, 'deleted Cookie auto-sync'); snapshot('empty');
  }
  page = await popup(); await page.getByRole('button', { name: '移除', exact: true }).click();
  await until(() => desktopSessions()?.sites?.length === 0, 'permission revocation reaches desktop'); snapshot('revoked');
  assert.equal(await page.evaluate(() => chrome.permissions.contains({ origins: ['https://*.example.com/*'] })), false);
  evidence.checks.push('browser permission removed and desktop cache revoked');
  evidence.result = 'PASS';
} catch (error) { evidence.result = 'FAIL'; evidence.error = String(error); throw error; }
finally {
  await writeFile(join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
  if (context) await context.close();
  if (desktop) desktop.kill(); // Owned fixture only; this is not shutdown-settlement evidence.
  if (registered) reg(['delete', registry, '/f']);
}
console.log(JSON.stringify(evidence, null, 2));
