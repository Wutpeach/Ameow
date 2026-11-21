// Actual page controls in an isolated headless browser; only transport/ACK is mocked.
import assert from 'node:assert/strict';
import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [root, source, browser] = process.argv.slice(2).map(path=>resolve(path));
await mkdir(root);
await cp(new URL(import.meta.url), join(root, 'executed-script.mjs'));
for (const [from,to] of [[source,'source.mp4'],['browser-extension/dist/page.js','page.js'],['browser-extension/dist/page.css','page.css']]) await cp(resolve(from), join(root,to));
await writeFile(join(root,'fixture.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="page.css"><style>body{margin:0;background:#777}.bpx-player-container{position:relative;width:min(800px,100vw);aspect-ratio:16/9;margin:24px auto}video{width:100%;height:100%}</style><div class="bpx-player-container"><video src="source.mp4" controls></video></div>');
const report = { scope:'isolated local page UI, actual controls/keyboard, mocked transport; no daily browser, account or desktop', checks:[], views:[] };
const context = await chromium.launchPersistentContext(join(root,'profile'), { executablePath:browser, headless:true, viewport:{width:848,height:700}, args:['--disable-extensions','--no-first-run','--no-default-browser-check'] });
try {
  const page = await context.newPage();
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(join(root,'fixture.html')).href);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.evaluate(()=>{
    globalThis.fixturePart=1; globalThis.fixtureSubmits=[];
    globalThis.chrome={ runtime:{ onMessage:{addListener(){},removeListener(){}}, sendMessage:async message=>{
      if(message.action==='page-binding') return {ok:true,value:{key:'fixture:'+fixturePart,url:'https://www.bilibili.com/video/BV17x411w7KC/?p='+fixturePart,duration:document.querySelector('video').duration}};
      if(message.action==='page-submit') { fixtureSubmits.push(message); return await new Promise(resolve=>{globalThis.releaseAck=resolve}); }
      throw Error('UNEXPECTED_ACTION');
    },connectNative(){throw Error('FORBIDDEN_NATIVE')},sendNativeMessage(){throw Error('FORBIDDEN_NATIVE')} } };
  });
  await page.addScriptTag({path:join(root,'page.js')});
  await page.locator('ameow-page-tools').waitFor();
  const controls=page.locator('ameow-peek-controls');
  const open=async()=>{await page.evaluate(()=>ameowPageTools.openPeek());await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});};
  const close=async()=>{await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});};
  await open();
  const toggle=controls.getByRole('button',{name:'精确切分',exact:true});
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>{ameowPageTools.video.pause();ameowPageTools.video.currentTime=2;ameowPageTools.setDraft(1250,4750)});
  const state=()=>page.evaluate(()=>({draft:{...ameowPageTools.draft},time:ameowPageTools.video.currentTime,precise:ameowPageTools.precise}));
  const before=await state();
  await controls.locator('[data-action=view]').focus();await page.keyboard.press('Tab');
  assert(await toggle.evaluate(e=>e.getRootNode().activeElement===e));
  await page.keyboard.press('Space');
  assert.deepEqual(await state(),{...before,precise:true});
  assert((await toggle.getAttribute('aria-description')).includes('耗时更长'));
  report.checks.push('Tab reaches precision; Space toggles without changing range or playback; focus description explains cost');
  await controls.locator('[data-action=marker]').click();
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.deepEqual((await state()).draft,{start_ms:null,end_ms:null});
  await page.evaluate(()=>ameowPageTools.setDraft(1250,4750));
  await close();await open();
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  report.checks.push('clear markers and same-work reopen preserve precision');
  for(const width of [848,320]) for(const theme of ['light','dark']) for(const on of [false,true]) {
    await page.setViewportSize({width,height:700});await page.emulateMedia({colorScheme:theme});
    if((await toggle.getAttribute('aria-pressed')==='true')!==on) await toggle.click();
    await page.mouse.move(2,2);await toggle.evaluate(e=>e.blur());
    const bounds=await controls.locator('.control-row').evaluate(row=>{
      const r=row.getBoundingClientRect();return {width:r.width,scrollWidth:row.scrollWidth,buttons:[...row.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return {action:b.dataset.action,x:q.x,left:q.x-r.x,right:q.right-r.x,width:q.width,height:q.height}})};
    });
    assert(bounds.scrollWidth<=bounds.width+1);
    assert(bounds.buttons.every(b=>b.left>=-1&&b.right<=bounds.width+1));
    const precision=bounds.buttons.find(b=>b.action==='precise');assert.equal(precision.width,64);assert.equal(precision.height,32);
    await controls.locator('.control-row').screenshot({path:join(root,`toolbar-${width}-${theme}-${on?'on':'off'}.png`)});
    report.views.push({width,theme,on,bounds});
  }
  await page.setViewportSize({width:848,height:700});
  if(await toggle.getAttribute('aria-pressed')!=='true') await toggle.click();
  await controls.getByRole('button',{name:'下载片段',exact:true}).click();
  assert(await toggle.isDisabled());
  const submitted=await page.evaluate(()=>fixtureSubmits[0]);
  assert.deepEqual(submitted.clip,{start_ms:1250,end_ms:4750,precise:true});
  await page.evaluate(()=>releaseAck({ok:false,error:'E_CLIP_UNSUPPORTED'}));
  await page.waitForFunction(()=>!ameowPageTools.pending);
  assert(await toggle.isEnabled());assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert((await controls.locator('.status').innerText()).includes('不支持'));
  report.checks.push('pending disables toggle, unsupported rejection preserves precise range without retry/downgrade');
  await controls.getByRole('button',{name:'下载片段',exact:true}).click();
  await page.evaluate(()=>releaseAck({ok:true,value:{task_id:'fixture:2'}}));
  await controls.getByRole('button',{name:'已加入队列',exact:true}).waitFor();
  await toggle.click();
  assert.deepEqual(await page.evaluate(()=>fixtureSubmits[1].clip),submitted.clip);
  report.checks.push('accepted mode remains frozen when the draft toggle changes');
  await toggle.click();await close();
  await page.evaluate(async()=>{fixturePart=2;await ameowPageTools.refresh()});await open();
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  assert.deepEqual((await state()).draft,{start_ms:null,end_ms:null});
  report.checks.push('work/part change resets precision and selection');
  report.build=JSON.parse(await readFile('browser-extension/dist/build.json','utf8'));
  await page.evaluate(()=>ameowPageTools.stop());
} catch(error) { report.error=error.stack;throw error; }
finally { await context.close();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2)); }
console.log(JSON.stringify(report,null,2));
