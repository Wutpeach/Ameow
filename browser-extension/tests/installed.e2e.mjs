// Real release helper + production manifest preparation + Edge Native Messaging.
// Only Ping is sent: no CookieJar, Keychain, daily profile or site authorization.
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
const [root, product, builder] = process.argv.slice(2).map(p => resolve(p));
assert(root && product && builder && isAbsolute(root));
await mkdir(root);
const hostName = 'org.ameow.browser_sessions.fixture';
const registry = 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\' + hostName;
const manifestPath = join(root, 'native-host.json');
const build = JSON.parse(await readFile(join(product, 'release-build.json'), 'utf8'));
const host = join(product, 'ameow-browser-host.exe');
execFileSync(builder, [host, manifestPath], {windowsHide:true,stdio:['ignore','pipe','pipe']});
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(!manifest.path.startsWith('\\\\?\\'));
const normal = manifest.path;
const report = {source:build.commit,host_sha256:build.browser.find(x=>x.path==='ameow-browser-host.exe').sha256,normal_path:normal,storeOperation:false,siteAuthorization:false,checks:[]};
const reg = args => execFileSync('reg.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
let registered = false, browser;
try {
  let existed=false; try { reg(['query',registry]);existed=true; } catch {}
  assert(!existed,'fixture registration already exists');
  reg(['add',registry,'/ve','/t','REG_SZ','/d',manifestPath,'/f']);registered=true;
  const extension=join(product,'browser-extension');
  browser=await chromium.launchPersistentContext(join(root,'profile'),{channel:'msedge',headless:true,args:['--headless=new','--load-extension='+extension,'--disable-extensions-except='+extension,'--no-first-run','--no-default-browser-check']});
  const worker=browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  report.browserVersion=browser.browser().version();
  assert(worker.url().startsWith('chrome-extension://icedkidcbbbijndplfofcbhikohlcool/'));
  const permissions=await worker.evaluate(()=>chrome.permissions.getAll());
  assert.equal(permissions.origins?.length || 0,0);
  report.hostPermissions=[];
  async function ping(){return worker.evaluate(name=>new Promise(resolve=>chrome.runtime.sendNativeMessage(name,{version:1,request_id:'installed-bridge-probe',operation:{operation:'ping'}},reply=>{const error=chrome.runtime.lastError?.message;resolve({ok:!error,communicationError:Boolean(error?.includes('communicating')),reply});})),hostName);}
  const first=await ping();assert(first.ok && first.reply.ok);assert.equal(first.reply.bridge.sha256.toLowerCase(),report.host_sha256.toLowerCase());
  report.checks.push('ordinary product manifest and browser handshake identify the exact release helper');
  manifest.path='\\\\?\\'+normal;await writeFile(manifestPath,JSON.stringify(manifest));
  const failed=await ping();assert(!failed.ok && failed.communicationError);
  report.checks.push('same helper with a verbatim path reproduces browser communication failure');
  manifest.path=normal;await writeFile(manifestPath,JSON.stringify(manifest));
  const recovered=await ping();assert(recovered.ok && recovered.reply.ok);
  report.checks.push('normal path restores handshake without a store read or site permission');
  report.result='PASS';
} finally {
  if(browser)await browser.close();
  if(registered){reg(['delete',registry,'/f']);let exists=false;try{reg(['query',registry]);exists=true;}catch{}assert(!exists);report.testRegistrationRemoved=true;}
  await writeFile(join(root,'result.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
