// Own profiles and public VOD. Browser permission is seeded, not native consent evidence.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prepareIsolatedExtension, assertRuntimeIsolation, nativeAudit } from './isolation.mjs';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2]);
const brand = process.argv[3] || 'cft';
try { await access(root); throw Error('Use a fresh evidence directory'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
await mkdir(root, { recursive: true });
await writeFile(join(root, 'executed-script.mjs'), await (await import('node:fs/promises')).readFile(new URL(import.meta.url)));
const extension = join(root, 'extension');
// UI-only runs must never call the user's registered native host, even for List.
const fixtureHost = 'org.ameow.browser_sessions.fixture.ui_' + randomUUID().replaceAll('-', '');
const fixtureBuild = await prepareIsolatedExtension(resolve('browser-extension/dist'), extension, fixtureHost);
const context = await chromium.launchPersistentContext(join(root, 'profile'), {
  ...(brand === 'edge' ? { channel: 'msedge' } : { executablePath: 'D:/Ameow-handoffs/issue24-browser-validation/chrome-for-testing/158.0.8127.36/chrome-win64/chrome.exe' }),
  headless: true, colorScheme: brand === 'edge' ? 'dark' : 'light', ignoreDefaultArgs: ['--disable-extensions'], viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: join(root, 'video'), size: { width: 1440, height: 1000 } },
  args: ['--headless=new', '--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run', '--no-default-browser-check'],
});
const extensionId = 'icedkidcbbbijndplfofcbhikohlcool';
const report = { brand, version: context.browser().version(), fixtureHost, fixtureBuild, native: 'unique unregistered host; API guard rejects all other hosts before API', permission: 'seeded in own profile', checks: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  report.isolation = await assertRuntimeIsolation(worker, fixtureHost);
  const manager = await context.newPage(); await manager.goto(brand === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
  await manager.evaluate(async id => { for (const origin of ['https://www.youtube.com/*', 'https://www.bilibili.com/*']) await chrome.developerPrivate.addHostPermission(id, origin); }, extensionId);
  await manager.close();
  for (const [site, url] of [['youtube', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'], ['bilibili', 'https://www.bilibili.com/video/BV17x411w7KC/']]) {
    const page = await context.newPage(), row = { site, url, startedAt: Date.now(), events: [] }; report.checks.push(row);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => [...document.querySelectorAll('video,bwp-video')].some(v => v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0), null, { timeout: 45000 });
    const pause = async time => page.evaluate(time => { document.querySelector('#movie_player')?.pauseVideo?.(); for (const v of document.querySelectorAll('video,bwp-video')) { v.pause(); if (time !== undefined) v.currentTime = time; } }, time);
    await pause(); await page.bringToFront();
    const tab = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]);
    const popup = await context.newPage(); await popup.setViewportSize({ width: 320, height: 600 });
    await popup.addInitScript(tab => { chrome.tabs.query = async () => [tab]; }, { id: tab.id, url: page.url() });
    await popup.goto('chrome-extension://' + extensionId + '/popup.html'); assert.equal(await popup.evaluate(() => globalThis.ameowFixtureNativeGuard), fixtureHost);
    await popup.getByRole('button', { name: '启用页面工具' }).click(); await popup.getByRole('button', { name: '关闭页面工具' }).waitFor(); await popup.close(); await page.bringToFront();
    await page.setViewportSize({ width: 1441, height: 1000 }); await page.setViewportSize({ width: 1440, height: 1000 }); await pause();
    const toolbar = page.locator('ameow-page-tools'); await toolbar.waitFor({ timeout: 20000 });
    const cat = toolbar.getByRole('button', { name: '下载', exact: true }), select = toolbar.getByRole('button', { name: '切片', exact: true });
    const hoverCat = async () => { const b = await cat.boundingBox(); await page.mouse.move(b.x + b.width - 14, b.y + 14); };
    const open = async () => { await hoverCat(); await sleep(230); const b = await select.boundingBox(); assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:b.x+b.width/2,y:b.y+b.height/2}), 'AMEOW-PAGE-TOOLS'); await page.mouse.click(b.x+b.width/2,b.y+b.height/2); await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'}); };
    const cdp = await context.newCDPSession(page);
    row.capsule = [];
    for (const reduced of [false, true]) {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.mouse.move(5,5); await toolbar.evaluate(h=>h.shadowRoot.activeElement?.blur()); await sleep(2600);
      assert(await toolbar.locator('.toolbar').evaluate(e=>e.hasAttribute('data-dim')));
      if (!reduced) await toolbar.locator('.toolbar').screenshot({path:join(root,site+'-collapsed.png')});
      const box=await toolbar.boundingBox(), frames=[]; const prefix=site+(reduced?'-reduced':'-normal');
      const capture=async n=>{const frame=await cdp.send('Page.captureScreenshot',{format:'png',clip:{x:box.x-4,y:box.y-4,width:box.width+8,height:box.height+8,scale:1},captureBeyondViewport:false});const name=prefix+'-expand-'+n+'.png';await writeFile(join(root,name),Buffer.from(frame.data,'base64'));frames.push({path:name,at:Date.now()});};
      row.events.push({action:prefix+'-capsule-expand',seconds:(Date.now()-row.startedAt)/1000});await capture(0);await hoverCat();
      for(let n=1;n<=7;n++){await capture(n);await sleep(20);}
      const label=await toolbar.locator('.download-label').evaluate(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,whiteSpace:getComputedStyle(e).whiteSpace}));assert.equal(label.height,20);assert.equal(label.width,26);assert.equal(label.whiteSpace,'nowrap');assert.equal(await toolbar.locator('[title],[role=tooltip]').count(),0);row.capsule.push({reduced,frames,label});
      if(!reduced)await toolbar.screenshot({path:join(root,site+'-expanded.png')});
      await page.setViewportSize({width:848,height:780});await pause(3);
      await page.evaluate(()=>{const video=document.querySelector('#movie_player video,.bpx-player-container video,.bpx-player-container bwp-video'),player=video.closest('#movie_player,.bpx-player-container');globalThis.ameowEvidence={video,player,parent:player.parentNode,source:video.currentSrc,controls:video.controls,scrollY,dm:player.querySelector('.bpx-player-render-dm-wrap'),subtitle:player.querySelector('.bpx-player-subtitle-wrap')};const e=ameowEvidence;e.dmDisplay=e.dm?getComputedStyle(e.dm).display:null;e.subtitleDisplay=e.subtitle?getComputedStyle(e.subtitle).display:null;});
      row.events.push({action:prefix+'-peek-entry',seconds:(Date.now()-row.startedAt)/1000});await open();
      const controls=page.locator('ameow-peek-controls'), marker=controls.locator('[data-action=marker]'), clear={click:async()=>{if(await marker.getAttribute('aria-pressed')==='true')await marker.click()},focus:()=>marker.focus(),press:key=>marker.press(key)};
      const state=async()=>({start:await controls.locator('#clip-in').inputValue(),end:await controls.locator('#clip-out').inputValue(),time:await page.evaluate(()=>ameowEvidence.video.currentTime)});
      await clear.click();await pause(3);await marker.click();assert.deepEqual(await state(),{start:'0:03.000',end:'',time:3});assert(await controls.getByRole('button',{name:'下载片段',exact:true}).isDisabled());
      if(site==='bilibili'){const dm=await page.evaluate(()=>({present:!!ameowEvidence.dm,display:ameowEvidence.dm?getComputedStyle(ameowEvidence.dm).display:null,subtitleBefore:ameowEvidence.subtitleDisplay,subtitleNow:ameowEvidence.subtitle?getComputedStyle(ameowEvidence.subtitle).display:null}));assert(dm.present&&dm.display==='none');assert.equal(dm.subtitleNow,dm.subtitleBefore);row[reduced?'reducedDanmaku':'normalDanmaku']=dm;}
      await controls.getByRole('button',{name:'聚焦标记',exact:true}).click();
      const drag=async side=>{const h=controls.locator('.handle.single:not([hidden])'),b=await h.boundingBox(),x=b.x+b.width/2+(side==='left'?-10:10);await page.mouse.move(x,b.y+14);await page.mouse.down();await page.mouse.move(x+(side==='left'?-40:40),b.y+14,{steps:8});const cb=await controls.boundingBox();await page.screenshot({path:join(root,prefix+'-edge-'+side+'.png'),clip:{x:cb.x,y:cb.y-40,width:cb.width,height:cb.height+40}});await page.mouse.up();};
      await drag('left');const left=await state();assert.equal(left.end,'0:03.000');assert.notEqual(left.start,'0:03.000');assert.equal(left.time,3);
      await clear.click();await marker.click();await controls.getByRole('button',{name:'聚焦标记',exact:true}).click();await drag('right');const right=await state();assert.equal(right.start,'0:03.000');assert.notEqual(right.end,'0:03.000');assert.equal(right.time,3);row[reduced?'reducedDirect':'normalDirect']={left,right};
      for(const name of['拖动入点','拖动出点']){await controls.getByRole('slider',{name,exact:true}).focus();assert((await controls.getByRole('tooltip').innerText()).includes(name==='拖动入点'?'入点':'出点'));}
      for(const [action,key,time,field,expected]of[['marker','KeyI',1.25,'start','0:01.250'],['play','KeyO',4.75,'end','0:04.750'],['view','Shift+KeyI',2,'start','0:02.000'],['marker','Shift+KeyO',5,'end','0:05.000']]){await pause(time);await controls.locator('[data-action='+action+']').focus();await page.keyboard.press(key);assert.equal((await state())[field],expected);}
      await controls.getByRole('button',{name:'编辑选区时间',exact:true}).click();const start=controls.getByRole('textbox',{name:'入点时间'}),end=controls.getByRole('textbox',{name:'出点时间'});await end.fill('');await end.press('KeyO');assert.equal(await end.inputValue(),'o');await start.fill('1.250');await end.fill('4.750');await controls.getByRole('button',{name:'编辑选区时间',exact:true}).click();assert.equal(await controls.getByRole('textbox').count(),0);
      await controls.getByRole('button',{name:'显示全片',exact:true}).click();await pause(2);
      await page.locator('.ameow-peek-stage').evaluate(el=>{el.tabIndex=0;el.focus()});
      row.spaceTelemetry ??= [];const spaceState=()=>page.evaluate(()=>({paused:ameowEvidence.video.paused,ready:ameowEvidence.video.readyState,focusTag:document.activeElement?.tagName,focusClass:document.activeElement?.className,playerState:document.querySelector('#movie_player')?.getPlayerState?.()}));
      await page.keyboard.press('Space');row.spaceTelemetry.push({reduced,action:'play',...await spaceState()});await page.waitForFunction(()=>!ameowEvidence.video.paused);await page.keyboard.press('Space');row.spaceTelemetry.push({reduced,action:'pause',...await spaceState()});await page.waitForFunction(()=>ameowEvidence.video.paused);
      await pause(2);const h=controls.locator('.playhead'),hb=await h.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+3);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2+6,hb.y+3,{steps:5});await page.mouse.up();const dragged=(await state()).time;await page.keyboard.press('ArrowRight');assert(Math.abs((await state()).time-dragged-.001)<.002);assert.equal((await state()).start,'0:01.250');assert.equal((await state()).end,'0:04.750');
      await controls.getByRole('button',{name:'聚焦选区',exact:true}).click();await page.mouse.move(5,5);await controls.locator('[data-action=play]').evaluate(el=>el.blur());await sleep(150);
      const layout=await controls.evaluate(h=>({width:h.clientWidth,height:h.clientHeight,scrollWidth:h.shadowRoot.querySelector('.controls').scrollWidth,timelineWidth:h.shadowRoot.querySelector('.timeline').getBoundingClientRect().width,font:getComputedStyle(h.shadowRoot.querySelector('.controls')).fontFamily}));row[reduced?'reducedLayout':'normalLayout']=layout;assert(layout.width===800&&layout.scrollWidth<=layout.width&&layout.timelineWidth>740&&layout.height<=130&&layout.font.includes('Segoe UI'));
      await page.locator('.ameow-peek').screenshot({path:join(root,prefix+'-peek.png')});
      await clear.focus();await clear.press('Space');assert(await controls.getByRole('button',{name:'下载片段',exact:true}).isDisabled());assert(await page.locator('.ameow-peek').isVisible());
      await pause(1.25);await marker.focus();await marker.press('Space');await pause(4.75);await marker.press('KeyO');assert.equal((await state()).start,'0:01.250');assert.equal((await state()).end,'0:04.750');assert.equal(await controls.locator('[data-action=clear]').count(),0);assert.equal(await marker.getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>{ameowEvidence.exitTime=ameowEvidence.video.currentTime});row.events.push({action:prefix+'-peek-exit',seconds:(Date.now()-row.startedAt)/1000});await controls.getByRole('button',{name:'关闭预览',exact:true}).focus();await page.keyboard.press('Space');await page.locator('.ameow-peek').waitFor({state:'detached'});
      const restored=await page.evaluate(()=>{const e=ameowEvidence;return{sameNode:e.video===document.querySelector('#movie_player video,.bpx-player-container video,.bpx-player-container bwp-video'),sameSource:e.video.currentSrc===e.source,parent:e.player.parentNode===e.parent,time:e.video.currentTime,expectedTime:e.exitTime,controls:e.video.controls===e.controls,scrollUnlocked:document.documentElement.style.overflow!=='hidden',dm:e.dm?getComputedStyle(e.dm).display:null,expectedDm:e.dmDisplay,subtitle:e.subtitle?getComputedStyle(e.subtitle).display:null,expectedSubtitle:e.subtitleDisplay}});assert(restored.sameNode&&restored.sameSource&&restored.parent&&restored.controls&&restored.scrollUnlocked);assert(Math.abs(restored.time-restored.expectedTime)<.05);assert.equal(restored.dm,restored.expectedDm);assert.equal(restored.subtitle,restored.expectedSubtitle);row[reduced?'reducedRestore':'normalRestore']=restored;
      await open();assert.equal(await controls.locator('#clip-in').inputValue(),'0:01.250');assert.equal(await controls.locator('#clip-out').inputValue(),'0:04.750');await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});
      await page.setViewportSize({width:1440,height:1000});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});await open();await page.setViewportSize({width:320,height:780});await sleep(150);const controls=page.locator('ameow-peek-controls');row.narrow=await controls.evaluate(h=>({width:h.clientWidth,scrollWidth:h.shadowRoot.querySelector('.controls').scrollWidth,height:h.clientHeight}));assert(row.narrow.scrollWidth<=row.narrow.width);await page.locator('.ameow-peek').screenshot({path:join(root,site+'-narrow.png')});await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});await page.setViewportSize({width:1440,height:1000});
    row.events.push({action:'fast-hover-peek',seconds:(Date.now()-row.startedAt)/1000});for(let n=0;n<4;n++){await hoverCat();await sleep(50);await page.mouse.move(5,5);await sleep(70)}for(let n=0;n<3;n++){await open();await sleep(50);await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});}
    if(site==='bilibili'){await open();await page.evaluate(()=>window.player.next());await page.waitForFunction(()=>window.player?.getManifest?.().p===2,null,{timeout:20000});await page.locator('.ameow-peek').waitFor({state:'detached'});await sleep(1200);await pause();await toolbar.waitFor({timeout:20000});await open();assert.equal(await page.locator('ameow-peek-controls #clip-in').inputValue(),'');assert.equal(await page.locator('ameow-peek-controls #clip-out').inputValue(),'');await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});assert.notEqual(await page.locator('.bpx-player-render-dm-wrap').evaluate(e=>getComputedStyle(e).display),'none');row.partSwitchRestoresAndClears=true;}
    assert.equal(Object.keys((await worker.evaluate(()=>chrome.storage.local.get('grants'))).grants||{}).length,0);row.noCookieGrant=true;row.pass=true;row.video=await page.video().path();await page.close();
  }
  report.nativeAudit = await nativeAudit(worker);
  assert(report.nativeAudit.every(e => e.allowed ? e.host === fixtureHost : e.host === 'FORBIDDEN'));
} catch (e) { report.error = e.stack; for (const page of context.pages()) { if(await page.locator('.ameow-peek').count()) { await page.locator('.ameow-peek').screenshot({path:join(root,'failure.png')}).catch(()=>{}); report.failureLayout=await page.locator('ameow-peek-controls').evaluate(h=>({status:h.shadowRoot.querySelector('.status').textContent,rect:h.getBoundingClientRect().toJSON(),overflow:[...h.shadowRoot.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>h.getBoundingClientRect().right+.5).map(e=>({tag:e.tagName,cls:e.className,rect:e.getBoundingClientRect().toJSON()}))})).catch(()=>null); }} throw e; }
finally { await context.close(); await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report, null, 2));
