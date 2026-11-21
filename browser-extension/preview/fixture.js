// Product HTML/CSS/JS stay intact. Only this local browser-API boundary is synthetic.
window.__popupPreviewReady = (async () => {
  const {sites, scenarios} = await import('/scenarios.js');
  const params = new URLSearchParams(location.search);
  let scene = scenarios.some(([id]) => id === params.get('scene')) || params.get('scene') === 'other-source' ? params.get('scene') : 'unauthorized';
  const site = sites[params.get('site')] || sites.bilibili;
  const language = params.get('language') === 'en' ? 'en' : 'zh-CN';
  let tools = params.get('tools') || 'on';
  let enabled = site.tools && tools === 'on';
  let responseSettled = false;
  const sourceId = 'a'.repeat(32), grantId = 'b'.repeat(32), at = Math.floor(Date.now() / 1000) - 120;
  const preview = {calls: [], copied: null, ready: false};
  window.__popupPreview = preview;
  Object.defineProperty(navigator, 'language', {value: language, configurable: true});
  Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {preview.copied = text; setTimeout(report, 0);}}, configurable: true});
  const sourceName = navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Chrome / Chromium';
  const row = () => ({site: site.domain, source_id: sourceId, source_name: sourceName,
    grant_id: grantId, synced_at: at, cookie_count: 3, skipped_partitioned: 0, last_result: {at: at + 1, error: null}});
  const grant = () => ({grant_id: grantId, source_name: sourceName, last_sync: at * 1000, pending: false});
  function state() {
    const basic = {sites: [], source_id: sourceId};
    if (scene === 'unknown') return null;
    if (scene === 'unauthorized') return basic;
    if (scene === 'pending') return {...basic, grant: {...grant(), last_sync: undefined, pending: true}};
    if (['bridge', 'registration', 'protocol'].includes(scene)) return {...basic, grant: grant(),
      error: {bridge: 'E_BRIDGE', registration: 'E_BRIDGE_NOT_REGISTERED', protocol: 'E_SESSION_PROTOCOL'}[scene]};
    const current = row();
    if (scene === 'other-source') return {...basic, sites: [{...current, source_id: 'c'.repeat(32), source_name: sourceName === 'Microsoft Edge' ? 'Chrome / Chromium' : 'Microsoft Edge'}]};
    const own = {...basic, sites: [current], grant: grant()};
    if (scene === 'empty' || scene === 'partitioned') {current.cookie_count = 0; current.skipped_partitioned = scene === 'partitioned' ? 2 : 0;}
    if (scene === 'unknown-result') current.last_result = null;
    if (scene === 'failed' || scene === 'permission') {
      const error = scene === 'failed' ? 'E_COOKIE_READ' : 'E_PERMISSION';
      current.last_result = {at: at + 60, error}; own.grant.error = error;
    }
    return own;
  }
  function send(data) {parent.postMessage({kind: 'popup-preview', generation: params.get('generation'), ...data}, location.origin);}
  function report() {
    const main = document.querySelector('main');
    if (!main) return;
    const siteReady = Boolean(document.querySelector('#site').textContent);
    preview.ready = !document.documentElement.hasAttribute('data-initializing') && (responseSettled && siteReady || site.domain === null && Boolean(document.querySelector('#status').textContent));
    send({height: Math.ceil(main.getBoundingClientRect().height), width: Math.round(document.documentElement.getBoundingClientRect().width), ready: preview.ready,
      connection: document.querySelector('#connection').textContent,
      status: document.querySelector('#status').textContent || (document.querySelector('#sync').hidden ? (document.querySelector('#authorize').hidden ? '' : language === 'en' ? 'Not authorized' : '未授权') : document.querySelector('#sync').innerText),
      toolsVisible: !document.querySelector('#page-tools').hidden,
      toolsEnabled: document.querySelector('#toggle-tools').getAttribute('aria-pressed') === 'true',
      diagnostics: false, copied: preview.copied !== null});
  }
  const mock = {
    tabs: {query: async () => [{id: 1, url: site.url}]},
    permissions: {request: async request => {
      preview.calls.push({permission: request});
      const pageAccess = request.origins.some(origin => ['https://www.bilibili.com/*', 'https://www.youtube.com/*'].includes(origin));
      return !pageAccess || tools !== 'missing';
    }},
    runtime: {sendMessage: async message => {
      preview.calls.push(message);
      if (message.action === 'pages-status') return {ok: true, value: {enabled}};
      if (message.action === 'pages-set') {enabled = message.enabled; tools = enabled ? 'on' : 'off'; setTimeout(report, 0); return {ok: true, value: {enabled}};}
      if (message.action === 'status') {setTimeout(() => {responseSettled = true; report();}, 0); return {ok: true, value: state()};}
      if (['authorize', 'sync', 'revoke'].includes(message.action)) {
        // An explicit action demonstrates a successful recovery, without real permissions or I/O.
        await new Promise(resolve => setTimeout(resolve, 180));
        scene = message.action === 'revoke' ? 'unauthorized' : 'synced';
        return {ok: true, value: {[site.domain]: message.action === 'revoke' ? 'revoked' : 'synced'}};
      }
      throw Error('Unsupported preview action: ' + message.action);
    }},
  };
  window.chrome = mock;
  // Use the product's exact root palette; do not rewrite any selectors or dimensions.
  const rules = [...document.styleSheets[0].cssRules];
  const light = rules.find(rule => rule.selectorText === ':root').style.cssText;
  const dark = rules.find(rule => rule.conditionText?.includes('prefers-color-scheme: dark'))?.cssRules[0].style.cssText;
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.style.cssText = light + (theme === 'dark' ? ';' + dark : '');
  document.documentElement.style.colorScheme = theme;
  new ResizeObserver(report).observe(document.querySelector('main'));
  addEventListener('resize',report);
  new MutationObserver(report).observe(document.documentElement, {attributes:true, attributeFilter:['data-initializing']});
  new MutationObserver(report).observe(document.querySelector('main'), {subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-pressed', 'open', 'disabled', 'data-ready', 'data-error']});
})().catch(error => {parent.postMessage({kind: 'popup-preview-error', message: error.message}, location.origin); throw error;});
