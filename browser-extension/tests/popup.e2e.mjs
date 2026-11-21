import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('dist'), evidence=resolve(process.env.AMEOW_POPUP_EVIDENCE || 'popup-evidence');
await mkdir(evidence,{recursive:true});
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'popup.html'; const data=await readFile(resolve(root,name)); res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(name)] || 'application/octet-stream'});res.end(data)}catch{res.writeHead(404).end()}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({executablePath:process.env.AMEOW_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const row={site:'example.com',source_id:'a'.repeat(32),source_name:'A very long source name / Research browser installation',grant_id:'grant',synced_at:1700000000,last_result:{at:1700000001,error:null},cookie_count:0,skipped_partitioned:2};
const cases=[
{name:'zero-partitioned-zh-light',locale:'zh-CN',theme:'light',value:{sites:[row],source_id:row.source_id,grant:{}}},
{name:'failed-cache-en-dark',locale:'en-US',theme:'dark',value:{sites:[{...row,cookie_count:3,last_result:{at:1700000300,error:'E_COOKIE_READ'}}],source_id:row.source_id,grant:{error:'E_COOKIE_READ'}}},
{name:'unavailable-en',locale:'en-US',theme:'light',value:{sites:[],source_id:row.source_id,grant:{last_sync:1700000000000,source_name:'Edge'},error:'E_BRIDGE'}},
{name:'incomplete-en',locale:'en-US',theme:'light',value:{source_id:row.source_id,grant:{last_sync:1700000000000}}},
{name:'pending-en',locale:'en-US',theme:'light',value:{sites:[],source_id:row.source_id,grant:{pending:true,source_name:'Edge'}}},
{name:'other-source-en',locale:'en-US',theme:'light',value:{sites:[row],source_id:'b'.repeat(32)}},
{name:'zero-unknown-zh',locale:'zh-CN',theme:'light',value:{sites:[{...row,last_result:null}],source_id:row.source_id,grant:{}}},
{name:'unauthorized-zh',locale:'zh-CN',theme:'light',value:{sites:[],source_id:row.source_id}}];
try { for(const scenario of cases){
const context=await browser.newContext({viewport:{width:320,height:700},locale:scenario.locale,colorScheme:scenario.theme});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',req=>errors.push(req.url()+' '+req.failure()?.errorText));page.on('response',res=>{if(res.status()>=400)errors.push(res.url()+' HTTP '+res.status())});
await page.addInitScript(value=>{window.__calls=[];window.chrome={tabs:{query:async()=>[{id:1,url:'https://example.com/path'}]},permissions:{request:async()=>true},runtime:{sendMessage:async msg=>{window.__calls.push(msg);if(window.__failure === msg.action) throw Error('E_BRIDGE');if(msg.action==='status')return {ok:true,value};return {ok:true,value:{'example.com':msg.action==='revoke'?'revoked':'synced'}}}}}},scenario.value);
await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);await page.waitForFunction(()=>document.querySelector('#site').textContent==='example.com');await page.waitForTimeout(100);
assert.deepEqual(errors,[]);assert.equal(await page.locator('.cat').evaluate(e=>getComputedStyle(e).maskImage.includes('ameow-cat.svg')),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
if(scenario.name.startsWith('zero-partitioned')){assert.equal(await page.locator('#status').innerText(),'没有可用 Cookie');assert(await page.locator('#partitioned').isVisible());await page.locator('#details-title').click();assert.equal(await page.locator('#installation-value').innerText(),row.source_id);await page.locator('main').screenshot({path:`${evidence}/zero-initial.png`});await page.locator('#sync').click();await page.locator('#revoke').click();const calls=await page.evaluate(()=>window.__calls);assert(calls.some(x=>x.action==='sync'));assert(calls.some(x=>x.action==='revoke'));await page.evaluate(()=>window.__failure='sync');await page.locator('#sync').click();assert.equal(await page.locator('#connection').innerText(),'连接不可用');assert.match(await page.locator('#status-detail').innerText(),/保留的快照/)}
if(scenario.name.startsWith('failed')){assert.match(await page.locator('#status-detail').innerText(),/Retained snapshot/);await page.locator('#details-title').click();assert.match(await page.locator('#result-value').innerText(),/Could not read/)}
if(scenario.name.startsWith('unavailable')){assert.equal(await page.locator('#connection').innerText(),'Unavailable');assert.equal(await page.locator('#authorize').isVisible(),false);await page.locator('#details-title').click();assert.match(await page.locator('#snapshot-value').innerText(),/2023/)}
if(scenario.name.startsWith('incomplete')) assert.equal(await page.locator('#connection').innerText(),'Connection unknown');
if(scenario.name.startsWith('pending')) { await page.locator('#details-title').click(); assert.equal(await page.locator('#browser-value').innerText(),'Edge'); assert.equal(await page.locator('#installation-value').innerText(),row.source_id); }
if(scenario.name.startsWith('other-source')) { assert(await page.locator('#scope').isVisible()); assert.match(await page.locator('#scope').innerText(),/example.com and its subdomains/); await page.locator('#authorize').click(); const call=(await page.evaluate(()=>window.__calls)).find(x=>x.action==='authorize'); assert.equal(call.replaces,'grant'); }
if(scenario.name.startsWith('zero-unknown')) { assert.equal(await page.locator('#status').innerText(),'没有可用 Cookie'); assert(await page.locator('#partitioned').isVisible()); await page.locator('#details-title').click(); assert.equal(await page.locator('#result-value').innerText(),'未知'); }
if(scenario.name.startsWith('unauthorized')){await page.locator('#authorize').click();assert((await page.evaluate(()=>window.__calls)).some(x=>x.action==='authorize'))}
await page.screenshot({path:`${evidence}/${scenario.name}.png`,clip:{x:0,y:0,width:320,height:Math.min(700,await page.locator('main').evaluate(e=>Math.ceil(e.getBoundingClientRect().height)))}});await context.close();console.log(`PASS ${scenario.name}`)
} } finally {await browser.close();await new Promise(ok=>server.close(ok))}
