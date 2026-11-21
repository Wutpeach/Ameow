export function frameTheme(element,kind){
  const frame=element.querySelector('iframe');
  const update=()=>frame.contentWindow?.postMessage({kind:'manual-theme',theme:document.documentElement.dataset.theme||'light'},location.origin);
  const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  const receive=event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin)return;if(event.data?.kind==='manual-'+kind+'-ready')update();if(kind==='popup'&&event.data?.kind==='manual-popup-size')frame.style.height=Math.ceil(event.data.height)+2+'px';};
  addEventListener('message',receive);frame.addEventListener('load',update);update();
  return()=>{observer.disconnect();removeEventListener('message',receive);frame.removeEventListener('load',update);};
}
