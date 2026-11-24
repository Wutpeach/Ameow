import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright-core';

const root = resolve('dist');
const evidence = resolve(process.env.AMEOW_POPUP_EVIDENCE || 'popup-evidence');
await mkdir(evidence, {recursive:true});
const assets = new Set(['popup.html','popup.css','popup.js','ameow-cat.svg']);
const server = createServer(async (request,response) => {
  const name = new URL(request.url,'http://localhost').pathname.slice(1) || 'popup.html';
  if (!assets.has(name)) return response.writeHead(404).end();
  try { response.writeHead(200, {'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[extname(name)]}); response.end(await readFile(resolve(root,name))); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({executablePath:process.env.AMEOW_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const report = [];
async function open(scenario) {
  const context = await browser.newContext({viewport:{width:240,height:400},locale:'zh-CN',colorScheme:'light'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(scenario => {
    const calls = window.__calls = [];
    let tabCount = 0, statusCount = 0, toolsCount = 0;
    const source_id = 'a'.repeat(32);
    const hold = key => new Promise(resolve => { window[key] = resolve; });
    const storageListeners = [];
    window.__notifyGrants = () => storageListeners.forEach(listener => listener({grants:{}},'local'));
    window.chrome = {
      storage:{onChanged:{addListener(listener){storageListeners.push(listener);}}},
      tabs:{query:async () => { calls.push('tabs'); if (scenario === 'tab' && !tabCount++) return hold('__oldTab'); return [{id:1,url:'https://www.bilibili.com/video/BVtest'}]; }},
      permissions:{request:async () => true},
      runtime:{sendMessage:async message => {
        calls.push(message.action);
        if (message.action === 'pages-status') {
          if (scenario === 'tools' && !toolsCount++) return hold('__oldTools');
          return {ok:true,value:{enabled:true}};
        }
        if (message.action === 'pages-set') return {ok:true,value:{enabled:message.enabled}};
        if (message.action === 'status') {
          if (scenario === 'session' && !statusCount++) return hold('__oldSession');
          if (scenario === 'pending-grant') return {ok:true,value:{sites:[],source_id,grant:{pending:!window.__grantDone,error:window.__grantFailure}}};
          if (scenario === 'superseded-error' && !statusCount++) return new Promise((_,reject) => {window.__rejectOld = reject;});
          return {ok:true,value:{sites:[],source_id}};
        }
        throw Error('unexpected message ' + message.action);
      }},
    };
  },scenario);
  await page.goto(origin+'/popup.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-initializing'));
  return {context,page,errors};
}
try {
  for (const failure of [false,true]) {
    const {context,page,errors} = await open('pending-grant');
    await page.waitForFunction(() => document.querySelector('#sync').getAttribute('aria-busy') === 'true');
    assert(await page.locator('#sync').isDisabled());
    await page.evaluate(failure => { window.__grantDone=true; window.__grantFailure=failure?'E_COOKIE_READ':undefined; window.__notifyGrants(); },failure);
    await page.waitForFunction(() => !document.querySelector('#sync').disabled);
    assert.equal(await page.locator('#notice').getAttribute('data-error') !== null,failure);
    assert.deepEqual(errors,[]);
    report.push({scenario:'pending authorization converges after storage change',failure,result:'PASS'});
    await context.close();
  }
  {
    const {context,page,errors} = await open('pending-grant');
    await page.locator('#retry-status').waitFor({state:'visible',timeout:7000});
    assert(await page.locator('#sync').isHidden());
    assert(await page.locator('#retry-status').isEnabled());
    assert.deepEqual(errors,[]); await context.close();
    report.push({scenario:'persisted pending grant exposes bounded recovery',result:'PASS'});
  }
  {
    const {context,page,errors} = await open('superseded-error');
    await page.waitForFunction(() => typeof window.__rejectOld === 'function');
    await page.evaluate(() => window.__notifyGrants());
    await page.locator('#authorize').waitFor({state:'visible'});
    await page.evaluate(() => window.__rejectOld(Error('late old failure')));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#connection').innerText(),'就绪');
    assert.deepEqual(errors,[]); await context.close();
    report.push({scenario:'superseded rejection cannot overwrite fresh status',result:'PASS'});
  }
  {
    const {context,page,errors} = await open('session');
    assert.equal(await page.locator('#session-loading').innerText(),'读取中');
    assert(await page.locator('#authorize').isHidden());
    await page.locator('#toggle-tools').waitFor({state:'visible'});
    assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'),'true');
    await page.locator('main').screenshot({path:resolve(evidence,'loading-session.png')});
    await page.locator('#toggle-tools').focus(); await page.locator('#toggle-tools').press('Space');
    assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'),'false');
    await page.locator('#retry-status').waitFor({state:'visible',timeout:7000});
    await page.locator('#retry-status').focus(); await page.locator('#retry-status').press('Enter');
    await page.locator('#authorize').waitFor({state:'visible'});
    await page.evaluate(() => window.__oldSession({ok:true,value:{sites:[],source_id:'a'.repeat(32),error:'E_BRIDGE'}}));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#connection').innerText(),'就绪');
    assert(await page.locator('#authorize').isEnabled());
    assert.deepEqual(errors,[]);
    report.push({scenario:'session timeout, independent tools, keyboard retry, stale reply',calls:await page.evaluate(()=>__calls)});
    await context.close();
    const reopened = await open('normal');
    await reopened.page.locator('#authorize').waitFor({state:'visible'});
    assert.equal(await reopened.page.locator('#connection').innerText(),'就绪');
    assert.deepEqual(reopened.errors,[]); await reopened.context.close();
    report.push({scenario:'close and reopen',result:'PASS'});
  }
  {
    const {context,page,errors} = await open('tools');
    await page.locator('#authorize').waitFor({state:'visible'});
    assert(await page.locator('#toggle-tools').isHidden());
    assert.equal(await page.locator('#tools-loading').innerText(),'读取中');
    await page.locator('#retry-tools').waitFor({state:'visible',timeout:7000});
    await page.locator('#retry-tools').click();
    await page.locator('#toggle-tools').waitFor({state:'visible'});
    await page.evaluate(() => window.__oldTools({ok:true,value:{enabled:false}}));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'),'true');
    assert(await page.locator('#authorize').isEnabled());
    assert.deepEqual(errors,[]);
    report.push({scenario:'tools timeout, independent session, retry, stale reply',calls:await page.evaluate(()=>__calls)});
    await context.close();
  }
  {
    const {context,page,errors} = await open('tab');
    assert.equal(await page.locator('#site').innerText(),'正在读取页面');
    await page.locator('#retry-status').waitFor({state:'visible',timeout:7000});
    await page.locator('#retry-status').click();
    await page.locator('#authorize').waitFor({state:'visible'});
    await page.evaluate(() => window.__oldTab([{id:2,url:'https://www.youtube.com/'}]));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#site').innerText(),'bilibili.com');
    assert.deepEqual(errors,[]);
    report.push({scenario:'tab timeout and retry, stale reply',calls:await page.evaluate(()=>__calls)});
    await context.close();
  }
  await writeFile(resolve(evidence,'loading-report.json'),JSON.stringify(report,null,2));
  console.log('PASS Popup loading: independent state, bounded retry, late replies, keyboard and reopen.');
} finally {await browser.close();await new Promise(done => server.close(done));}
