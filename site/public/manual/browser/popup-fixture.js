// Offline state for the unchanged extension popup. No browser account APIs exist here.
let enabled=false,grant=null,row=null;
const source='manual-chrome',site='bilibili.com';
globalThis.chrome={tabs:{query:async()=>[{id:1,url:'https://www.bilibili.com/video/BV17x411w7KC/'}]},permissions:{request:async()=>true},runtime:{sendMessage:async message=>{
  let value;
  if(message.action==='pages-status')value={enabled};
  else if(message.action==='pages-set'){enabled=message.enabled;value={enabled};}
  else if(message.action==='status')value={source_id:source,sites:row?[row]:[],grant};
  else if(message.action==='authorize'||message.action==='sync'){grant={last_sync:1795176000000};row={site,source_id:source,source_name:'Chrome / Chromium',synced_at:1795176000,last_result:{}};value={[site]:'synced'};}
  else if(message.action==='revoke'){row=null;grant=null;value={[site]:'revoked'};}
  else throw Error('Unavailable outside the illustration');
  return {ok:true,value};
}}};
addEventListener('message',event=>{if(event.source!==parent||event.data?.kind!=='manual-theme')return;const dark=event.data.theme==='dark';Object.assign(document.documentElement.style,{colorScheme:dark?'dark':'light',color:dark?'#f0f1f3':'#303238',background:dark?'#232427':'#fff'});for(const [key,value]of Object.entries(dark?{secondary:'#a5a8ad',control:'#35373c',hover:'#464950',focus:'#3d9aff',danger:'#ff8c94'}:{secondary:'#62656b',control:'#f1f2f4',hover:'#e5e7eb',focus:'#0285ff',danger:'#b8323c'}))document.documentElement.style.setProperty('--'+key,value);});
addEventListener('load',()=>parent.postMessage({kind:'manual-popup-ready'},location.origin));
new ResizeObserver(()=>parent.postMessage({kind:'manual-popup-size',height:document.querySelector('main').getBoundingClientRect().height},location.origin)).observe(document.querySelector('main'));
