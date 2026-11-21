// Only the page-local Chrome API boundary is replaced; the popup itself is the product bundle.
const samples = globalThis.ameowPopupSamples;
const params = new URLSearchParams(location.search);
Object.defineProperty(navigator, 'language', {value: params.get('lang') === 'en' ? 'en' : 'zh-CN'});
Object.defineProperty(navigator, 'userAgent', {value: navigator.userAgent + ' Edg/130.0.0.0'});
Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => { globalThis.manualCopiedDiagnostic = text; }}});
let state = params.get('sample') || 'not_authorized';
if (!Object.hasOwn(samples.status_response, state)) state = 'not_authorized';
const preferenceKey = 'manual-page-tools-' + samples.site;
const stored = sessionStorage.getItem(preferenceKey);
let enabled = stored === null ? samples.other_messages.pages_status.value.enabled : stored === 'on';
const permission = params.get('tools') !== 'permission_unavailable';
if (!permission) enabled = false;
globalThis.chrome = {
  tabs: {query: async () => [structuredClone(samples.tab)]},
  permissions: {request: async () => permission},
  runtime: {sendMessage: async message => {
    if (message.action === 'pages-status') return {ok:true,value:{enabled}};
    if (message.action === 'pages-set') { enabled = message.enabled; sessionStorage.setItem(preferenceKey,enabled ? 'on' : 'off'); return {ok:true,value:{enabled}}; }
    if (message.action === 'status') return structuredClone(samples.status_response[state]);
    if (message.action === 'authorize' || message.action === 'sync') {
      state = 'saved'; return {ok:true,value:{[samples.site]:'synced'}};
    }
    if (message.action === 'revoke') { state = 'not_authorized'; return {ok:true,value:{[samples.site]:'revoked'}}; }
    throw Error('Unsupported example action');
  }}
};
addEventListener('message', event => {
  if (event.source !== parent || event.origin !== location.origin || event.data?.kind !== 'manual-theme') return;
  // Read the exact light/dark palette from the original product stylesheet.
  const rules = [...document.styleSheets[0].cssRules];
  const light = rules.find(rule => rule.selectorText === ':root').style.cssText;
  const dark = rules.find(rule => rule.conditionText?.includes('prefers-color-scheme: dark'))?.cssRules[0].style.cssText || '';
  document.documentElement.style.cssText = light + (event.data.theme === 'dark' ? ';' + dark : '');
  document.documentElement.style.colorScheme = event.data.theme;
});
addEventListener('load', () => parent.postMessage({kind:'manual-popup-ready'},location.origin));
new ResizeObserver(() => parent.postMessage({kind:'manual-popup-size',height:document.querySelector('main').getBoundingClientRect().height},location.origin)).observe(document.querySelector('main'));
