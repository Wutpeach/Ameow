// Real release helper + production manifest preparation + an explicitly selected browser.
// Only Ping is sent: no CookieJar, Keychain, daily profile or site authorization.
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join, isAbsolute } from 'node:path';
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
const {positionals,values} = parseArgs({allowPositionals:true,options:{browser:{type:'string',default:'edge'},executable:{type:'string'},'fixture-host':{type:'string'}}});
assert.equal(positionals.length,3,'root product manifest-builder are required');
const [root, product, builder] = positionals.map(p => resolve(p));
assert(['edge','chrome-for-testing'].includes(values.browser),'choose edge or chrome-for-testing');
assert(values.browser==='edge' || values.executable,'Chrome for Testing requires an explicit executable');
const browserKey=values.browser==='edge' ? 'Microsoft\\Edge' : 'Google\\Chrome';
const hostName=values['fixture-host'] || 'org.ameow.browser_sessions.fixture.'+values.browser.replaceAll('-','_')+'.'+randomUUID().replaceAll('-','');
assert(hostName.startsWith('org.ameow.browser_sessions.fixture.') && /^[a-z0-9_.]+$/.test(hostName));
assert(root && product && builder && isAbsolute(root));
await mkdir(root);
const registry = 'HKCU\\Software\\'+browserKey+'\\NativeMessagingHosts\\' + hostName;
const manifestPath = join(root, 'native-host.json');
const build = JSON.parse(await readFile(join(product, 'release-build.json'), 'utf8'));
const host = join(product, 'ameow-browser-host.exe');
execFileSync(builder, [host, manifestPath], {windowsHide:true,stdio:['ignore','pipe','pipe']});
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.name=hostName;await writeFile(manifestPath,JSON.stringify(manifest));
assert(!manifest.path.startsWith('\\\\?\\'));
const normal = manifest.path;
const report = {source:build.commit,browser:values.browser,fixtureHost:hostName,registry,extensionBuild:JSON.parse(await readFile(join(product,'browser-extension/build.json'),'utf8')),host_sha256:build.browser.find(x=>x.path==='ameow-browser-host.exe').sha256,normal_path:normal,storeOperation:false,siteAuthorization:false,checks:[]};
if(values.executable){report.browserExecutable=resolve(values.executable);report.browserExecutableSha256=createHash('sha256').update(await readFile(report.browserExecutable)).digest('hex');}
const reg = args => execFileSync('reg.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
let registered = false, browser;
try {
  let existed=false; try { reg(['query',registry]);existed=true; } catch {}
  assert(!existed,'fixture registration already exists');
  reg(['add',registry,'/ve','/t','REG_SZ','/d',manifestPath,'/f']);registered=true;
  const extension=join(product,'browser-extension');
  browser=await chromium.launchPersistentContext(join(root,'profile'),{...(values.executable?{executablePath:resolve(values.executable)}:{channel:'msedge'}),headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--headless=new','--load-extension='+extension,'--disable-extensions-except='+extension,'--no-first-run','--no-default-browser-check']});
  const worker=browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  report.browserVersion=browser.browser().version();
  assert(worker.url().startsWith('chrome-extension://icedkidcbbbijndplfofcbhikohlcool/'));
  const permissions=await worker.evaluate(()=>chrome.permissions.getAll());
  assert.equal(permissions.origins?.length || 0,0);
  report.hostPermissions=[];
  async function ping(){return worker.evaluate(name=>new Promise(resolve=>chrome.runtime.sendNativeMessage(name,{version:1,request_id:'installed-bridge-probe',operation:{operation:'ping'}},reply=>{const error=chrome.runtime.lastError?.message;resolve({ok:!error,communicationError:Boolean(error?.includes('communicating')),reply});})),hostName);}
  const first=await ping();assert(first.ok && first.reply.ok);assert.equal(first.reply.bridge.sha256.toLowerCase(),report.host_sha256.toLowerCase());
  report.checks.push('ordinary product manifest and browser handshake identify the exact release helper');
  if(values.browser==='edge'){
  manifest.path='\\\\?\\'+normal;await writeFile(manifestPath,JSON.stringify(manifest));
  const failed=await ping();assert(!failed.ok && failed.communicationError);
  report.checks.push('same helper with a verbatim path reproduces browser communication failure');
  manifest.path=normal;await writeFile(manifestPath,JSON.stringify(manifest));
  const recovered=await ping();assert(recovered.ok && recovered.reply.ok);
  report.checks.push('normal path restores handshake without a store read or site permission');
  }
  report.result='PASS';
} finally {
  if(browser)await browser.close();
  if(registered){reg(['delete',registry,'/f']);let exists=false;try{reg(['query',registry]);exists=true;}catch{}assert(!exists);report.testRegistrationRemoved=true;}
  await writeFile(join(root,'result.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
