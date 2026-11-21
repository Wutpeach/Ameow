const video=document.querySelector('video');let pending={time:0,start:null,end:null},theme='light',ready=false;
globalThis.chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage:async message=>{if(message.action==='page-binding')return{ok:true,value:{key:'manual:video',url:'https://www.bilibili.com/video/BV17x411w7KC/',duration:video.duration}};throw Error('No download or Native connection in this illustration');}}};
function palette(){document.documentElement.dataset.theme=theme;for(const host of document.querySelectorAll('ameow-peek-controls,ameow-page-tools'))for(const[key,value]of Object.entries(theme==='dark'?{surface:'#232427',text:'#e6e7e9',muted:'#a5a8ad',control:'#2b2c2f',hover:'#2e3033',line:'#2e3033',focus:'#3d9aff'}:{surface:'#fff',text:'#292a2c',muted:'#62656b',control:'#f2f2f3',hover:'#ecedef',line:'#ecedef',focus:'#0285ff'}))host.style.setProperty('--'+key,value);}
function apply(){const tools=globalThis.ameowPageTools;if(!ready)return;if(!tools.controls){tools.openPeek();protect(tools);}video.pause();if(Math.abs(video.currentTime-pending.time)>.01)video.currentTime=pending.time;tools.setDraft(pending.start,pending.end);tools.updatePlayback();palette();}
const held=new Set();
function interact(phase,id){parent.postMessage({kind:'manual-clip-interact',phase,id},location.origin);}
for(const name of['pointerup','pointercancel','keyup'])addEventListener(name,event=>{const id=name==='keyup'?'key:'+event.code:'pointer:'+event.pointerId;if(held.delete(id))interact('end',id);},true);
addEventListener('blur',()=>{for(const id of held)interact('end',id);held.clear();});
function protect(tools){
 tools.submit=async()=>{};
 const update=tools.updateFields.bind(tools);
 tools.updateFields=()=>{update();if(tools.submitButton){tools.submitButton.disabled=true;tools.submitButton.title='交互图中不提交下载';}};
 tools.updateFields();
 for(const name of['pointerdown','keydown'])tools.controls.addEventListener(name,event=>{
  if(!event.isTrusted)return;const id=name==='keydown'?'key:'+event.code:'pointer:'+event.pointerId;
  held.add(id);interact('start',id);
 },true);
 for(const name of['click','input'])tools.controls.addEventListener(name,event=>{if(event.isTrusted)interact('update',name);},true);
 for(const name of['click','pointerup','keyup','input'])tools.controls.addEventListener(name,()=>queueMicrotask(()=>parent.postMessage({kind:'manual-clip-state',state:{time:video.currentTime,start:tools.draft.start_ms,end:tools.draft.end_ms}},location.origin)));
}
function bind(){const tools=globalThis.ameowPageTools;if(!tools?.binding){setTimeout(bind,30);return;}tools.openPeek();clearTimeout(tools.timer);tools.stopped=true;protect(tools);ready=true;apply();parent.postMessage({kind:'manual-clip-ready'},location.origin);}
video.addEventListener('loadeddata',()=>{const script=document.createElement('script');script.src='vendor/page.js';script.onload=bind;document.body.append(script);},{once:true});
addEventListener('message',event=>{if(event.source!==parent)return;if(event.data?.kind==='manual-clip-set'){pending=event.data.state;apply();}if(event.data?.kind==='manual-theme'){theme=event.data.theme;palette();}});
