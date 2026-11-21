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
import { parseArgs } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
const project = fileURLToPath(new URL('../../', import.meta.url));
const {positionals,values}=parseArgs({allowPositionals:true,options:{browser:{type:'string',default:'edge'},executable:{type:'string'},product:{type:'string'},'fixture-host':{type:'string'},'sync-status-only':{type:'boolean'},'source-isolation':{type:'boolean'},'source-isolation-only':{type:'boolean'}}});
assert.equal(positionals.length,1,'one fresh absolute fixture root is required');
assert(['edge','chrome-for-testing'].includes(values.browser));
assert(values.browser==='edge' || values.executable,'Chrome for Testing requires an explicit executable');
const directory = resolve(positionals[0]);
const syncStatusOnly = Boolean(values['sync-status-only']);
const instance = join(directory, 'desktop');
const extensionId = 'icedkidcbbbijndplfofcbhikohlcool';
const hostName=values['fixture-host'] || 'org.ameow.browser_sessions.fixture.'+values.browser.replaceAll('-','_')+'.'+randomUUID().replaceAll('-','');
assert(hostName.startsWith('org.ameow.browser_sessions.fixture.') && /^[a-z0-9_.]+$/.test(hostName));
const registry = 'HKCU\\Software\\'+(values.browser==='edge'?'Microsoft\\Edge':'Google\\Chrome')+'\\NativeMessagingHosts\\' + hostName;
const product=values.product ? resolve(values.product) : null;
const native = product ? join(product,'ameow-browser-host.exe') : join(project, 'target/debug/ameow-browser-host.exe');
const cli = product ? join(product,'ameow-cli.exe') : join(project, 'target/debug/ameow-cli.exe');
const app = product ? join(product,'Ameow.exe') : join(project, 'target/debug/ameow.exe');
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
await cp(product?join(product,'browser-extension'):join(project, 'browser-extension/dist'), extension, { recursive: true });
const background = await readFile(join(extension, 'background.js'), 'utf8');
await writeFile(join(extension, 'background.js'), background.replaceAll('org.ameow.browser_sessions', hostName));
const manifest = join(directory, 'native-host.json');
let hostPath=native;
if(product){
  // Browser manifests cannot carry args. This owned wrapper selects only the fixture instance.
  hostPath=join(directory,'isolated-native.cmd');
  const fixtureNative=join(directory,'product-native.exe');
  await cp(native,fixtureNative); // Preserve the release bytes; avoid cmd.exe code-page changes to a Unicode path.
  assert(![fixtureNative,instance].some(p=>/[^ -~]|["%]/.test(p)),'release fixture wrapper requires an ASCII path without cmd expansion');
  await writeFile(hostPath,'@echo off\r\n"'+fixtureNative+'" %* --instance-root "'+instance+'"\r\n');
}
await writeFile(manifest, JSON.stringify({ name: hostName, description: 'Isolated Ameow synthetic fixture', path: hostPath, type: 'stdio', allowed_origins: ['chrome-extension://' + extensionId + '/'] }));
let registered = false, context, otherContext, desktop;
const evidence = { fixture: true,browser:values.browser,fixtureHost:hostName,registry, realMembership: 'NOT TESTED', permissionConsent: 'seeded through the task profile extension manager', checks: [] };
evidence.binarySha256={};for(const [label,path] of Object.entries({app,cli,native})){evidence.binarySha256[label]=createHash('sha256').update(await readFile(path)).digest('hex');}
if(product)evidence.productBuild=JSON.parse(await readFile(join(product,'release-build.json'),'utf8')).commit;
if(product){evidence.isolation='owned ASCII cmd wrapper passes --instance-root to an exact copy of the release helper';evidence.fixtureNativeSha256=createHash('sha256').update(await readFile(join(directory,'product-native.exe'))).digest('hex');assert.equal(evidence.fixtureNativeSha256,evidence.binarySha256.native);}
evidence.extensionBuild=JSON.parse(await readFile(join(extension,'build.json'),'utf8'));
if(values.executable){evidence.browserExecutable=resolve(values.executable);evidence.browserExecutableSha256=createHash('sha256').update(await readFile(evidence.browserExecutable)).digest('hex');}
function reg(args) { return execFileSync('reg.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
function desktopSessions() {
  try { return JSON.parse(execFileSync(cli, ['--json','--no-start', '--instance-root', instance, 'sessions'], { windowsHide: true, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })).result; }
  catch { return undefined; }
}
function snapshot(stage) {
  execFileSync('cargo', ['test', '--locked', '--lib', 'browser_sessions::tests::native_browser_fixture_snapshot', '--', '--ignored', '--exact'], {
    cwd: project, windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AMEOW_BROWSER_E2E_INSTANCE: instance, AMEOW_BROWSER_E2E_STAGE: stage },
  });
  evidence.checks.push('native CookieJar snapshot: ' + stage);
}
async function launch(profile='profile') {
  return chromium.launchPersistentContext(join(directory, profile), {
    ...(values.executable?{executablePath:resolve(values.executable)}:{channel:'msedge'}), headless: true,ignoreDefaultArgs:['--disable-extensions'],
    args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'],
    env: { ...process.env, AMEOW_BROWSER_TEST_INSTANCE: instance },
  });
}
async function popup(browserContext=context) {
  const page = await browserContext.newPage(); await page.setViewportSize({ width: 320, height: 430 });
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
  const manager = await context.newPage(); await manager.goto(values.browser==='edge'?'edge://extensions/':'chrome://extensions/');
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
  assert.equal(desktopSessions().sites[0].source_name,values.browser==='edge'?'Microsoft Edge':'Chrome / Chromium');
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
  } else if(!values['source-isolation-only']) {
  const first = desktopSessions().sites[0].synced_at; await pause(1100);
  await context.addCookies([{ name: 'ameow_synthetic', value: 'AMEOW_SYNTHETIC_V2', domain: '.example.com', path: '/', httpOnly: true, secure: true, expires: Date.now() / 1000 + 86400 }]);
  await until(() => desktopSessions()?.sites?.[0]?.synced_at > first, 'Cookie change auto-sync'); snapshot('v2');
  const beforeRestart = desktopSessions().sites[0].synced_at; await pause(1100);
  await context.close(); context = await launch();
  await until(() => desktopSessions()?.sites?.[0]?.synced_at > beforeRestart, 'browser restart resynchronization'); snapshot('v2');
  await context.clearCookies({ name: 'ameow_synthetic', domain: '.example.com' });
  await until(() => desktopSessions()?.sites?.[0]?.cookie_count === 0, 'deleted Cookie auto-sync'); snapshot('empty');
  }
  if(values['source-isolation'] || values['source-isolation-only']){
    const original=desktopSessions().sites[0].source_id;
    const originalPage=await popup();
    otherContext=await launch('profile-other');
    const manager=await otherContext.newPage();await manager.goto(values.browser==='edge'?'edge://extensions/':'chrome://extensions/');
    await manager.evaluate(async id=>{await chrome.developerPrivate.addHostPermission(id,'https://*.example.com/*');await chrome.developerPrivate.addHostPermission(id,'http://*.example.com/*');},extensionId);await manager.close();
    await otherContext.addCookies([{name:'ameow_synthetic',value:'AMEOW_SYNTHETIC_V1',domain:'.example.com',path:'/',httpOnly:true,secure:true,expires:Date.now()/1000+86400}]);
    const otherPage=await popup(otherContext);
    const local=await otherPage.evaluate(()=>chrome.storage.local.get('source_id'));assert.notEqual(local.source_id,original);
    assert.equal(desktopSessions().sites[0].source_id,original,'a fresh profile does not silently replace the source');
    await otherPage.getByRole('button',{name:'改用此浏览器',exact:true}).click();
    await until(()=>otherPage.locator('#authorize').isEnabled(),'replacement handler finishes');
    evidence.sourceReplacementStatus=await otherPage.locator('#status').textContent();
    evidence.sourceReplacementState=await otherPage.evaluate(async()=>{const s=await chrome.storage.local.get('grants');const g=s.grants?.['example.com'];return {localGrantPresent:Boolean(g),error:g?.error||null,pending:g?.pending||false};});
    const afterLocal=await otherPage.evaluate(()=>chrome.storage.local.get('source_id'));
    const observed=desktopSessions().sites[0].source_id;
    evidence.sourceIdentityCheck={initialLocalIsString:typeof local.source_id==='string',originalIsString:typeof original==='string',localPersisted:local.source_id===afterLocal.source_id,desktopStillOriginal:observed===original,desktopMatchesCurrentLocal:observed===afterLocal.source_id};
    await until(()=>desktopSessions()?.sites?.[0]?.source_id===local.source_id,'explicit source replacement');snapshot('v1');
    page=originalPage;await page.getByRole('button',{name:'立即同步',exact:true}).click();
    await until(()=>page.evaluate(()=>chrome.permissions.contains({origins:['https://*.example.com/*']})).then(granted=>!granted),'old profile loses revoked authorization');
    assert.equal(desktopSessions().sites[0].source_id,local.source_id);snapshot('v1');
    evidence.checks.push('independent profile source requires explicit replacement; old source cannot overwrite and loses its grant');
    page=otherPage;
  }else{page=await popup();}
  await page.getByRole('button', { name: '移除', exact: true }).click();
  await until(() => desktopSessions()?.sites?.length === 0, 'permission revocation reaches desktop'); snapshot('revoked');
  assert.equal(await page.evaluate(() => chrome.permissions.contains({ origins: ['https://*.example.com/*'] })), false);
  evidence.checks.push('browser permission removed and desktop cache revoked');
  evidence.result = 'PASS';
} catch (error) { evidence.result = 'FAIL'; evidence.error = String(error); throw error; }
finally {
  if(otherContext)await otherContext.close();
  if (context) await context.close();
  if (desktop) desktop.kill(); // Owned fixture only; this is not shutdown-settlement evidence.
  if (registered){reg(['delete', registry, '/f']);let exists=false;try{reg(['query',registry]);exists=true;}catch{}assert(!exists);evidence.testRegistrationRemoved=true;}
  await writeFile(join(directory, 'result.json'), JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence, null, 2));
