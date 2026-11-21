import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root=resolve('dist'), evidence=resolve(process.env.AMEOW_POPUP_EVIDENCE || 'popup-evidence');
await mkdir(evidence,{recursive:true});
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'popup.html';const data=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(name)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404).end()}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({executablePath:process.env.AMEOW_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const row={site:'example.com',source_id:'a'.repeat(32),source_name:'Microsoft Edge',grant_id:'grant',synced_at:1700000000,last_result:{at:1700000001,error:null},cookie_count:0,skipped_partitioned:2};
const cases=[
{name:'ready-offline-en',locale:'en-US',theme:'light',value:{sites:[],source_id:row.source_id}},
{name:'ready-offline-zh',locale:'zh-CN',theme:'dark',value:{sites:[],source_id:row.source_id}},
{name:'zero-partitioned-zh-light',locale:'zh-CN',theme:'light',value:{sites:[row],source_id:row.source_id,grant:{}}},
{name:'failed-cache-en-dark',locale:'en-US',theme:'dark',value:{sites:[{...row,cookie_count:3,last_result:{at:1700000300,error:'E_COOKIE_READ'}}],source_id:row.source_id,grant:{error:'E_COOKIE_READ'}}},
{name:'unavailable-en',locale:'en-US',theme:'light',value:{sites:[],source_id:row.source_id,grant:{last_sync:1700000000000,source_name:'Microsoft Edge'},error:'E_BRIDGE'}},
{name:'incomplete-en',locale:'en-US',theme:'light',value:{source_id:row.source_id,grant:{last_sync:1700000000000}}},
{name:'pending-en',locale:'en-US',theme:'light',value:{sites:[],source_id:row.source_id,grant:{pending:true,source_name:'Microsoft Edge'}}},
{name:'other-source-en',locale:'en-US',theme:'light',value:{sites:[row],source_id:'b'.repeat(32)}},
{name:'zero-unknown-zh',locale:'zh-CN',theme:'light',value:{sites:[{...row,last_result:null}],source_id:row.source_id,grant:{}}},
{name:'unauthorized-zh',locale:'zh-CN',theme:'light',value:{sites:[],source_id:row.source_id}},
{name:'long-source-zh',locale:'zh-CN',theme:'dark',url:'https://this-is-an-unusually-long-website-name-which-must-stay-readable.example/path',value:{sites:[{...row,site:'this-is-an-unusually-long-website-name-which-must-stay-readable.example',source_name:'private-account@example.com https://private.test/secret',source_id:'bad identity token:SECRET',extra:'private_cookie_value'}],source_id:'bad identity token:SECRET',grant:{}}},
{name:'null-status-en',locale:'en-US',theme:'dark',value:null},
{name:'page-tools-zh',locale:'zh-CN',theme:'light',url:'https://www.bilibili.com/video/BVtest',value:{sites:[],source_id:row.source_id}}];
try { for(const scenario of cases){
 const context=await browser.newContext({viewport:{width:320,height:700},locale:scenario.locale,colorScheme:scenario.theme});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',req=>errors.push(req.url()+' '+req.failure()?.errorText));page.on('response',res=>{if(res.status()>=400)errors.push(res.url()+' HTTP '+res.status())});
 await page.addInitScript(({value,url})=>{window.__calls=[];window.__copy=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.__copyFailure)throw Error('clipboard failure');window.__copy.push(text)}}});window.chrome={tabs:{query:async()=>[{id:1,url:url||'https://example.com/path'}]},permissions:{request:async request=>{window.__calls.push({permission:request});return true}},runtime:{sendMessage:async msg=>{window.__calls.push(msg);if(window.__failure===msg.action)throw Error('E_BRIDGE');if(msg.action==='status')return {ok:true,value};if(msg.action==='pages-status')return {ok:true,value:{enabled:false}};if(msg.action==='pages-set')return {ok:true,value:{enabled:msg.enabled}};return {ok:true,value:{'example.com':msg.action==='revoke'?'revoked':'synced'}}}}}},{value:scenario.value,url:scenario.url});
 await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);await page.waitForFunction(()=>document.querySelector('#site').textContent.length>0);await page.waitForTimeout(100);
 assert.deepEqual(errors,[]);assert.equal(await page.locator('.cat').evaluate(e=>getComputedStyle(e).maskImage.includes('ameow-cat.svg')),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
 const header=await page.locator('header').evaluate(e=>{const brand=e.querySelector('h1').getBoundingClientRect(),state=e.querySelector('#connection').getBoundingClientRect();return {brandRight:brand.right,stateLeft:state.left,stateRight:state.right}});assert(header.brandRight+4<=header.stateLeft);assert(header.stateRight<=300);
 assert.equal(await page.locator('#diagnostics').evaluate(e=>e.open),false);
 const visible=await page.locator('main').innerText();assert(!/分区|partitioned|安装来源|installation|快照|snapshot|Cookie:\s*\d|2023|aaaaaaaa/.test(visible));
 await page.locator('main').screenshot({path:`${evidence}/${scenario.name}-default.png`});
 if(scenario.name.startsWith('zero'))assert.equal(await page.locator('#status').innerText(),'没有可用会话');
 if(scenario.name.startsWith('failed')){assert.equal(await page.locator('#status').innerText(),'Sync did not complete');assert.equal(await page.locator('#unauthorized').isVisible(),false);}
 if(scenario.name.startsWith('ready-offline')){assert.equal(await page.locator('#connection').innerText(),scenario.locale==='en-US'?'Extension connection ready':'扩展连接就绪');assert.deepEqual((await page.evaluate(()=>window.__calls)).map(x=>x.action),['status']);await page.locator('#diagnostics-title').click();assert.match(await page.locator('#diagnostic-report').innerText(),scenario.locale==='en-US'?/Extension connection: Ready/:/扩展连接: 就绪/);}
 if(scenario.name.startsWith('unavailable')){assert.equal(await page.locator('#connection').innerText(),'Extension connection unavailable');assert.equal(await page.locator('#authorize').isVisible(),false);}
 if(scenario.name.startsWith('incomplete')||scenario.name.startsWith('null-status')){assert.equal(await page.locator('#connection').innerText(),'Extension connection unknown');if(scenario.value===null){assert(await page.locator('#retry-status').isVisible());await page.locator('#retry-status').click();assert.equal((await page.evaluate(()=>window.__calls)).filter(x=>x.action==='status').length,2);}}
 if(scenario.name.startsWith('other-source')){assert(await page.locator('#scope').isVisible());assert.match(await page.locator('#scope').innerText(),/example.com and its subdomains/);await page.locator('#authorize').click();const calls=await page.evaluate(()=>window.__calls);assert.equal(calls.find(x=>x.action==='authorize').replaces,'grant');assert(calls.find(x=>x.permission)?.permission.origins.length);}
 if(scenario.name.startsWith('unauthorized')){assert(await page.locator('#scope').isVisible());await page.locator('#authorize').click();assert((await page.evaluate(()=>window.__calls)).some(x=>x.action==='authorize'));}
 if(scenario.name.startsWith('zero-partitioned')){
   await page.locator('#diagnostics-title').click();let report=await page.locator('#diagnostic-report').innerText();assert.match(report,/分区 Cookie 已排除: 2/);assert.match(report,new RegExp(row.source_id));assert.match(report,/2023/);
   await page.locator('#copy-diagnostic').click();assert.equal(await page.locator('#copy-diagnostic').innerText(),'已复制');assert.deepEqual(await page.evaluate(()=>window.__copy),[report]);
   await page.evaluate(()=>window.__copyFailure=true);await page.locator('#copy-diagnostic').click();assert(await page.locator('#copy-error').isVisible());assert.equal(await page.locator('#copy-diagnostic').innerText(),'复制诊断报告');
   await page.evaluate(()=>window.__copyFailure=false);await page.locator('#copy-diagnostic').click();assert.equal(await page.locator('#copy-diagnostic').innerText(),'已复制');
   await page.locator('#sync').click();await page.locator('#revoke').click();const calls=await page.evaluate(()=>window.__calls);assert(calls.some(x=>x.action==='sync'));assert(calls.some(x=>x.action==='revoke'));
   await page.evaluate(()=>window.__failure='sync');await page.locator('#sync').click();assert.equal(await page.locator('#connection').innerText(),'扩展连接不可用');report=await page.locator('#diagnostic-report').innerText();assert.match(report,/保留的快照/);
   await page.locator('main').screenshot({path:`${evidence}/diagnostics-open.png`});
 }
 if(scenario.name.startsWith('failed')){await page.locator('#diagnostics-title').click();const report=await page.locator('#diagnostic-report').innerText();assert.match(report,/Retained snapshot/);assert.match(report,/Could not read/);}
 if(scenario.name.startsWith('page-tools')){assert(await page.locator('#page-tools').isVisible());await page.locator('#toggle-tools').click();assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'),'true');const calls=await page.evaluate(()=>window.__calls);assert(calls.some(x=>x.action==='pages-set'&&x.enabled));assert(!calls.some(x=>x.action==='authorize'));}
 if(scenario.name.startsWith('long-source')){assert.equal(await page.locator('#site').getAttribute('title'),'this-is-an-unusually-long-website-name-which-must-stay-readable.example');assert(await page.locator('#site').evaluate(e=>e.scrollWidth>e.clientWidth));await page.locator('#diagnostics-title').click();const report=await page.locator('#diagnostic-report').innerText();assert(!/private-account|private.test|SECRET|private_cookie_value/.test(report));}
 await context.close();console.log(`PASS ${scenario.name}`);
} } finally {await browser.close();await new Promise(ok=>server.close(ok))}
