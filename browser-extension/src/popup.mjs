import { siteFromUrl, scope, SYNC_ERRORS } from './core.mjs';
import { PAGE_ORIGINS, pageHost } from './page-core.mjs';
const $ = id => document.getElementById(id);
const english = (navigator.language || '').toLowerCase().startsWith('en');
const t = (zh, en) => english ? en : zh;
document.documentElement.lang = english ? 'en' : 'zh-CN';
let site, current, sourceId, lastGrant, host, tabId, toolsEnabled = false;
const sourceName = navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Chrome / Chromium';
const errorEn = { E_COOKIE_READ:'Could not read browser cookies', E_BRIDGE:'Browser connection failed', E_SESSION_STORAGE:'Session storage failed', E_SESSION_LIMIT:'Session exceeds the sync limit', E_SESSION_INVALID:'Session data was not accepted', E_SESSION_PROTOCOL:'Browser bridge is incompatible', E_SESSION_STALE:'Sync message expired', E_PERMISSION:'Site permission was removed', E_SESSION_REVOKED:'Site authorization was removed', E_SESSION_SOURCE_CHANGED:'Site source changed', E_BRIDGE_NOT_REGISTERED:'Browser bridge registration was not found', E_BRIDGE_FORBIDDEN:'Browser denied the connection', E_BRIDGE_START:'Browser bridge could not start', E_BRIDGE_EXIT:'Browser bridge exited', E_BRIDGE_IO:'Browser connection failed' };
const errorText = code => (english ? errorEn : SYNC_ERRORS)[code] || t('同步结果不可用', 'Sync result unavailable');
const date = value => value ? new Date(value).toLocaleString(english ? 'en' : 'zh-CN') : t('未知', 'Unknown');
function connection(kind) {
  $('connection').textContent = kind === 'ready' ? t('连接可用','Connection ready') : kind === 'unavailable' ? t('连接不可用','Unavailable') : t('连接待确认','Connection unknown');
  $('connection').toggleAttribute('data-ready', kind === 'ready'); $('connection').toggleAttribute('data-error', kind === 'unavailable');
}
function status(title, detail = '', error = false) {
  $('notice').hidden = !title; $('status').textContent = title; $('status-detail').textContent = detail;
  $('status').toggleAttribute('data-error', error); $('notice').toggleAttribute('data-error', error);
}
async function send(action, extra = {}) {
  let response;
  try { response = await chrome.runtime.sendMessage({ action, site, ...extra }); }
  catch { throw Error('E_BRIDGE'); }
  if (!response?.ok) throw Error(response?.error || 'E_BRIDGE');
  return response.value;
}
function renderDetails(row, grant) {
  const unknown = t('未知','Unknown');
  $('details').hidden = !row && !grant;
  $('browser-value').textContent = row?.source_name || grant?.source_name || unknown;
  $('installation-value').textContent = row?.source_id || sourceId || unknown;
  $('snapshot-value').textContent = date(row?.synced_at ? row.synced_at * 1000 : grant?.last_sync);
  const result = row?.last_result;
  $('result-value').textContent = result ? `${date(result.at * 1000)} · ${result.error ? errorText(result.error) : t('同步成功','Sync succeeded')}` : unknown;
  $('cookie-value').textContent = Number.isInteger(row?.cookie_count) ? String(row.cookie_count) : unknown;
  $('excluded-label').hidden = $('excluded-value').hidden = !(row?.skipped_partitioned > 0);
  $('excluded-value').textContent = t(`${row?.skipped_partitioned} 条分区 Cookie`, `${row?.skipped_partitioned} partitioned cookies`);
}
function render(state) {
  const valid = !state.error && Array.isArray(state.sites);
  const unavailable = /^E_BRIDGE(?:_|$)|^E_SESSION_PROTOCOL$/.test(state.error || '');
  connection(valid ? 'ready' : unavailable ? 'unavailable' : 'unknown');
  sourceId = state.source_id;
  if (valid) current = state.sites.find(row => row.site === site);
  const grant = state.grant, own = current ? current.source_id === sourceId : Boolean(grant);
  lastGrant = grant;
  const known = valid || Boolean(current || grant);
  $('unauthorized').hidden = !valid || Boolean(current || grant);
  $('scope').hidden = !valid || own;
  $('source-line').hidden = !current;
  $('source').textContent = current?.source_name || t('未知来源','Unknown source');
  $('source').title = current?.source_name || '';
  $('authorize').hidden = !valid || own; $('sync').hidden = !own; $('revoke').hidden = !own;
  $('authorize').textContent = current ? t('改用此浏览器','Use this browser') : t('授权并同步','Authorize & sync');
  $('authorize').disabled = false;
  $('replace-copy').hidden = !valid || !current || own;
  const last = current?.synced_at ? current.synced_at * 1000 : grant?.last_sync;
  const cached = last ? t(`保留的快照：${date(last)}。`, `Retained snapshot: ${date(last)}.`) : '';
  const error = state.error || (own && grant?.error) || current?.last_result?.error;
  if (error) status(t('最近同步未完成','Latest sync did not complete'), `${errorText(error)}。${cached}`, true);
  else if (grant?.pending) status(t('正在同步','Syncing'), cached);
  else if (current?.cookie_count === 0) status(t('没有可用 Cookie','No available cookies'), t('在来源浏览器确认本站会话后，重新同步。','Check the site in the source browser, then sync again.'));
  else if (current && !current.last_result) status(t('最近同步结果未知','Latest sync result unknown'), cached);
  else if (current) status(t('快照已更新','Snapshot updated'), cached);
  else status(known && !valid ? t('会话状态暂不可确认','Session status unavailable') : '', '');
  $('sync').textContent = error ? t('重试同步','Retry sync') : t('立即同步','Sync now');
  $('partitioned').hidden = !(current?.skipped_partitioned > 0);
  renderDetails(current, grant);
}
async function refresh() { render(await send('status')); }
$('toggle-tools').addEventListener('click', async () => {
  $('toggle-tools').disabled = true;
  try {
    if (!toolsEnabled && !await chrome.permissions.request({ origins:[PAGE_ORIGINS[host]] })) { $('page-status').textContent = t('未启用页面工具。','Page tools were not enabled.'); return; }
    const reply = await chrome.runtime.sendMessage({ action:'pages-set', host, enabled:!toolsEnabled, tab_id:tabId });
    if (!reply?.ok) throw Error();
    toolsEnabled = reply.value.enabled;
    $('toggle-tools').setAttribute('aria-pressed', String(toolsEnabled));
    $('toggle-tools').setAttribute('aria-label', toolsEnabled ? t('关闭页面工具','Turn off page tools') : t('启用页面工具','Enable page tools'));
    $('page-status').textContent = toolsEnabled ? t('播放单个点播视频后，播放器右上角可见 Ameow 图标。','Play a single on-demand video to see the Ameow icon in the player.') : '';
  } catch { $('page-status').textContent = t('页面工具未更新，请重新打开扩展后重试。','Page tools were not updated. Reopen the extension and try again.'); }
  finally { $('toggle-tools').disabled = false; }
});
for (const action of ['authorize','sync','revoke']) $(action).addEventListener('click', async () => {
  for (const id of ['authorize','sync','revoke']) $(id).disabled = true;
  try {
    if (action === 'authorize') {
      if (!await chrome.permissions.request({ origins:scope(site) })) { status(t('未授权','Not authorized'), t('下载继续使用匿名会话。','Downloads continue without a session.')); return; }
      const result = await send('authorize', { replaces:current?.grant_id || null, source_name:sourceName });
      if (result[site] !== 'synced') throw Error(result[site]);
    } else {
      const result = await send(action);
      if (!['synced','revoked'].includes(result[site])) throw Error(result[site]);
    }
    await refresh();
  } catch (error) {
    if (/^E_BRIDGE(?:_|$)|^E_SESSION_PROTOCOL$/.test(error.message)) connection('unavailable');
    const snapshot = current?.synced_at ? current.synced_at * 1000 : lastGrant?.last_sync;
    const retained = snapshot ? t('保留的快照：', 'Retained snapshot: ') + date(snapshot) : '';
    status(t('同步未完成','Sync did not complete'), [errorText(error.message), retained].filter(Boolean).join(' · '), true);
  }
  finally { for (const id of ['authorize','sync','revoke']) $(id).disabled = false; }
});
for (const [id, zh, en] of [
  ['unauthorized','未授权','Not authorized'], ['auto-sync','自动同步','Auto sync'], ['revoke','移除','Remove'],
  ['replace-copy','改用此浏览器会替换当前来源。','Using this browser replaces the current source.'],
  ['partitioned','分区 Cookie 未同步','Partitioned cookies were excluded'], ['details-title','来源与快照','Source and snapshot'],
  ['browser-label','浏览器','Browser'], ['installation-label','安装来源','Installation'], ['snapshot-label','保留的快照','Retained snapshot'],
  ['result-label','最近结果','Latest result'], ['excluded-label','未同步','Excluded'],
  ['details-copy','仅复用授权范围内的已有 Cookie。同步不验证网站登录有效性；下载内容与画质由网站和下载器决定。','Only cookies within the authorized scope are reused. Sync does not verify sign-in validity. The site and downloader determine content and quality.'],
  ['tools-title','页面工具','Page tools'], ['tools-copy','不包含站点会话授权','Separate from session permission']
]) $(id).textContent = t(zh,en);
connection('unknown');
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
  site = siteFromUrl(tab.url); $('site').textContent = site;
  $('scope').textContent = t('允许自动同步 ' + site + ' 及其子域的 Cookie，仅用于 Ameow 下载。', 'Allow automatic cookie sync for ' + site + ' and its subdomains, for Ameow downloads only.');
  await refresh();
} catch (error) {
  connection(site && /^E_BRIDGE|^E_SESSION_PROTOCOL/.test(error.message) ? 'unavailable' : 'unknown');
  status(site ? t('浏览器连接状态不可用','Browser connection unavailable') : t('请在普通网站页面打开扩展','Open the extension on a regular website'), '', true);
}
