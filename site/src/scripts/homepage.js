import { homepageAssets as ASSETS } from './homepage-assets.js';
import MOTION from '../data/homepage-motion.json';

(() => {
 'use strict';
 const $ = s => document.querySelector(s);
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const toggle = $('.motion-toggle');
 const dialog = $('.preview');
 const previewVideo = $('.preview-video');
 const previewImage = $('.preview-image');
 const cat = $('#grab'), rear = $('#rear'), closing = $('#closing');
 const catBox = $('.grab-cat'), card = $('.file-dance'), save = $('#save');
 const scenes = [...document.querySelectorAll('.scene')].map(el => ({el, visible:false, seen:false, t:0, delay:0, entrances:0}));
 const ctx = canvas => { const c=canvas.getContext('2d'); c.imageSmoothingEnabled=false; return c; };
 const contexts = new Map([cat,rear,closing,...document.querySelectorAll('.dance-canvas')].map(c=>[c,ctx(c)]));
 const images = {};
 let paused=false, ready=false, raf=0, last=0, hoverHold=false, hoverTimer=0;
 let lastRear=-1, lastGrab=-1, lastDance=-1, lastBlink=-1, currentX=0;
 let pointer={x:-1,y:-1};
 addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY}},{passive:true});
 const asset = name => ASSETS[name];
 const load = name => new Promise((resolve,reject) => {const im=new Image();im.onload=()=>{images[name]=im;resolve(im)};im.onerror=()=>reject(new Error('Image unavailable: '+name));im.src=asset(name)});
 const freeze = () => paused || reduced.matches || document.hidden || dialog.open;
 const sprite = (canvas,name,index,w,h,columns) => {
  const c=contexts.get(canvas);c.clearRect(0,0,canvas.width,canvas.height);
  c.drawImage(images[name],index%columns*w,Math.floor(index/columns)*h,w,h,0,0,canvas.width,canvas.height);
 };
 function alignCat(){
  if(!ready)return;
  const tip=MOTION.grab.pawTips[MOTION.grab.contactFrame];
  catBox.style.left=(card.offsetLeft-tip/MOTION.grab.frameWidth*catBox.offsetWidth+8)+'px';
 }
 function drawRear(index){if(index===lastRear)return;lastRear=index;sprite(rear,'rear-sheet.png',index,848,576,6)}
 function drawGrab(index){if(index===lastGrab)return;lastGrab=index;const m=MOTION.grab;sprite(cat,'grab-sheet.png',index,m.frameWidth,m.frameHeight,m.columns)}
 function drawDance(index){
  if(index===lastDance)return;lastDance=index;const m=MOTION.dancer;
  for(const c of document.querySelectorAll('.dance-canvas'))sprite(c,'dancer-sheet.png',index,m.frameWidth,m.frameHeight,m.columns);
 }
 function drawBlink(index){
  if(index===lastBlink)return;lastBlink=index;const c=contexts.get(closing);
  c.drawImage(images['closing.png'],0,0);
  if(index)c.drawImage(images['eyes-sheet.png'],index*720,0,720,255,0,470,720,255);
 }
 function blinkAt(t){
  const p=t%6.5;
  const one = start => {const n=Math.floor((p-start)*8);return n>=0&&n<3?[1,2,1][n]:0};
  return one(4.5) || (Math.floor(t/6.5)%3===2?one(5.1):0);
 }
 function pointAt(frame){
  const a=MOTION.grab.pawTips,lo=Math.min(a.length-1,Math.floor(frame)),hi=Math.min(a.length-1,lo+1);
  return a[lo]+(a[hi]-a[lo])*(frame-lo);
 }
 function updateSave(t){
  const m=MOTION.grab,p=t%9,frame=p<6?Math.min(m.frames-1,Math.floor(p*8)):0;
  drawGrab(frame);
  const contact=m.contactFrame/8,release=m.releaseFrame/8;
  const scale=catBox.offsetWidth/m.frameWidth;
  let x=0,phase='rest';
  if(p>=contact&&p<release){
   x=(pointAt(p*8)-m.pawTips[m.contactFrame])*scale;
   phase=p<m.nearestFrame/8?'pull':'hold';
  }else if(p>=release&&p<release+1.25){
   const from=(m.pawTips[m.releaseFrame-1]-m.pawTips[m.contactFrame])*scale;
   const u=p-release;x=from*Math.exp(-5.5*u)*(Math.cos(10*u)+.55*Math.sin(10*u));phase='release';
  }else if(p>=.75&&p<contact)phase='reach';
  currentX=x;const width=card.offsetWidth;
  card.style.transform=`translate3d(${x.toFixed(3)}px,${(-Math.max(0,-x)/Math.max(width,1)*14).toFixed(3)}px,0) rotate(${(x/Math.max(width,1)*4).toFixed(3)}deg)`;
  save.dataset.phase=phase;save.dataset.frame=String(frame);
  return p>=contact&&p<release+1.25;
 }
 function renderStatic(){
  if(!ready)return;drawRear(0);drawGrab(0);drawDance(0);drawBlink(0);card.style.transform='none';currentX=0;save.dataset.phase='static';
 }
 function tick(now){
  raf=0;if(!ready||freeze()){last=0;return;}
  const dt=last?Math.min(now-last,60):0;last=now;
  // Scrolling can move a target away without a pointerleave event.
  const pointed=document.elementFromPoint(pointer.x,pointer.y)?.closest('[data-preview]');
  hoverHold=!!pointed||document.activeElement?.matches('[data-preview]');
  const held=pointed?.closest('.scene')||(document.activeElement?.matches('[data-preview]')?document.activeElement.closest('.scene'):null);
  for(const s of scenes){if(s.visible&&s.el!==held){if(s.delay>0)s.delay=Math.max(0,s.delay-dt);else s.t+=dt/1000}}
  if(scenes[0].visible){const p=scenes[0].t%7;drawRear(p>=1.25&&p<4.25?Math.min(23,Math.floor((p-1.25)*8)):0)}
  let holdDancer=false;if(scenes[1].visible)holdDancer=updateSave(scenes[1].t);
  if(scenes[0].visible||scenes[1].visible){const t=scenes[1].visible?scenes[1].t:scenes[0].t;drawDance(holdDancer?0:Math.floor(t*8)%MOTION.dancer.frames)}
  if(scenes[2].visible)drawBlink(blinkAt(scenes[2].t));
  if(scenes.some(s=>s.visible))raf=requestAnimationFrame(tick);
 }
 function wake(){if(!raf&&!freeze()&&ready&&scenes.some(s=>s.visible)){last=0;raf=requestAnimationFrame(tick)}}
 function controls(){
  const stopped=paused||reduced.matches;toggle.setAttribute('aria-pressed',String(stopped));
  const label=reduced.matches?'系统已减少动态':paused?'继续动效':'暂停动效';
  toggle.setAttribute('aria-label',label);toggle.title=label;
  if(stopped){if(raf)cancelAnimationFrame(raf);raf=0;last=0;for(const a of document.getAnimations())reduced.matches?a.finish():a.pause();if(reduced.matches)renderStatic()}else{for(const a of document.getAnimations())if(a.playState==='paused')a.play();wake()}
 }
 toggle.addEventListener('click',()=>{if(reduced.matches)return;paused=!paused;controls()});
 reduced.addEventListener('change',()=>{controls();if(!reduced.matches)for(const s of scenes)s.delay=700});
 document.addEventListener('visibilitychange',()=>{last=0;if(!document.hidden){for(const s of scenes)if(s.visible)s.delay=700;wake()}});
 function entrance(s){
  if(s.seen)return;s.seen=true;s.entrances++;
  if(reduced.matches||paused)return;
  const ease='cubic-bezier(.16,1,.3,1)';
  if(s===scenes[0])$('.hero-cat').animate([{transform:'translateX(58px)'},{transform:'none'}],{duration:620,easing:ease});
  if(s===scenes[1]){
   $('.file-dance').animate([{translate:'0 46px'},{translate:'0 0'}],{duration:650,easing:ease});
   $('.file-flower').animate([{translate:'0 70px'},{translate:'0 0'}],{duration:700,delay:110,easing:ease});
   catBox.animate([{transform:'translateX(-65px)'},{transform:'none'}],{duration:650,easing:ease});
  }
  if(s===scenes[2]){s.el.classList.add('revealing');setTimeout(()=>s.el.classList.remove('revealing'),700)}
  s.delay=850;
 }
 const observer=new IntersectionObserver(entries=>{
  for(const e of entries){const s=scenes.find(s=>s.el===e.target),was=s.visible;s.visible=e.isIntersecting&&e.intersectionRatio>.3;
   if(s.visible){entrance(s);if(!was)s.delay=Math.max(s.delay,650)}
  }wake();
 },{threshold:[0,.3,.4,.6]});
 for(const s of scenes)observer.observe(s.el);
 function holdPointer(on){clearTimeout(hoverTimer);if(on)hoverHold=true;else hoverTimer=setTimeout(()=>{hoverHold=false;last=0;wake()},250)}
 for(const b of document.querySelectorAll('[data-preview]')){
  b.addEventListener('pointerenter',()=>holdPointer(true));b.addEventListener('pointerleave',()=>holdPointer(false));
  b.addEventListener('focus',()=>holdPointer(true));b.addEventListener('blur',()=>holdPointer(false));
  b.addEventListener('click',()=>openPreview(b.dataset.preview));
 }
 function openPreview(kind){
  const video=kind==='video';$('#preview-title').textContent=video?'舞蹈.mp4':'黄花.jpg';
  previewVideo.hidden=!video;previewImage.hidden=video;
  const download=$('.preview-download');download.href=asset(video?'dancer-loop.mp4':'flower.jpg');download.download=video?'舞蹈.mp4':'黄花.jpg';
  download.textContent=video?'下载示例视频':'下载示例图片';
  if(video){previewVideo.src=asset('dancer-loop.mp4');previewVideo.play().catch(()=>{})}else previewVideo.pause();
  dialog.showModal();last=0;
 }
 $('.preview-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 dialog.addEventListener('close',()=>{previewVideo.pause();hoverHold=false;last=0;for(const s of scenes)if(s.visible)s.delay=650;wake()});
 addEventListener('resize',alignCat);
 window.__ameowMotion=Object.freeze({snapshot:()=>({ready,paused,reduced:reduced.matches,hidden:document.hidden,hoverHold,cardX:currentX,
  frame:Number(save.dataset.frame||0),phase:save.dataset.phase,
  scenes:scenes.map(s=>({id:s.el.id,visible:s.visible,time:s.t,entrances:s.entrances})),
  pawAtFrame:MOTION.grab.pawTips[Number(save.dataset.frame||0)],
  contactGap:8})});
 Promise.all(['rear-sheet.png','grab-sheet.png','dancer-sheet.png','closing.png','eyes-sheet.png'].map(load)).then(()=>{
  ready=true;alignCat();renderStatic();controls();wake();document.body.dataset.ready='true';
 }).catch(error=>{console.error(error);document.body.dataset.ready='failed'});
})();
