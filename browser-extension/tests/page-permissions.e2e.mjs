// Real Chromium permissions; exact classes, mocked desktop revoke, no Cookie/Native APIs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const root = resolve(process.argv[2]), extension = join(root, 'extension'); await mkdir(root); await mkdir(extension);
await writeFile(join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Owned page permission regression', version: '1.0', permissions: ['storage', 'scripting'], optional_host_permissions: ['http://*/*', 'https://*/*'], background: { service_worker: 'background.js', type: 'module' } }));
await build({ stdin: { contents: 'import {Sessions} from "./src/core.mjs"; import {PageTools} from "./src/page-background.mjs"; globalThis.pages=new PageTools(chrome); globalThis.operations=[]; globalThis.sessions=new Sessions(chrome,()=>({request:async op=>{operations.push(op.operation); return [];},close(){}})); sessions.collect=async()=>{throw Error("COOKIE_COLLECTION_FORBIDDEN")};', resolveDir: resolve('browser-extension') }, bundle: true, format: 'esm', outfile: join(extension, 'background.js') });
await writeFile(join(extension, 'page.js'), '// registration only, no page is visited'); await writeFile(join(extension, 'page.css'), '');
await writeFile(join(extension, 'test.html'), '<button>Grant test permissions</button><script src="test.js"></script>');
await writeFile(join(extension, 'test.js'), 'document.querySelector("button").onclick=async()=>{document.querySelector("button").textContent=String(await chrome.permissions.request({origins:["https://www.youtube.com/*","https://*.youtube.com/*","http://*.youtube.com/*"]}))}');
const context = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: process.argv[3], headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'] });
const report = { scope: 'owned minimal extension/profile, real permissions; mock desktop revoke; no Cookie or Native permissions, no websites' };
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'), id = new URL(worker.url()).host;
  const manager = await context.newPage(); await manager.goto('chrome://extensions/');
  await manager.evaluate(async id => { for (const origin of ['https://www.youtube.com/*', 'https://*.youtube.com/*', 'http://*.youtube.com/*']) await chrome.developerPrivate.addHostPermission(id, origin); }, id); await manager.close();
  const page = await context.newPage(); await page.goto('chrome-extension://' + id + '/test.html');
  await page.getByRole('button').click(); await page.getByRole('button', { name: 'true', exact: true }).waitFor();
  const snapshot = () => worker.evaluate(async () => ({ permission: await chrome.permissions.contains({ origins: ['https://www.youtube.com/*'] }), enabled: await pages.enabled('www.youtube.com'), registered: (await chrome.scripting.getRegisteredContentScripts()).length, state: await chrome.storage.local.get(['page_tools', 'grants']), operations }));
  await worker.evaluate(async () => { await chrome.storage.local.set({ page_tools: { 'www.youtube.com': true }, grants: { 'youtube.com': { grant_id: 'owned-fixture', sequence: 0 } } }); await pages.reconcile(); });
  report.before = await snapshot(); assert(report.before.enabled); assert.equal(report.before.registered, 1);
  await worker.evaluate(async () => { await sessions.revoke('youtube.com'); await pages.reconcile(); });
  report.afterCookieRevoke = await snapshot(); assert(report.afterCookieRevoke.permission && report.afterCookieRevoke.enabled); assert.equal(report.afterCookieRevoke.registered, 1); assert.deepEqual(report.afterCookieRevoke.state.grants, {}); assert(report.afterCookieRevoke.operations.includes('revoke'));
  await worker.evaluate(async () => { await chrome.permissions.remove({ origins: ['https://*.youtube.com/*'] }); await pages.reconcile(); });
  report.afterBrowserRemoval = await snapshot(); assert(!report.afterBrowserRemoval.enabled); assert.equal(report.afterBrowserRemoval.registered, 0); assert.equal(report.afterBrowserRemoval.state.page_tools['www.youtube.com'], false);
  report.browserVersion = context.browser().version();
} catch (error) { report.error = error.stack; throw error; }
finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
