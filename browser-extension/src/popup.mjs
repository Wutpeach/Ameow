import { siteFromUrl, scope, SYNC_ERRORS } from './core.mjs';
import { PAGE_ORIGINS, pageHost } from './page-core.mjs';
const $ = id => document.getElementById(id);
const english = (navigator.language || '').toLowerCase().startsWith('en');
const t = (zh, en) => english ? en : zh;
document.documentElement.lang = english ? 'en' : 'zh-CN';
let site, current, sourceId, lastGrant, lastError, connectionState = 'unknown', host, tabId, toolsEnabled = false;
let copiedTimer;
const sourceName = navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Chrome / Chromium';
const errorEn = { E_COOKIE_READ:'Could not read browser cookies', E_BRIDGE:'Browser connection failed', E_SESSION_STORAGE:'Session storage failed', E_SESSION_LIMIT:'Session exceeds the sync limit', E_SESSION_INVALID:'Session data was not accepted', E_SESSION_PROTOCOL:'Browser bridge is incompatible', E_SESSION_STALE:'Sync message expired', E_PERMISSION:'Site permission was removed', E_SESSION_REVOKED:'Site authorization was removed', E_SESSION_SOURCE_CHANGED:'Site source changed', E_BRIDGE_NOT_REGISTERED:'Browser bridge registration was not found', E_BRIDGE_FORBIDDEN:'Browser denied the connection', E_BRIDGE_START:'Browser bridge could not start', E_BRIDGE_EXIT:'Browser bridge exited', E_BRIDGE_IO:'Browser connection failed' };
const errorText = code => { const messages = english ? errorEn : SYNC_ERRORS; return typeof code === 'string' && Object.hasOwn(messages, code) ? messages[code] : t('原因未知', 'Reason unknown'); };
const date = value => Number.isFinite(value) && value > 0 && value < 8640000000000000 ? new Date(value).toLocaleString(english ? 'en' : 'zh-CN') : t('未知', 'Unknown');
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : t('未知', 'Unknown');
const safeSource = value => ['Microsoft Edge', 'Chrome / Chromium'].includes(value) ? value : t('未知来源', 'Unknown source');
function connection(kind) {
  connectionState = kind;
  $('connection').textContent = kind === 'ready' ? t('扩展连接就绪','Extension connection ready') : kind === 'unavailable' ? t('扩展连接不可用','Extension connection unavailable') : t('扩展连接未知','Extension connection unknown');
  $('connection').toggleAttribute('data-ready', kind === 'ready'); $('connection').toggleAttribute('data-error', kind === 'unavailable');
}
function status(text, detail = '', error = false) {
  $('notice').hidden = !text; $('status').textContent = text; $('status-detail').textContent = detail;
  $('status').toggleAttribute('data-error', error); $('notice').toggleAttribute('data-error', error);
  $('notice').toggleAttribute('data-success', false);
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
  $('diagnostic-report').textContent = [
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
  $('unauthorized').hidden = !valid || Boolean(current || grant);
  $('scope').hidden = !valid || own;
  $('authorize').hidden = !valid || own; $('sync').hidden = !own; $('revoke').hidden = !own;
  $('retry-status').hidden = valid || own;
  $('authorize').textContent = current ? t('改用此浏览器','Use this browser') : t('授权并同步','Authorize & sync');
  $('authorize').disabled = false;
  $('replace-copy').hidden = !valid || !current || own;
  lastError = state.error || (own && grant?.error) || current?.last_result?.error;
  if (lastError) status(t('同步未完成','Sync did not complete'), recovery(lastError), true);
  else if (grant?.pending) status(t('正在同步','Syncing'));
  else if (current?.cookie_count === 0) status(t('没有可用会话','No available session'), t('请在浏览器确认本站已登录，然后重新同步。','Check that you are signed in, then sync again.'));
  else if (current && !current.last_result) status(t('同步结果未知','Sync status unknown'));
  else if (current) { status(t('已同步','Synced')); $('notice').setAttribute('data-success',''); }
  else status(valid ? '' : t('会话状态暂不可确认','Session status unavailable'));
  $('sync').textContent = lastError ? t('重试同步','Retry sync') : t('立即同步','Sync now');
  updateDiagnostic();
}
async function refresh() { render(await send('status')); }
$('retry-status').addEventListener('click', async () => {
  $('retry-status').disabled = true;
  try { await refresh(); }
  catch (error) {
    connection('unavailable'); lastError = error.message; updateDiagnostic();
    status(t('扩展连接不可用','Extension connection unavailable'), t('请重试。','Try again.'), true);
  }
  finally { $('retry-status').disabled = false; }
});
$('copy-diagnostic').addEventListener('click', async () => {
  clearTimeout(copiedTimer);
  try {
    await navigator.clipboard.writeText($('diagnostic-report').textContent);
    $('copy-error').hidden = true; $('copy-diagnostic').textContent = t('已复制','Copied');
    copiedTimer = setTimeout(() => { $('copy-diagnostic').textContent = t('复制诊断报告','Copy diagnostic report'); }, 2000);
  } catch {
    $('copy-diagnostic').textContent = t('复制诊断报告','Copy diagnostic report');
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
  for (const id of ['authorize','sync','revoke']) $(id).disabled = true;
  try {
    if (action === 'authorize') {
      if (!await chrome.permissions.request({ origins:scope(site) })) { status(t('未授权','Not authorized')); return; }
      const result = await send('authorize', { replaces:current?.grant_id || null, source_name:sourceName });
      if (result[site] !== 'synced') throw Error(result[site]);
    } else {
      if (action === 'sync' && lastError === 'E_PERMISSION' && !await chrome.permissions.request({ origins:scope(site) })) { status(t('同步未完成','Sync did not complete'), recovery('E_PERMISSION'), true); return; }
      const result = await send(action);
      if (!['synced','revoked'].includes(result[site])) throw Error(result[site]);
    }
    await refresh();
  } catch (error) {
    if (/^E_BRIDGE(?:_|$)|^E_SESSION_PROTOCOL$/.test(error.message)) connection('unavailable');
    lastError = error.message; $('sync').textContent = t('重试同步','Retry sync'); updateDiagnostic();
    status(t('同步未完成','Sync did not complete'), recovery(lastError), true);
  }
  finally { for (const id of ['authorize','sync','revoke']) $(id).disabled = false; }
});
for (const [id, zh, en] of [
  ['unauthorized','未授权','Not authorized'], ['revoke','移除授权','Remove access'], ['session-title','登录态同步','Session sync'],
  ['replace-copy','改用此浏览器会替换当前来源。','Using this browser replaces the current source.'],
  ['diagnostics-title','诊断','Diagnostics'], ['copy-diagnostic','复制诊断报告','Copy diagnostic report'], ['retry-status','重试','Retry'],
  ['tools-title','页面工具','Page tools']
]) $(id).textContent = t(zh,en);
connection('unknown');
updateDiagnostic();
try {
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
  host = pageHost(tab.url); tabId = tab.id;
  if (host) {
    $('page-tools').hidden = false;
    const reply = await chrome.runtime.sendMessage({ action:'pages-status', host });
    toolsEnabled = Boolean(reply?.value?.enabled);
    $('toggle-tools').setAttribute('aria-pressed', String(toolsEnabled));
    $('toggle-tools').setAttribute('aria-label', toolsEnabled ? t('关闭页面工具','Turn off page tools') : t('启用页面工具','Enable page tools'));
    $('toggle-tools').disabled = false;
  }
  site = siteFromUrl(tab.url); $('site').textContent = site; $('site').title = site; $('site').setAttribute('aria-label',site);
  $('scope').textContent = t('允许自动同步 ' + site + ' 及其子域的 Cookie，仅用于 Ameow 下载。', 'Allow automatic cookie sync for ' + site + ' and its subdomains, for Ameow downloads only.');
  await refresh();
} catch (error) {
  connection(site && /^E_BRIDGE|^E_SESSION_PROTOCOL/.test(error.message) ? 'unavailable' : 'unknown');
  lastError = error.message; updateDiagnostic();
  $('retry-status').hidden = !site;
  status(site ? t('扩展连接不可用','Extension connection unavailable') : t('请在普通网站页面打开扩展','Open the extension on a regular website'), '', true);
}
