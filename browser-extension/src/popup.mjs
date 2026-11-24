import { siteFromUrl, SYNC_ERRORS } from './core.mjs';
import { PAGE_ORIGINS, pageHost } from './page-core.mjs';
import copyIcon from '../../assets/copy.svg';
import checkIcon from '../../assets/check.svg';
import refreshIcon from '../../assets/rotate-ccw.svg';
import alertIcon from '../../assets/circle-alert.svg';
import infoIcon from '../../assets/info.svg';
import chevronIcon from '../../assets/chevron-down.svg';
const icons = {copy:copyIcon, check:checkIcon, refresh:refreshIcon, alert:alertIcon, info:infoIcon, chevron:chevronIcon};
const $ = id => document.getElementById(id);
const english = (navigator.language || '').toLowerCase().startsWith('en');
const t = (zh, en) => english ? en : zh;
document.documentElement.lang = english ? 'en' : 'zh-CN';
let site, current, sourceId, lastGrant, lastError, connectionState = 'unknown', host, tabId, toolsEnabled = false;
let copiedTimer, feedbackTimer, diagnosticReport = '', authorized = false, pending = false, busy = '', syncedFeedback = false, stateKnown = false;
let tabGeneration = 0, sessionGeneration = 0, toolsGeneration = 0, pendingTimer;
const READ_TIMEOUT_MS = 5000;
async function boundedRead(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('E_BRIDGE')), READ_TIMEOUT_MS); })]); }
  finally { clearTimeout(timer); }
}
const sourceName = navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Chrome / Chromium';
const errorEn = { E_COOKIE_READ:'Could not read browser cookies', E_BRIDGE:'Browser connection failed', E_SESSION_STORAGE:'Session storage failed', E_SESSION_LIMIT:'Session exceeds the sync limit', E_SESSION_INVALID:'Session data was not accepted', E_SESSION_PROTOCOL:'Browser bridge is incompatible', E_SESSION_STALE:'Sync message expired', E_PERMISSION:'Site permission was removed', E_SESSION_REVOKED:'Site authorization was removed', E_SESSION_SOURCE_CHANGED:'Site source changed', E_BRIDGE_NOT_REGISTERED:'Browser bridge registration was not found', E_BRIDGE_FORBIDDEN:'Browser denied the connection', E_BRIDGE_START:'Browser bridge could not start', E_BRIDGE_EXIT:'Browser bridge exited', E_BRIDGE_IO:'Browser connection failed' };
const errorText = code => { const messages = english ? errorEn : SYNC_ERRORS; return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : t('原因未知', 'Reason unknown'); };
const date = value => Number.isFinite(value) && value > 0 && value < 8640000000000000 ? new Date(value).toLocaleString(english ? 'en' : 'zh-CN') : t('未知', 'Unknown');
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : t('未知', 'Unknown');
const safeSource = value => ['Microsoft Edge', 'Chrome / Chromium'].includes(value) ? value : t('未知来源', 'Unknown source');
function connection(kind) {
  connectionState = kind;
  const full = kind === 'ready' ? t('扩展连接就绪','Extension connection ready') : kind === 'unavailable' ? t('扩展连接不可用','Extension connection unavailable') : kind === 'checking' ? t('正在检查扩展连接','Checking extension connection') : t('扩展连接未知','Extension connection unknown');
  $('connection').textContent = kind === 'ready' ? t('就绪','Ready') : kind === 'unavailable' ? t('未连接','Disconnected') : kind === 'checking' ? t('连接中','Connecting') : t('未知','Unknown');
  $('connection').setAttribute('aria-label', full);
  $('connection-title').textContent = full;
  $('connection-detail').textContent = kind === 'ready' ? t('可同步本站登录态。','Site session sync is available.') : kind === 'checking' ? t('正在检查扩展连接。','Checking extension connection.') : t('请检查扩展配置后重试。','Check extension setup and retry.');
  $('connection').toggleAttribute('data-ready', kind === 'ready'); $('connection').toggleAttribute('data-error', kind === 'unavailable');
}
function status(text, detail = '', error = false) {
  $('notice').hidden = !text || connectionState === 'unavailable';
  $('status').textContent = text; $('status-detail').textContent = detail;
  $('notice').setAttribute('aria-label', text + t('，查看提示','; view details'));
  $('notice').title = text;
  $('notice').toggleAttribute('data-error', error);
  $('notice').replaceChildren(makeIcon(error ? 'alert' : 'info'));
  if (connectionState === 'unavailable' && detail) $('connection-detail').textContent = detail;
  if (!text && $('session-help').matches(':popover-open')) $('session-help').hidePopover();
  if (text) $('announcement').textContent = text;
}
function makeIcon(name, hover = false) {
  const mark=document.createElement('span'); mark.className='icon icon-'+name; mark.setAttribute('aria-hidden','true');
  // Trusted project SVGs are bundled into popup.js, without new runtime asset paths.
  mark.innerHTML=icons[name]+(hover?icons.refresh:'');
  if(hover)mark.lastElementChild.classList.add('icon-alt');
  return mark;
}
function paintButton(button, text, icon, hover) {
  const children = [];
  if (icon) children.push(makeIcon(icon,Boolean(hover)));
  const label = document.createElement('span'); label.className = 'action-label';
  const normal = document.createElement('span'); normal.className = 'label-default'; normal.textContent = text; label.append(normal);
  if (hover) { const alternate = document.createElement('span'); alternate.className = 'label-hover'; alternate.textContent = hover; alternate.setAttribute('aria-hidden','true'); label.append(alternate); }
  if (text) children.push(label);
  button.replaceChildren(...children);
}
function controls() {
  const working = Boolean(busy) || pending && !lastError;
  $('authorize').disabled = working || !stateKnown; $('sync').disabled = working || !stateKnown; $('revoke').disabled = working;
  $('revoke').textContent = busy === 'revoke' ? t('移除中','Removing') : t('移除授权','Remove access');
  $('sync').setAttribute('aria-busy', String(working));
  $('authorize').setAttribute('aria-busy', String(busy === 'authorize'));
  paintButton($('authorize'), busy === 'authorize' ? t('授权中','Allowing') : t('授权','Authorize'), busy === 'authorize' ? 'refresh' : null);
  const needsPermission = lastError === 'E_PERMISSION';
  const text = working ? t('同步中','Syncing') : needsPermission ? t('重新授权','Allow again') : syncedFeedback ? t('已同步','Synced') : t('已授权','Allowed');
  const hover = !working && !needsPermission && !syncedFeedback ? t('同步','Sync') : null;
  paintButton($('sync'), text, working ? 'refresh' : needsPermission ? null : 'check', hover);
  $('sync').toggleAttribute('data-authorized', Boolean(hover));
  $('sync').setAttribute('aria-label', working ? t('正在同步登录态','Syncing site session') : needsPermission ? t('重新授权并同步本站登录态','Allow access and sync this site') : t('已授权，点击同步本站登录态','Site authorized; sync this site'));
  $('sync').title = needsPermission ? t('重新授权并同步','Allow access and sync') : t('点击同步登录态','Sync this site session');
  $('authorize').setAttribute('aria-label', t('授权并同步本站登录态','Authorize and sync this site'));
}
function recovery(code) {
  if (code === 'E_PERMISSION') return t('站点权限已移除，请重新授权后同步。','Site permission was removed. Allow access and sync again.');
  if (code === 'E_COOKIE_READ') return t('无法读取浏览器会话，请检查浏览器后重试。','Could not read the browser session. Check your browser and retry.');
  if (/^E_BRIDGE(?:_|$)/.test(code || '')) return t('扩展连接不可用，请检查扩展配置与 Ameow 后重试。','Extension connection unavailable. Check extension setup and Ameow, then retry.');
  if (code === 'E_SESSION_PROTOCOL') return t('扩展连接组件不兼容，请更新 Ameow 后重试。','Extension connection is incompatible. Update Ameow and retry.');
  if (code === 'E_SESSION_STORAGE') return t('无法保存会话，请检查存储空间后重试。','Could not save the session. Check storage and retry.');
  if (code === 'E_SESSION_REVOKED' || code === 'E_SESSION_SOURCE_CHANGED') return t('授权已变更，请重新授权。','Access changed. Authorize again.');
  return t('同步遇到问题，请检查连接后重试。','Sync encountered a problem. Check the connection and retry.');
}
async function send(action, extra = {}) {
  let response;
  try { response = await chrome.runtime.sendMessage({ action, site, ...extra }); }
  catch { throw Error('E_BRIDGE'); }
  if (!response?.ok) throw Error(response?.error || 'E_BRIDGE');
  return response.value;
}
function updateDiagnostic() {
  const unknown = t('未知','Unknown');
  const row = current, grant = lastGrant;
  const source = safeSource(row?.source_name || grant?.source_name);
  const snapshot = date(row?.synced_at ? row.synced_at * 1000 : grant?.last_sync);
  const result = row?.last_result;
  const latest = result ? `${date(result.at * 1000)} · ${result.error ? errorText(result.error) : t('同步成功','Sync succeeded')}` : unknown;
  const count = Number.isSafeInteger(row?.cookie_count) && row.cookie_count >= 0 ? row.cookie_count : unknown;
  const excluded = Number.isSafeInteger(row?.skipped_partitioned) && row.skipped_partitioned >= 0 ? row.skipped_partitioned : unknown;
  // Only fixed labels and validated, bounded session projection fields enter the report.
  const domain = typeof site === 'string' && site.length <= 253 && /^[a-z0-9.-]+$/i.test(site) ? site : unknown;
  diagnosticReport = [
    `${t('站点','Site')}: ${domain}`,
    `${t('扩展连接','Extension connection')}: ${connectionState === 'ready' ? t('就绪','Ready') : connectionState === 'unavailable' ? t('不可用','Unavailable') : unknown}`,
    `${t('浏览器','Browser')}: ${source}`,
    `${t('安装来源','Installation')}: ${safeId(row?.source_id || sourceId)}`,
    `${t('保留的快照','Retained snapshot')}: ${snapshot}`,
    `${t('最近结果','Latest result')}: ${latest}`,
    ...(lastError ? [`${t('当前错误','Current error')}: ${errorText(lastError)}`] : []),
    `Cookie: ${count}`,
    `${t('分区 Cookie 已排除','Partitioned cookies excluded')}: ${excluded}`,
  ].join('\n');
}
function render(state) {
  state = state && typeof state === 'object' ? state : {};
  const valid = !state.error && Array.isArray(state.sites);
  const unavailable = /^E_BRIDGE(?:_|$)|^E_SESSION_PROTOCOL$/.test(state.error || '');
  connection(valid ? 'ready' : unavailable ? 'unavailable' : 'unknown');
  sourceId = state.source_id;
  if (valid) current = state.sites.find(row => row?.site === site);
  const grant = state.grant, own = current ? current.source_id === sourceId : Boolean(grant);
  lastGrant = grant;
  authorized = own; stateKnown = valid || own; pending = Boolean(own && grant?.pending);
  clearTimeout(pendingTimer);
  $('page-unavailable').hidden = true;
  $('session-loading').hidden = true;
  $('authorize').hidden = !valid || own; $('sync').hidden = !own; $('revoke').hidden = !own;
  $('site-actions').hidden = !own;
  if (!own && $('site-menu').matches(':popover-open')) $('site-menu').hidePopover();
  $('retry-status').hidden = valid || own;
  const ownRow = own ? current : undefined;
  lastError = state.error || (own && grant?.error) || ownRow?.last_result?.error;
  if (lastError) status(t('同步未完成','Sync did not complete'), recovery(lastError), true);
  else if (pending) status('');
  else if (ownRow?.cookie_count === 0) status(t('暂无登录态','No session available'), t('先在本站登录，再点击同步。','Sign in on this site, then sync again.'));
  else if (ownRow && !ownRow.last_result) status(t('同步结果未知','Sync status unknown'), t('点击同步以更新状态。','Sync to update the status.'));
  else if (ownRow) status('');
  else status(valid ? '' : t('会话状态暂不可确认','Session status unavailable'));
  controls();
  updateDiagnostic();
  if (pending && !lastError) pendingTimer = setTimeout(() => {
    if (!pending || lastError || busy) return;
    $('sync').hidden = true; $('retry-status').hidden = false;
    status(t('同步尚未完成','Sync is still pending'), t('点击重试以读取最新状态。','Retry to read the latest status.'));
  }, READ_TIMEOUT_MS);
}
async function refresh() {
  const generation = ++sessionGeneration;
  try {
    const state = await boundedRead(send('status'));
    if (generation === sessionGeneration) render(state);
  } catch (error) { if (generation === sessionGeneration) throw error; }
}
$('retry-status').addEventListener('click', async () => {
  if (!site) { void loadTab(); return; }
  $('session-loading').hidden = false; $('retry-status').hidden = true;
  connection('checking'); updateDiagnostic();
  $('retry-status').disabled = true;
  try { await refresh(); }
  catch (error) {
    $('session-loading').hidden = true; $('retry-status').hidden = false;
    connection('unavailable'); lastError = error.message; updateDiagnostic();
    status(t('扩展连接不可用','Extension connection unavailable'), t('请重试。','Try again.'), true);
  }
  finally { $('retry-status').disabled = false; }
});
$('retry-tools').addEventListener('click', () => { void loadTools(); });
$('copy-diagnostic').addEventListener('click', async () => {
  clearTimeout(copiedTimer);
  try {
    await navigator.clipboard.writeText(diagnosticReport);
    $('copy-error').hidden = true; paintButton($('copy-diagnostic'), '', 'check');
    $('copy-diagnostic').setAttribute('data-copied',''); $('copy-diagnostic').setAttribute('aria-label',t('已复制诊断报告','Diagnostic report copied')); $('copy-diagnostic').title = t('已复制','Copied');
    $('announcement').textContent = t('诊断报告已复制','Diagnostic report copied');
    copiedTimer = setTimeout(() => { paintButton($('copy-diagnostic'), '', 'copy'); $('copy-diagnostic').removeAttribute('data-copied'); $('copy-diagnostic').setAttribute('aria-label',t('复制诊断报告','Copy diagnostic report')); $('copy-diagnostic').title=t('复制诊断报告','Copy diagnostic report'); }, 2000);
  } catch {
    paintButton($('copy-diagnostic'), '', 'copy'); $('copy-diagnostic').removeAttribute('data-copied');
    $('copy-diagnostic').setAttribute('aria-label',t('复制诊断报告','Copy diagnostic report'));
    $('copy-diagnostic').title=t('复制诊断报告','Copy diagnostic report');
    $('copy-error').textContent = t('无法复制，请重试。','Could not copy. Try again.'); $('copy-error').hidden = false;
  }
});
$('toggle-tools').addEventListener('click', async () => {
  $('toggle-tools').disabled = true;
  try {
    if (!toolsEnabled && !await chrome.permissions.request({ origins:[PAGE_ORIGINS[host]] })) { $('page-status').textContent = t('未启用页面工具。','Page tools were not enabled.'); return; }
    const reply = await chrome.runtime.sendMessage({ action:'pages-set', host, enabled:!toolsEnabled, tab_id:tabId });
    if (!reply?.ok) throw Error();
    toolsEnabled = reply.value.enabled;
    $('toggle-tools').setAttribute('aria-pressed', String(toolsEnabled));
    $('toggle-tools').setAttribute('aria-label', toolsEnabled ? t('关闭页面工具','Turn off page tools') : t('启用页面工具','Enable page tools'));
    $('page-status').textContent = '';
  } catch { $('page-status').textContent = t('页面工具未更新，请重新打开扩展后重试。','Page tools were not updated. Reopen the extension and try again.'); }
  finally { $('toggle-tools').disabled = false; }
});
for (const action of ['authorize','sync','revoke']) $(action).addEventListener('click', async () => {
  busy = action; controls();
  try {
    const result = await send(action, action === 'authorize'
      ? { replaces:current?.grant_id || null, source_name:sourceName }
      : { request_permission:action === 'sync' && lastError === 'E_PERMISSION' });
    await refresh();
    if (result[site] !== (action === 'revoke' ? 'revoked' : 'synced')) {
      throw Error(result[site] === 'revoked' ? 'E_SESSION_REVOKED' : result[site]);
    }
    if (action !== 'revoke') {
      clearTimeout(feedbackTimer); syncedFeedback = true;
      feedbackTimer = setTimeout(() => {syncedFeedback = false; controls();}, 2000);
      $('announcement').textContent = t('登录态已同步','Site session synced');
    }
  } catch (error) {
    if (/^E_BRIDGE(?:_|$)|^E_SESSION_PROTOCOL$/.test(error.message)) connection('unavailable');
    lastError = error.message; updateDiagnostic();
    status(t('同步未完成','Sync did not complete'), recovery(lastError), true);
  }
  finally { busy = ''; controls(); if (action === 'revoke' && !authorized) $('authorize').focus(); }
});
for (const [id, zh, en] of [
  ['revoke','移除授权','Remove access'], ['session-title','登录态同步','Session sync'],
  ['diagnostics-title','诊断','Diagnostics'], ['retry-status','重试','Retry'],
  ['retry-tools','重试','Retry'],
  ['tools-title','切片/下载 工具条','Clip/download toolbar']
]) $(id).textContent = t(zh,en);
$('tools-info').setAttribute('aria-label',t('工具条说明','About the toolbar'));
$('tools-help').textContent = t('在支持的视频页面显示下载与切片入口。','Show download and clip actions on supported video pages.');
for(const mark of document.querySelectorAll('.icon')) {
  const name=[...mark.classList].find(value=>value.startsWith('icon-'))?.slice(5);
  if(icons[name])mark.replaceWith(makeIcon(name));
}
$('site-actions').setAttribute('aria-label',t('站点选项','Site options')); $('site-actions').title=t('站点选项','Site options');
$('copy-diagnostic').setAttribute('aria-label',t('复制诊断报告','Copy diagnostic report')); $('copy-diagnostic').title=t('复制诊断报告','Copy diagnostic report');
$('page-unavailable').textContent=t('请在网站打开','Open a website');
$('site').addEventListener('focus', () => {
  if ($('site').matches(':focus-visible') && $('site').scrollWidth > $('site').clientWidth) {
    $('site-full').textContent=site; $('site-full').showPopover();
  }
});
const hideFullSite=() => {if ($('site-full').matches(':popover-open')) $('site-full').hidePopover();};
$('site').addEventListener('blur',hideFullSite);
$('site').addEventListener('keydown',event=>{if(event.key==='Escape')hideFullSite();});
paintButton($('retry-status'), t('重试','Retry'), 'refresh');
paintButton($('retry-tools'), t('重试','Retry'), 'refresh');
$('site').textContent = t('正在读取页面','Reading page');
$('tools-loading').textContent = $('session-loading').textContent = t('读取中','Loading');
controls();
connection('checking');
updateDiagnostic();
document.querySelector('main').getBoundingClientRect();
document.documentElement.removeAttribute('data-initializing');

async function loadTools() {
  const generation = ++toolsGeneration;
  $('tools-loading').hidden = false; $('retry-tools').hidden = true; $('toggle-tools').hidden = true;
  $('page-status').textContent = '';
  try {
    const reply = await boundedRead(chrome.runtime.sendMessage({ action:'pages-status', host }));
    if (generation !== toolsGeneration) return;
    if (!reply?.ok || typeof reply.value?.enabled !== 'boolean') throw Error('E_BRIDGE');
    toolsEnabled = reply.value.enabled;
    $('toggle-tools').setAttribute('aria-pressed', String(toolsEnabled));
    $('toggle-tools').setAttribute('aria-label', toolsEnabled ? t('关闭页面工具','Turn off page tools') : t('启用页面工具','Enable page tools'));
    $('toggle-tools').disabled = false; $('toggle-tools').hidden = false;
    $('toggle-tools').getBoundingClientRect(); $('toggle-tools').removeAttribute('data-initial-value');
  } catch {
    if (generation !== toolsGeneration) return;
    $('page-status').textContent = t('页面工具状态不可用，请重试。','Page tools status unavailable. Try again.');
    $('retry-tools').hidden = false;
  } finally { if (generation === toolsGeneration) $('tools-loading').hidden = true; }
}

async function loadSession() {
  try { await refresh(); }
  catch (error) {
    $('session-loading').hidden = true; $('retry-status').hidden = false;
    connection('unavailable'); lastError = error.message; updateDiagnostic();
    status(t('扩展连接不可用','Extension connection unavailable'), t('请重试。','Try again.'), true);
  }
}

async function loadTab() {
  const generation = ++tabGeneration;
  $('retry-status').hidden = true; $('page-unavailable').hidden = true; $('session-loading').hidden = false;
  connection('checking'); updateDiagnostic();
  $('site').textContent = t('正在读取页面','Reading page');
  try {
    const [tab] = await boundedRead(chrome.tabs.query({ active:true, currentWindow:true }));
    if (generation !== tabGeneration) return;
    host = pageHost(tab.url); tabId = tab.id;
    try { site = siteFromUrl(tab.url); } catch { throw Error('E_PAGE'); }
    $('site').textContent = site; $('site').title = site; $('site').setAttribute('aria-label',site);
    $('authorize').title = t('允许同步本站及子域的登录态，仅用于 Ameow 下载','Allow this site and its subdomains for Ameow downloads');
    if (host) { $('page-tools').hidden = false; void loadTools(); }
    void loadSession();
  } catch (error) {
    if (generation !== tabGeneration) return;
    connection('unknown'); lastError = error.message; updateDiagnostic();
    $('site').textContent=t('当前页面','Current page'); $('session-loading').hidden=true;
    $('authorize').hidden=true; $('sync').hidden=true;
    if (error.message === 'E_PAGE') {
      $('page-unavailable').hidden=false;
      status(t('请在普通网站页面打开扩展','Open the extension on a regular website'), '', true); $('notice').hidden=true;
    } else {
      $('retry-status').hidden=false;
      status(t('无法读取当前页面','Could not read the current page'), t('请重试。','Try again.'), true);
    }
  }
}
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === 'local' && site && (changes.grants || changes.source_id)) void loadSession();
});
void loadTab();
