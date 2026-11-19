import { siteFromUrl, scope } from './core.mjs';
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
  const own = current?.source_id === sourceId;
  $('authorize').hidden = own; $('sync').hidden = !own; $('revoke').hidden = !own;
  $('authorize').textContent = current ? '改用此浏览器' : '授权此站点';
  $('authorize').disabled = false;
  if (current) status(current.skipped_partitioned ? '已同步。分区 Cookie 无法用于下载，已排除。' : `已同步 · ${new Date(current.synced_at * 1000).toLocaleString()}`);
  if (state.grant?.error === 'E_COOKIE_READ') status('浏览器会话读取失败。保留上次同步结果，请重试。', true);
  if (state.grant?.error === 'E_SESSION_LIMIT') status('此站点会话超出同步容量。保留上次同步结果。', true);
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
    const message = { E_COOKIE_READ: '浏览器会话读取失败，请重试。', E_SESSION_LIMIT: '此站点会话超出同步容量。', E_SESSION_SOURCE_CHANGED: '来源已变化，请重新确认此站点。' }[error.message];
    status(message || '同步未完成。请确认桌面 Ameow 的浏览器连接已安装，再重试。', true);
  }
  finally { for (const id of ['authorize', 'sync', 'revoke']) $(id).disabled = false; }
});
try {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  site = siteFromUrl(tab.url); $('site').textContent = site;
  $('scope').textContent = `授权范围：${site} 及其子域。允许 Ameow 自动同步这些站点的 Cookie，并在下载时复用。`;
  await refresh();
} catch {
  status(site ? '请先在桌面 Ameow 设置中安装浏览器连接。' : '请在普通网站页面打开扩展。', true);
}
