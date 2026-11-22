import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';

const root=resolve('dist'), evidence=resolve(process.env.AMEOW_POPUP_EVIDENCE || 'popup-evidence');
await mkdir(evidence,{recursive:true});
const assets=new Set(['popup.html','popup.css','popup.js','ameow-cat.svg']);
const server=createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'popup.html';
  if(!assets.has(name)){res.writeHead(404).end();return;}
  try {const bytes=await readFile(resolve(root,name));res.writeHead(200,{'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[extname(name)]});res.end(bytes);}
  catch {res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.AMEOW_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const row={site:'example.com',source_id:'a'.repeat(32),source_name:'Microsoft Edge',grant_id:'grant',synced_at:1700000000,last_result:{at:1700000001,error:null},cookie_count:3,skipped_partitioned:0};
const own=current=>({sites:[current],source_id:current.source_id,grant:{}});
const cases=[
  {name:'unauthorized-zh',value:{sites:[],source_id:row.source_id}},
  {name:'authorized-zh',value:own(row)},
  {name:'authorized-en-dark',locale:'en-US',theme:'dark',value:own(row)},
  {name:'zero-partitioned-zh',value:own({...row,cookie_count:0,skipped_partitioned:2})},
  {name:'failed-cache-en-dark',locale:'en-US',theme:'dark',value:own({...row,last_result:{at:1700000300,error:'E_COOKIE_READ'}})},
  {name:'unavailable-en',locale:'en-US',value:{sites:[],source_id:row.source_id,grant:{last_sync:1700000000000,source_name:'Microsoft Edge'},error:'E_BRIDGE'}},
  {name:'incomplete-en',locale:'en-US',value:{source_id:row.source_id}},
  {name:'null-status-en',locale:'en-US',value:null},
  {name:'pending-en',locale:'en-US',value:{sites:[],source_id:row.source_id,grant:{pending:true}}},
  {name:'initial-error-zh',value:{sites:[],source_id:row.source_id,grant:{pending:true,error:'E_BRIDGE'}}},
  {name:'authorization-revoked-zh',revoked:true,value:{sites:[],source_id:row.source_id}},
  {name:'other-source-en',locale:'en-US',value:{sites:[row],source_id:'b'.repeat(32)}},
  {name:'unknown-result-zh',value:own({...row,last_result:null})},
  {name:'long-source-zh',theme:'dark',url:'https://this-is-an-unusually-long-website-name-which-must-stay-readable.example/path',value:own({...row,site:'this-is-an-unusually-long-website-name-which-must-stay-readable.example',source_id:'bad identity token:SECRET',source_name:'private-account@example.com https://private.test/secret',extra:'private_cookie_value'})},
  {name:'tools-on-zh',url:'https://www.bilibili.com/video/BVtest',tools:true,delay:true,value:own({...row,site:'bilibili.com'})},
  {name:'tools-off-en-dark',locale:'en-US',theme:'dark',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',tools:false,delay:true,value:{sites:[],source_id:row.source_id}},
  {name:'tools-status-failed-zh',url:'https://www.bilibili.com/video/BVtest',toolsFailure:true,delay:true,value:{sites:[],source_id:row.source_id}},
  {name:'status-rejected-zh',url:'https://www.bilibili.com/video/BVtest',statusFailure:true,tools:true,delay:true,value:null},
  {name:'restricted-en',locale:'en-US',url:'chrome://newtab/',value:null},
];
const report={build:JSON.parse(await readFile(resolve(root,'build.json'))),cases:[]};
try {for(const scenario of cases){
  const context=await browser.newContext({viewport:{width:240,height:650},locale:scenario.locale||'zh-CN',colorScheme:scenario.theme||'light'});
  const page=await context.newPage(), errors=[], requests=[];
  await context.route('**/*',route=>{requests.push(route.request().url());return new URL(route.request().url()).origin===origin?route.continue():route.abort();});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
  await page.addInitScript(scenario=>{
    let value=scenario.value,tools=Boolean(scenario.tools);
    const domain=new URL(scenario.url||'https://example.com/path').hostname.replace(/^www\./,'');
    const sourceId=value?.source_id||'a'.repeat(32), pause=ms=>new Promise(done=>setTimeout(done,ms));
    window.__calls=[];window.__copy=[];window.__paints=[];window.__statusDone=false;window.__toolsDone=!scenario.url?.includes('www.');
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.__copyFailure)throw Error('clipboard denied');window.__copy.push(text);}}});
    window.chrome={
      tabs:{query:async()=>{if(scenario.delay)await pause(70);return[{id:1,url:scenario.url||'https://example.com/path'}];}},
      permissions:{request:async permission=>{window.__calls.push({permission});return true;}},
      runtime:{sendMessage:async message=>{
        window.__calls.push(message);
        if(window.__failure===message.action)throw Error('E_BRIDGE');
        if(message.action==='pages-status'){
          if(scenario.delay)await pause(170);window.__toolsDone=true;
          if(scenario.toolsFailure)throw Error('E_BRIDGE');
          return {ok:true,value:{enabled:tools}};
        }
        if(message.action==='status'){
          if(scenario.delay&&!window.__statusDone)await pause(340);window.__statusDone=true;
          if(scenario.statusFailure)throw Error('E_BRIDGE');
          return {ok:true,value};
        }
        if(message.action==='pages-set'){tools=message.enabled;return{ok:true,value:{enabled:tools}};}
        if(['authorize','sync','revoke'].includes(message.action)){
          if(scenario.revoked)return {ok:true,value:{[domain]:'revoked'}};
          value=message.action==='revoke'?{sites:[],source_id:sourceId}:{sites:[{site:domain,source_id:sourceId,source_name:'Microsoft Edge',grant_id:'new-grant',synced_at:1700000400,cookie_count:3,skipped_partitioned:0,last_result:{at:1700000400,error:null}}],source_id:sourceId,grant:{}};
          return {ok:true,value:{[domain]:message.action==='revoke'?'revoked':'synced'}};
        }
        throw Error('Unexpected Popup action');
      }},
    };
    function sample(){
      const main=document.querySelector('main'),track=document.querySelector('.toggle span');
      if(main&&track&&getComputedStyle(main).visibility==='visible'){
        const action=[...document.querySelectorAll('.actions button')].find(node=>!node.hidden);
        window.__paints.push({done:window.__statusDone&&window.__toolsDone,site:document.querySelector('#site').textContent,connection:document.querySelector('#connection').textContent,
          action:action?.id||null,tools:document.querySelector('#toggle-tools').getAttribute('aria-pressed'),thumb:getComputedStyle(track,'::after').transform,height:main.getBoundingClientRect().height});
      }
      if(!window.__stopPaints)requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  },scenario);
  await page.goto(origin+'/popup.html');
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('data-initializing'));
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const paints=await page.evaluate(()=>{window.__stopPaints=true;return window.__paints;});
  assert(paints.length>0,'Popup never revealed');
  if(!scenario.name.startsWith('restricted'))assert(paints.every(frame=>frame.done),'provisional startup information was visible');
  assert.equal(new Set(paints.map(frame=>JSON.stringify(frame))).size,1,'first-open UI changed after becoming visible');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),240);
  assert.equal(await page.locator('.actions button:visible').count(),scenario.name.startsWith('restricted')?0:1);
  assert.equal(await page.locator('pre,details,#diagnostic-report,#scope,#replace-copy').count(),0);
  const startupCalls=await page.evaluate(()=>window.__calls);
  assert(startupCalls.every(call=>['status','pages-status'].includes(call.action)),'open changed authorization or preference');
  if(scenario.tools&&!scenario.statusFailure)assert.equal(paints[0].thumb,'matrix(1, 0, 0, 1, 16, 0)');
  await page.locator('main').screenshot({path:resolve(evidence,scenario.name+'.png')});
  await page.locator('#copy-diagnostic').click();
  const diagnostic=await page.evaluate(()=>window.__copy.at(-1));
  assert.equal(await page.locator('#copy-diagnostic').getAttribute('data-copied'),'');
  assert(!/private-account|private\.test|SECRET|private_cookie_value/.test(diagnostic));
  if(scenario.name.startsWith('zero')){
    assert.match(diagnostic,/Cookie: 0/);assert.match(diagnostic,/分区 Cookie 已排除: 2/);
    await page.evaluate(()=>window.__copyFailure=true);await page.locator('#copy-diagnostic').click();
    assert.equal(await page.locator('#copy-diagnostic').getAttribute('data-copied'),null);assert(await page.locator('#copy-error').isVisible());
    await page.evaluate(()=>window.__copyFailure=false);await page.locator('#copy-diagnostic').click();assert.equal(await page.locator('#copy-error').isVisible(),false);
  }
  if(scenario.name.startsWith('other-source')){
    assert(!/browser replaces|Use this browser|Using this browser/.test(await page.locator('main').innerText()));
    await page.locator('#authorize').click();await page.locator('#sync').waitFor();
    const authorize=await page.evaluate(()=>window.__calls.find(call=>call.action==='authorize'));
    assert.equal(authorize.replaces,'grant');assert.equal(authorize.source_name,await page.evaluate(()=>navigator.userAgent.includes('Edg/')?'Microsoft Edge':'Chrome / Chromium'));
  }
  if(scenario.name==='unauthorized-zh'){
    await page.locator('#authorize').click();await page.locator('#sync').waitFor();
    await page.waitForFunction(()=>document.querySelector('#sync .label-default').textContent==='已同步');
    const calls=await page.evaluate(()=>window.__calls);
    assert.equal(calls.filter(call=>call.action==='authorize').length,1);
    assert(!calls.some(call=>call.permission),'the worker owns the session permission request');
    await page.locator('#sync').click();await page.locator('#site-actions').click();await page.locator('#revoke').click();await page.locator('#authorize').waitFor();
    assert(await page.locator('#authorize').evaluate(node=>node===document.activeElement));
  }
  if(scenario.name.startsWith('failed')){
    assert.match(diagnostic,/Could not read browser cookies/);await page.locator('#notice').click();assert(await page.locator('#session-help').isVisible());
    await page.keyboard.press('Escape');await page.locator('#sync').click();assert.equal(await page.locator('#notice').isVisible(),false);
    await page.evaluate(()=>window.__failure='sync');await page.locator('#sync').click();
    assert.equal(await page.locator('#connection').getAttribute('aria-label'),'Extension connection unavailable');
  }
  if(scenario.name.startsWith('long')){
    const before=await page.locator('#copy-diagnostic').boundingBox();await page.locator('#connection').focus();await page.keyboard.press('Tab');
    assert(await page.locator('#site-full').isVisible());assert.equal((await page.locator('#copy-diagnostic').boundingBox()).y,before.y);
    await page.locator('#copy-diagnostic').click();assert.equal(await page.locator('#site-full').isVisible(),false);
  }
  if(scenario.name==='tools-on-zh'){
    await page.locator('#toggle-tools').click();assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'),'false');
    assert(!(await page.evaluate(()=>window.__calls)).some(call=>['authorize','sync','revoke'].includes(call.action)));
  }
  if(scenario.toolsFailure){assert(await page.locator('#toggle-tools').isDisabled());assert.match(await page.locator('#page-status').innerText(),/页面工具状态不可用/);assert(await page.locator('#authorize').isEnabled());}
  if(scenario.name.startsWith('pending'))assert(await page.locator('#sync').isDisabled());
  if(scenario.name==='initial-error-zh'){
    assert(await page.locator('#sync').isEnabled());
    assert(await page.locator('#revoke').isEnabled());
    assert.match(await page.locator('#status-detail').innerText(),/检查扩展配置/);
    await page.locator('#sync').click();
    await page.waitForFunction(()=>window.__calls.filter(call=>call.action==='status').length===2);
    assert((await page.evaluate(()=>window.__calls)).some(call=>call.action==='sync'));
  }
  if(scenario.name==='authorization-revoked-zh'){
    await page.locator('#authorize').click();
    await page.waitForFunction(()=>document.querySelector('#notice').hasAttribute('data-error'));
    assert(!/登录态已同步/.test(await page.locator('#announcement').innerText()));
    assert.match(await page.locator('#status-detail').innerText(),/授权已变更/);
    assert(await page.locator('#authorize').isEnabled());
  }
  if(scenario.name.startsWith('restricted'))assert.equal(await page.locator('#page-unavailable').innerText(),'Open a website');
  assert.deepEqual(errors,[]);assert(requests.every(url=>new URL(url).origin===origin));
  report.cases.push({name:scenario.name,firstPaint:paints[0],paintedFrames:paints.length,visibleStates:1,startupCalls:startupCalls.map(call=>call.action)});
  console.log('PASS '+scenario.name);await context.close();
}} finally {await browser.close();await new Promise(done=>server.close(done));await writeFile(resolve(evidence,'report.json'),JSON.stringify(report,null,2));}
