import { siteFromUrl, scope, SYNC_ERRORS } from './core.mjs';
const $ = id => document.getElementById(id);
let site, current, sourceId;
const sourceName = navigator.userAgent.includes('Edg/') ? 'Microsoft Edge' : 'Chrome / Chromium';
async function send(action, extra = {}) {
  const response = await chrome.runtime.sendMessage({ action, site, ...extra });
  if (!response?.ok) throw Error('E_BRIDGE');
  return response.value;
}
function status(text, error = false) { $('status').textContent = text; $('status').toggleAttribute('data-error', error); }
async function refresh() {
  const state = await send('status'); sourceId = state.source_id;
  current = state.sites.find(row => row.site === site);
  $('source').textContent = current ? `来源：${current.source_name} · ${current.source_id.slice(0, 6)}` : '';
  const own = current ? current.source_id === sourceId : Boolean(state.grant);
  $('authorize').hidden = own; $('sync').hidden = !own; $('revoke').hidden = !own;
  $('authorize').textContent = current ? '改用此浏览器' : '授权此站点';
  $('authorize').disabled = false;
  const last = current?.synced_at ? current.synced_at * 1000 : state.grant?.last_sync;
  const cached = last ? `上次成功：${new Date(last).toLocaleString()}。` : '';
  const error = state.error || (own && state.grant?.error) || current?.last_result?.error;
  if (error) status(`${SYNC_ERRORS[error] || '同步结果不可用'}。${cached}保留已有缓存。`, true);
  else if (current) status(`${cached}${current.last_result ? '最近收到的同步结果：成功。' : '最近同步结果未知。'}${current.skipped_partitioned ? '分区 Cookie 已排除。' : ''}`);
  else status(state.grant?.pending ? '授权尚未完成同步。' : '');
}
for (const action of ['authorize', 'sync', 'revoke']) $(action).addEventListener('click', async () => {
  for (const id of ['authorize', 'sync', 'revoke']) $(id).disabled = true;
  try {
    if (action === 'authorize') {
      const granted = await chrome.permissions.request({ origins: scope(site) });
      if (!granted) { status('未授权，下载继续使用匿名会话。'); return; }
      const result = await send('authorize', { replaces: current?.grant_id || null, source_name: sourceName });
      if (result[site] !== 'synced') throw Error(result[site]);
    } else {
      const result = await send(action);
      if (!['synced', 'revoked'].includes(result[site])) throw Error(result[site]);
    }
    status(action === 'revoke' ? '已移除。' : '已同步。');
    await refresh();
  } catch (error) {
    status(`${SYNC_ERRORS[error.message] || '同步未完成，原因未确认'}。`, true);
  }
  finally { for (const id of ['authorize', 'sync', 'revoke']) $(id).disabled = false; }
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  site = siteFromUrl(tab.url); $('site').textContent = site;
  $('scope').textContent = `授权范围：${site} 及其子域。允许 Ameow 自动同步这些站点的 Cookie，并在下载时复用。`;
  await refresh();
} catch {
  status(site ? '浏览器连接状态不可用，原因未确认。' : '请在普通网站页面打开扩展。', true);
}
