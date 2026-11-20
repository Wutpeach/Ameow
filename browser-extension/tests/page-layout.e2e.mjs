// Owned synthetic media and mocked ACK for layout/track checks. No extension or Native access.
import assert from 'node:assert/strict';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
const root = resolve(process.argv[2]); await mkdir(root);
for (const [from, to] of [[process.argv[3], 'source.mp4'], ['browser-extension/dist/page.js', 'page.js'], ['browser-extension/dist/page.css', 'page.css']]) await cp(resolve(from), join(root, to));
await writeFile(join(root, 'fixture.html'), '<!doctype html><link rel="stylesheet" href="page.css"><style>body{margin:0;font:18px Georgia,serif;background:#eee}.bpx-player-container{position:relative;width:min(800px,100vw);height:auto;aspect-ratio:16/9;margin:60px auto}video{width:100%;height:100%}</style><div class="bpx-player-container"><video src="source.mp4" controls></video></div>');
const report = { scope: 'synthetic local media; mocked binding and delayed ACK; actual pointer, layout and keyboard; no extension/Native', checks: {} };
const context = await chromium.launchPersistentContext(join(root, 'profile'), { executablePath: process.argv[4], headless:true, viewport:{width:848,height:750}, args:['--disable-extensions','--no-first-run','--no-default-browser-check'] });
try {
  const page = await context.newPage();
  await page.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  await page.goto(pathToFileURL(join(root, 'fixture.html')).href);
  await page.waitForFunction(() => document.querySelector('video').readyState >= 2);
  await page.evaluate(() => {
    globalThis.chrome = { runtime: { onMessage:{addListener(){},removeListener(){}}, sendMessage:async m => {
      if(m.action === 'page-binding') return {ok:true,value:{key:'fixture:1',url:'https://www.bilibili.com/video/BV17x411w7KC/',duration:document.querySelector('video').duration}};
      if(m.action === 'page-submit') { fixtureSubmits.push(m); await new Promise(r=>{globalThis.releaseAck=r}); return {ok:true,value:{task_id:'mock:1'}}; }
      throw Error('UNEXPECTED_ACTION');
    },sendNativeMessage(){throw Error('FORBIDDEN_NATIVE')},connectNative(){throw Error('FORBIDDEN_NATIVE')} } };
    globalThis.fixtureSubmits=[];
  });
  await page.addScriptTag({path:join(root,'page.js')});
  const toolbar=page.locator('ameow-page-tools'), cat=toolbar.getByRole('button',{name:'下载',exact:true});
  await toolbar.waitFor(); await page.waitForTimeout(500);
  await toolbar.screenshot({path:join(root,'collapsed.png')});
  await cat.hover(); await page.waitForTimeout(250);
  const select=toolbar.getByRole('button',{name:'切片',exact:true});
  await select.hover(); await page.waitForTimeout(500);
  assert(await toolbar.locator('.toolbar').evaluate(e=>e.hasAttribute('data-expanded')));
  assert.equal(await toolbar.locator('[title],[role=tooltip]').count(),0);
  await toolbar.screenshot({path:join(root,'expanded.png')});
  await select.click(); await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});
  const controls=page.locator('ameow-peek-controls'), start=controls.getByRole('textbox',{name:'入点时间'}), end=controls.getByRole('textbox',{name:'出点时间'}), submit=controls.getByRole('button',{name:'下载片段',exact:true});
  assert(await submit.isDisabled()); assert(await controls.locator('.range-body').isHidden()); await start.fill('1.250'); assert(await submit.isDisabled()); assert(await controls.locator('.range-body').isHidden()); assert.equal(await controls.locator('.handle.in').getAttribute('data-unset'),null); assert.equal(await controls.locator('.handle.out').getAttribute('data-unset'),''); await controls.screenshot({path:join(root,'single-end.png')}); await start.fill('1.250'); await end.fill('4.750'); assert(await submit.isEnabled());
  const inHandle=controls.getByRole('slider',{name:'拖动入点'}), outHandle=controls.getByRole('slider',{name:'拖动出点'});
  await inHandle.focus(); await inHandle.press('ArrowRight'); assert.equal(await start.inputValue(),'0:01.251');
  await inHandle.press('ArrowLeft');
  for(const handle of [inHandle,outHandle]) {
    const b=await handle.boundingBox(); const before=await handle.getAttribute('aria-valuenow');
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+12,b.y+b.height/2,{steps:6}); await page.mouse.up();
    assert(Number(await handle.getAttribute('aria-valuenow'))>Number(before));
    assert(Math.abs(await page.evaluate(()=>ameowPageTools.video.currentTime)-Number(await handle.getAttribute('aria-valuenow'))/1000)<.01);
  }
  report.checks.pointerDragBoth=true;
  await start.fill('1.250'); await end.fill('4.750'); await page.evaluate(()=>{ameowPageTools.video.currentTime=7.9});await page.waitForTimeout(80);
  const focusTime=await page.evaluate(()=>ameowPageTools.video.currentTime);
  await controls.getByRole('button',{name:'聚焦选区',exact:true}).click();assert.equal(await page.evaluate(()=>ameowPageTools.video.currentTime),focusTime);assert(await controls.locator('.playhead').isHidden());assert.equal(await controls.locator('.time').getAttribute('aria-label'),'播放位置在视窗之后');
  const seekFocused=controls.getByRole('slider',{name:'播放位置',exact:true});const window=await seekFocused.evaluate(e=>({min:Number(e.min),max:Number(e.max)}));assert(window.max-window.min<8);
  await controls.getByRole('button',{name:'显示全片',exact:true}).click();assert.equal(await page.evaluate(()=>ameowPageTools.video.currentTime),focusTime);assert.equal(await start.inputValue(),'0:01.250');report.checks.focusViewKeepsValuesAndClipsHead=true;

  const shift=controls.getByRole('slider',{name:'平移选区'}), track=controls.locator('.track');
  await start.fill('1.250'); await end.fill('4.750');
  const p0=await page.evaluate(()=>ameowPageTools.video.currentTime);
  const body=await shift.boundingBox();
  await page.mouse.move(body.x+body.width/2,body.y+body.height/2);await page.mouse.down();await page.mouse.move(body.x+body.width/2+18,body.y+body.height/2,{steps:6});
  assert(await controls.locator('.time-bubble').isVisible());
  await controls.screenshot({path:join(root,'drag-range.png')});await page.mouse.up();
  let moved=await page.evaluate(()=>({...ameowPageTools.draft}));assert.equal(moved.end_ms-moved.start_ms,3500);assert(moved.start_ms>1250);assert.equal(await page.evaluate(()=>ameowPageTools.video.currentTime),p0);
  await shift.focus();await shift.press('Home');moved=await page.evaluate(()=>({...ameowPageTools.draft}));assert.equal(moved.start_ms,0);assert.equal(moved.end_ms,3500);
  await shift.press('End');moved=await page.evaluate(()=>({...ameowPageTools.draft}));assert.equal(moved.end_ms,8000);assert.equal(moved.start_ms,4500);
  const atEnd=await shift.boundingBox();await page.mouse.move(atEnd.x+atEnd.width/2,atEnd.y+atEnd.height/2);await page.mouse.down();await page.mouse.move(atEnd.x+atEnd.width/2+200,atEnd.y+atEnd.height/2,{steps:6});await page.mouse.up();assert.equal(await end.inputValue(),'0:08.000');
  const tb=await track.boundingBox();await page.mouse.move(tb.x+tb.width*.7,tb.y+2);assert(await controls.locator('.time-bubble').isVisible());await controls.screenshot({path:join(root,'hover-time.png')});
  await page.mouse.click(tb.x+tb.width*.25,tb.y+3);assert(Math.abs(await page.evaluate(()=>ameowPageTools.video.currentTime)-2)<.1);assert.equal(await end.inputValue(),'0:08.000');
  const seekBox=await controls.getByRole('slider',{name:'播放位置',exact:true}).boundingBox();await page.mouse.move(seekBox.x+seekBox.width*.4,seekBox.y+2);await page.mouse.down();await page.mouse.move(seekBox.x+seekBox.width*.7,seekBox.y+2,{steps:8});await page.mouse.up();assert(Math.abs(await page.evaluate(()=>ameowPageTools.video.currentTime)-5.6)<.1);
  const head=controls.locator('.playhead'), hb=await head.boundingBox();const marksBefore=await page.evaluate(()=>({...ameowPageTools.draft}));
  await page.mouse.move(hb.x+hb.width/2,hb.y+3);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2-18,hb.y+3,{steps:6});await page.mouse.up();assert(await page.evaluate(()=>ameowPageTools.video.currentTime)<5.6);assert.deepEqual(await page.evaluate(()=>({...ameowPageTools.draft})),marksBefore);report.checks.playheadPointerIndependent=true;
  const actualAfterDrag=await page.evaluate(()=>ameowPageTools.video.currentTime), nativeAfterDrag=Number(await controls.getByRole('slider',{name:'播放位置',exact:true}).inputValue());assert(Math.abs(actualAfterDrag-nativeAfterDrag)<.001);
  await page.keyboard.press('ArrowRight');assert(Math.abs(await page.evaluate(()=>ameowPageTools.video.currentTime)-actualAfterDrag-.001)<.0011);assert.deepEqual(await page.evaluate(()=>({...ameowPageTools.draft})),marksBefore);report.checks.playheadDragThenNativeKeyboardContinues=true;

  report.checks.rangeMovesPreserveDurationAndPlayback=true;report.checks.clampBothEnds=true;report.checks.seekAndHoverIndependent=true;
  await start.fill('1.250'); await end.fill('4.750'); await end.press('Tab');
  report.desktop=await controls.evaluate(h=>{const r=h.shadowRoot;return{width:h.getBoundingClientRect().width,height:h.getBoundingClientRect().height,row:r.querySelector('.control-row').getBoundingClientRect().toJSON(),tops:[...r.querySelectorAll('.playback,.field,.actions')].map(e=>e.getBoundingClientRect().top),font:getComputedStyle(r.querySelector('.controls')).fontFamily,overflow:h.scrollWidth>h.clientWidth}});
  assert(report.desktop.height<=72); assert(!report.desktop.font.includes('Georgia')); assert(!report.desktop.overflow); assert(Math.max(...report.desktop.tops)-Math.min(...report.desktop.tops)<12);
  await page.locator('.ameow-peek').screenshot({path:join(root,'desktop-peek.png')});
  await end.fill('0.5'); assert(await submit.isDisabled()); await end.fill('4.750');
  await controls.getByRole('button',{name:'清除选区'}).click(); assert(await submit.isDisabled());
  await page.evaluate(()=>{ameowPageTools.video.currentTime=1.25}); await controls.getByRole('button',{name:'将当前位置设为入点（I）',exact:true}).click();
  await page.evaluate(()=>{ameowPageTools.video.currentTime=4.75}); await controls.getByRole('button',{name:'将当前位置设为出点（O）',exact:true}).click(); assert(await submit.isEnabled());
  await submit.click(); await controls.getByRole('button',{name:'等待 Ameow 受理…',exact:true}).waitFor(); assert.equal(await controls.getByRole('button',{name:'已加入队列',exact:true}).count(),0);
  await page.evaluate(()=>releaseAck()); await controls.getByRole('button',{name:'已加入队列',exact:true}).waitFor(); report.checks.delayedMockAck=true;
  for(const width of [620,420,320]) {
    await page.setViewportSize({width,height:750}); await page.waitForTimeout(100);
    const layout=await controls.evaluate(h=>({width:h.getBoundingClientRect().width,height:h.getBoundingClientRect().height,overflow:h.shadowRoot.querySelector('.controls').scrollWidth>h.getBoundingClientRect().width})); assert(!layout.overflow); report['narrow'+width]=layout;
    await page.locator('.ameow-peek').screenshot({path:join(root,'narrow-'+width+'.png')});
  }
  await page.keyboard.press('Escape'); await page.locator('.ameow-peek').waitFor({state:'detached'}); report.checks.restore=true;
  await page.evaluate(()=>ameowPageTools.openPeek()); await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});
  const rb=await controls.getByRole('slider',{name:'平移选区'}).boundingBox();await page.mouse.move(rb.x+rb.width/2,rb.y+rb.height/2);await page.mouse.down();await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});await page.mouse.up();await page.evaluate(()=>ameowPageTools.openPeek());await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});
  const hover=await controls.locator('.track').boundingBox();await page.mouse.move(hover.x+hover.width*.6,hover.y+2);await page.waitForTimeout(100);report.checks.escapeWhileDragging=await page.evaluate(()=>({dragging:ameowPageTools.draggingTrack,bubbleHidden:ameowPageTools.controls.querySelector('.time-bubble').hidden}));assert(!report.checks.escapeWhileDragging.dragging);assert(!report.checks.escapeWhileDragging.bubbleHidden);

  report.build=JSON.parse(await readFile('browser-extension/dist/build.json','utf8')); report.bundleSha256=createHash('sha256').update(await readFile(join(root,'page.js'))).digest('hex');
} catch(error) {report.error=error.stack;throw error;} finally {await context.close();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
