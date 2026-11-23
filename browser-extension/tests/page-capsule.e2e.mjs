// Owned headless browser; intercepted player DOM and mocked media/binding/ACK, no native host/account.
// After extension build: node browser-extension/tests/page-capsule.e2e.mjs <new-evidence-dir>
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';
const output=resolve(process.argv[2]);await mkdir(output); // Preserve earlier evidence.
const browser=await chromium.launch({headless:true,...(process.env.AMEOW_BROWSER?{executablePath:process.env.AMEOW_BROWSER}:{channel:'msedge'})});
const report={scope:'synthetic player/media/binding/ACK; actual DOM/layout/keyboard/lifecycle; no desktop or real download',checks:[]};
try {
  for(const site of ['bilibili','youtube'])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width:1100,height:800},colorScheme:theme});
    const page=await context.newPage(),selector=site==='bilibili'?'.bpx-player-container':'#movie_player';
    const url=site==='bilibili'?'https://www.bilibili.com/video/BV17x411w7KC/':'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0;background:'+(theme==='dark'?'#232427':'#fff')+'}.player{position:relative;width:640px;height:360px;margin:40px auto;background:#555}video{width:100%;height:100%}.bpx-player-top-wrap{position:absolute;right:10px;top:10px}.bpx-player-top-issue{display:inline-block;width:24px;height:24px}</style><button class="bpx-player-top-issue" id="outside">Outside player</button><div class="player '+(site==='bilibili'?'bpx-player-container':'')+'" id="'+(site==='youtube'?'movie_player':'fixture')+'"><video controls></video><div class="bpx-player-top-wrap"><div class="bpx-player-top-issue"><span class="bpx-player-top-issue-icon">Feedback fixture</span></div><button id="unrelated">Other native control</button></div></div>'}));
    await page.goto(url);await page.addStyleTag({path:resolve('browser-extension/dist/page.css')});
    await page.evaluate(()=>{
      const video=document.querySelector('video');
      for(const[name,value]of Object.entries({duration:200,readyState:4,paused:true,currentTime:10}))Object.defineProperty(video,name,{configurable:true,writable:true,value});
      video.pause=()=>{video.paused=true;};video.play=async()=>{video.paused=false;};
      globalThis.fixtureEnabled=true;globalThis.fixtureSubmits=[];
      globalThis.chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage:async message=>{
        if(message.action==='page-binding')return fixtureEnabled?{ok:true,value:{key:'fixture:1',url:location.href,duration:200}}:{ok:false,error:'E_PAGE_DISABLED'};
        if(message.action==='page-submit'){fixtureSubmits.push(message);await new Promise(resolve=>{globalThis.releaseFixtureAck=resolve;});return{ok:true,value:{task_id:'fixture:1'}};}
        throw Error('Unexpected fixture action');
      }}};
    });
    await page.addScriptTag({path:resolve('browser-extension/dist/page.js')});
    const host=page.locator('ameow-page-tools'),toolbar=host.locator('.toolbar'),download=host.locator('.download');
    const native=page.locator(selector+' .bpx-player-top-issue'),expected=site==='bilibili'?'hidden':'';
    const waitNative=async value=>page.waitForFunction(({selector,value})=>document.querySelector(selector).style.visibility===value,{selector:selector+' .bpx-player-top-issue',value});
    await host.waitFor();await waitNative(expected);
    for(const id of ['outside','unrelated'])assert.equal(await page.locator('#'+id).evaluate(node=>node.style.visibility),'');
    await page.mouse.move(1,1);await page.waitForFunction(()=>document.querySelector('ameow-page-tools').shadowRoot.querySelector('.toolbar').hasAttribute('data-dim'));await page.waitForTimeout(200);
    assert.equal(await toolbar.evaluate(node=>getComputedStyle(node).opacity),'0.6');
    assert.equal((await toolbar.boundingBox()).width,32);assert.equal((await toolbar.boundingBox()).height,32);
    assert.equal(await host.locator('.download-icon svg').evaluate(node=>node.getBoundingClientRect().width),16);
    await toolbar.screenshot({path:join(output,site+'-'+theme+'-idle.png')});
    const collapsed=await toolbar.boundingBox();
    await page.mouse.move(collapsed.x+16,collapsed.y+16);await page.waitForTimeout(230);
    assert.equal((await toolbar.boundingBox()).width,156);
    await host.locator('.select').hover();assert.equal(await toolbar.getAttribute('data-expanded'),'');
    await download.hover();await page.mouse.move(1,1);await page.waitForTimeout(80);
    await page.mouse.move(collapsed.x+16,collapsed.y+16);await page.waitForTimeout(230);
    assert.equal((await toolbar.boundingBox()).width,156);
    await page.mouse.move(1,1);await page.waitForTimeout(550);assert.equal((await toolbar.boundingBox()).width,32);
    await download.focus();await page.waitForTimeout(230);
    assert.equal((await toolbar.boundingBox()).width,156);assert.equal(await toolbar.evaluate(node=>getComputedStyle(node).opacity),'1');
    await toolbar.screenshot({path:join(output,site+'-'+theme+'-expanded.png')});
    for(const width of [320,960]){
      await page.locator(selector).evaluate((node,width)=>{node.style.width=width+'px';node.style.height=width*9/16+'px';},width);
      const p=await page.locator(selector).boundingBox(),h=await host.boundingBox();
      assert.equal(p.x+p.width-h.x-h.width,10);assert.equal(h.y-p.y,10);
    }
    await page.locator(selector).evaluate(node=>{node.style.width='640px';node.style.height='360px';});
    await page.locator('#unrelated').click();await page.locator(selector).evaluate(node=>node.requestFullscreen());
    await page.waitForFunction(()=>!!document.fullscreenElement);
    const full=await page.locator(selector).boundingBox(),fullHost=await host.boundingBox();
    assert.equal(full.x+full.width-fullHost.x-fullHost.width,10);assert.equal(fullHost.y-full.y,10);
    await toolbar.screenshot({path:join(output,site+'-'+theme+'-fullscreen.png')});
    await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.fullscreenElement);
    await host.locator('.select').focus();await page.keyboard.press('Enter');await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});await waitNative('');
    await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});await waitNative(expected);
    await download.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>fixtureSubmits.length===1);
    assert.equal(await toolbar.getAttribute('data-status'),'pending');assert.equal(await host.getByRole('button',{name:'已加入队列'}).count(),0);
    await page.evaluate(()=>releaseFixtureAck());await host.getByRole('button',{name:'已加入队列'}).waitFor();
    await page.locator(selector).evaluate(node=>{node.style.marginTop='1400px';});await waitNative('');
    await page.locator(selector).evaluate(node=>{node.style.marginTop='40px';});await waitNative(expected);
    await host.evaluate(node=>{node.style.display='none';});await waitNative('');
    await host.evaluate(node=>{node.style.display='block';});await waitNative(expected);
    await page.evaluate(()=>{document.body.style.visibility='hidden';});await waitNative('');
    await page.evaluate(()=>{document.body.style.visibility='';});await waitNative(expected);
    await native.evaluate(node=>{globalThis.oldFeedback=node;const next=node.cloneNode(true);next.style.visibility='';node.replaceWith(next);});await waitNative(expected);
    assert.equal(await page.evaluate(()=>oldFeedback.style.visibility),'');
    if(site==='bilibili'){
      await native.evaluate(node=>{const other=node.cloneNode(true);other.id='ambiguous';other.style.visibility='';node.after(other);});await waitNative('');
      assert.equal(await page.locator('#ambiguous').evaluate(node=>node.style.visibility),'');
      await page.locator('#ambiguous').evaluate(node=>node.remove());await waitNative(expected);
      await host.evaluate(node=>{node.style.display='none';});await waitNative('');
      await native.evaluate(node=>node.style.setProperty('visibility','visible','important'));
      await host.evaluate(node=>{node.style.display='block';});await waitNative('hidden');
      await host.evaluate(node=>{node.style.display='none';});await waitNative('visible');
      assert.equal(await native.evaluate(node=>node.style.getPropertyPriority('visibility')),'important');
      await native.evaluate(node=>node.style.removeProperty('visibility'));
      await host.evaluate(node=>{node.style.display='block';});await waitNative(expected);
    }
    await host.evaluate(node=>node.remove());await waitNative('');
    await page.evaluate(()=>ameowPageTools.unbind());await page.evaluate(()=>ameowPageTools.refresh());await host.waitFor();await waitNative(expected);
    await page.evaluate(async()=>{fixtureEnabled=false;await ameowPageTools.refresh();});await host.waitFor({state:'detached'});await waitNative('');
    report.checks.push({site,theme,idle:32,expanded:156,icon:16,opacity:.6,feedback:site==='bilibili'?'exact target hides/restores':'no rule; native preserved',lifecycle:'Peek/offscreen/host hidden+removed/ancestor hidden/target replaced/unbind/disabled',binding:'mock',ack:'mock delayed'});
    await context.close();
  }
  report.browserVersion=browser.version();report.build=JSON.parse(await readFile('browser-extension/dist/build.json','utf8'));report.result='PASS';
}finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log('PASS capsule layout, focus/keyboard, delayed ACK and exact native-feedback lifecycle.');
