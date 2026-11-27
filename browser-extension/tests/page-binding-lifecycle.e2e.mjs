// Local media and intercepted site-shaped DOM; real pointer capture/polling, no Native or account.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {canonicalTarget} from '../src/page-core.mjs';
import {readPlayer} from '../src/page-background.mjs';

const output=resolve(process.argv[2]);await mkdir(output);
await cp(new URL(import.meta.url),output+'/executed-script.mjs');
const media='data:video/mp4;base64,'+(await readFile(resolve(process.argv[3]))).toString('base64');
const cases=[
 {site:'xiaohongshu',url:'https://www.xiaohongshu.com/explore/6b08a8be000000002903d864?xsec_token=synthetic',root:'class="fixture-player player-el xhsplayer-skin-default"'},
 {site:'bilibili',url:'https://www.bilibili.com/video/BV17x411w7KC/?p=1',root:'class="fixture-player bpx-player-container"'},
 {site:'youtube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',root:'id="movie_player" class="fixture-player"'},
];
const browser=await chromium.launch({executablePath:process.argv[4],headless:true,args:['--disable-extensions','--no-first-run','--no-default-browser-check']});
const report={scope:'intercepted three-site DOM, actual readPlayer/canonicalTarget/bundle, local media and trusted headless mouse; no Native or real site',checks:[]};
try{
 for(const fixture of cases){
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  await page.route('**/*',route=>route.request().url()===fixture.url?route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}#noteContainer{width:800px;margin:40px auto}.fixture-player{position:relative;width:100%;aspect-ratio:16/9}video{width:100%;height:100%}</style><div id="noteContainer"><div '+fixture.root+'><video src="'+media+'"></video></div></div>'}):route.abort());
  await page.goto(fixture.url);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
  await page.addStyleTag({path:'browser-extension/dist/page.css'});
  await page.evaluate(({site,reader,canonical})=>{
   const video=document.querySelector('video'),player=video.parentElement;
   player.classList.add('fixture-player');
   globalThis.originalVideo=video;globalThis.originalPlayer=player;
   player.getVideoData=()=>({video_id:'jNQXAC9IVRw',isLive:false});
   globalThis.player={getManifest:()=>({bvid:'BV17x411w7KC',cid:275431,aid:170001,p:1}),mediaElement:()=>video};
   const id='6b08a8be000000002903d864';
   globalThis.__INITIAL_STATE__={note:{currentNoteId:{value:id},noteDetailMap:{[id]:{note:{noteId:id,type:'video',video:{media:{stream:{h264:[{duration:video.duration*1000}]}}}}}}}};
   const read=(0,eval)('('+reader+')');
   const PAGE_ORIGINS={'www.xiaohongshu.com':true,'www.bilibili.com':true,'www.youtube.com':true};
   const pageHost=value=>{const url=new URL(value);return PAGE_ORIGINS[url.hostname]?url.hostname:null;};
   const target=eval('('+canonical+')');
   globalThis.chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage:async message=>{
    if(message.action!=='page-binding')throw Error('No Native/download in this test');
    return {ok:true,value:target(location.href,read())};
   }}};
  },{site:fixture.site,reader:readPlayer.toString(),canonical:canonicalTarget.toString()});
  await page.addScriptTag({path:'browser-extension/dist/page.js'});
  await page.locator('ameow-page-tools').waitFor();
  await page.evaluate(()=>{ameowPageTools.openPeek();ameowPageTools.setDraft(1000,4000);});
  await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});
  const marker=page.locator('ameow-peek-controls .handle.in'),box=await marker.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.evaluate(site=>{
   const hidden=originalVideo.cloneNode();hidden.removeAttribute('src');hidden.className='fixture-hidden-video';
   hidden.style.cssText='position:absolute;inset:0;width:100%;height:100%;visibility:hidden';originalPlayer.append(hidden);
   if(site==='xiaohongshu'){
    const background=document.createElement('div');background.id='fixture-feed-player';background.className='player-el xhsplayer-skin-default';
    background.style.cssText='position:fixed;left:0;top:0;width:240px;height:135px';
    document.body.append(background);
   }
  },fixture.site);
  // Cross the real 800ms binding poll while the marker owns pointer capture.
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.ameow-peek').count(),1,fixture.site+': background/hidden player must not close the active edit');
  assert(await page.evaluate(()=>ameowPageTools.video===originalVideo&&ameowPageTools.player===originalPlayer));
  await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:4});
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:4});await page.mouse.up();
  assert.deepEqual(await page.evaluate(()=>ameowPageTools.draft),{start_ms:1000,end_ms:4000});
  await page.locator('.ameow-peek').screenshot({path:output+'/'+fixture.site+'-editing.png'});
  await page.evaluate(()=>{document.querySelector('.fixture-hidden-video').remove();document.querySelector('#fixture-feed-player')?.remove();});
  // Two truly visible videos in the current player remain an authoritative ambiguity.
  await page.evaluate(async()=>{const second=originalVideo.cloneNode();second.className='fixture-visible-video';second.style.cssText='position:absolute;inset:0;width:100%;height:100%';originalPlayer.append(second);await ameowPageTools.refresh();});
  assert.equal(await page.locator('.ameow-peek,ameow-page-tools').count(),0);
  await page.evaluate(async()=>{document.querySelector('.fixture-visible-video').remove();await ameowPageTools.refresh();ameowPageTools.openPeek();});
  await page.locator('.ameow-peek[data-transition]').waitFor({state:'detached'});
  await page.keyboard.press('Escape');await page.locator('.ameow-peek').waitFor({state:'detached'});
  assert.equal(await page.locator('ameow-page-tools').count(),1);
  await page.evaluate(()=>ameowPageTools.stop());
  report.checks.push({site:fixture.site,poll_during_marker_drag:'PASS',same_player_and_draft:'PASS',real_ambiguity_rejected:'PASS',capsule_restored:'PASS'});
  await page.close();
 }
}catch(error){report.error=error.stack;throw error;}
finally{await browser.close();await writeFile(output+'/report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
