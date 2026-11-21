import { getDomain } from 'tldts';
import { PAGE_ORIGINS } from './page-core.mjs';
export const HOST = 'org.ameow.browser_sessions';
export const SYNC_ERRORS = Object.freeze({
  E_COOKIE_READ: '浏览器会话读取失败', E_BRIDGE: '浏览器连接失败',
  E_SESSION_STORAGE: '本地会话存储失败', E_SESSION_LIMIT: '会话超出同步容量',
  E_SESSION_INVALID: '会话数据未被接受', E_SESSION_PROTOCOL: '浏览器连接组件不兼容',
  E_SESSION_STALE: '同步消息已过期', E_PERMISSION: '站点权限已移除',
  E_SESSION_REVOKED: '站点授权已移除', E_SESSION_SOURCE_CHANGED: '站点来源已变化',
  E_BRIDGE_NOT_REGISTERED: '未找到浏览器连接注册', E_BRIDGE_FORBIDDEN: '浏览器拒绝此扩展连接',
  E_BRIDGE_START: '浏览器连接程序无法启动', E_BRIDGE_EXIT: '浏览器连接程序已退出',
  E_BRIDGE_IO: '浏览器连接通信失败',
});
const safeError = error => Object.hasOwn(SYNC_ERRORS, error?.message) ? error.message : error?.message?.startsWith('E_SESSION_KEYCHAIN_') ? 'E_SESSION_STORAGE' : 'E_BRIDGE';
export function siteFromUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('E_PAGE');
  const site = getDomain(url.hostname, { allowPrivateDomains: true });
  if (!site || !site.includes('.')) throw Error('E_PAGE');
  return site;
}
export const scope = site => [`https://*.${site}/*`, `http://*.${site}/*`];
export const within = (host, site) => host === site || host.endsWith(`.${site}`);
export function cookiesForSite(cookies, site) {
  const accepted = cookies.filter(c => !c.partitionKey && within(c.domain.replace(/^\./, ''), site));
  if (accepted.length > 2048) throw Error('E_SESSION_LIMIT');
  return { cookies: accepted.map(c => ({ domain: c.domain, path: c.path, name: c.name, value: c.value,
    secure: c.secure, http_only: c.httpOnly, host_only: c.hostOnly,
    expires: c.session ? null : Math.floor(c.expirationDate) })),
    skipped_partitioned: cookies.filter(c => c.partitionKey && within(c.domain.replace(/^\./, ''), site)).length };
}
export function nativeClient(api) {
  const port = api.runtime.connectNative(HOST);
  const pending = new Map();
  let disconnected = false;
  port.onMessage.addListener(response => {
    if (!response.request_id && response.error === 'E_SESSION_PROTOCOL') {
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('E_SESSION_PROTOCOL')); }
      pending.clear(); return;
    }
    const entry = pending.get(response.request_id);
    if (!entry) return;
    pending.delete(response.request_id); clearTimeout(entry.timer);
    if (response.version !== 1) entry.reject(Error('E_SESSION_PROTOCOL'));
    else if (!response.ok) entry.reject(Error(response.error || 'E_SESSION_PROTOCOL'));
    else if (!Array.isArray(response.sites)) entry.reject(Error('E_SESSION_PROTOCOL'));
    else entry.resolve(response.sites);
  });
  port.onDisconnect.addListener(() => {
    // Reading lastError acknowledges it; its vendor text is never persisted.
    const message = api.runtime.lastError?.message || ''; disconnected = true;
    const code = message.includes('not found') ? 'E_BRIDGE_NOT_REGISTERED' : message.includes('forbidden') ? 'E_BRIDGE_FORBIDDEN' : message.includes('start') ? 'E_BRIDGE_START' : message.includes('exited') ? 'E_BRIDGE_EXIT' : message.includes('communicating') ? 'E_BRIDGE_IO' : 'E_BRIDGE';
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error(code)); }
    pending.clear();
  });
  return {
    request(operation) {
      if (disconnected) return Promise.reject(Error('E_BRIDGE'));
      return new Promise((resolve, reject) => {
        const request_id = crypto.randomUUID();
        const message = { version: 1, request_id, operation };
        if (new TextEncoder().encode(JSON.stringify(message)).length > 512 * 1024) { reject(Error('E_SESSION_LIMIT')); return; }
        const timer = setTimeout(() => { pending.delete(request_id); reject(Error('E_BRIDGE')); }, 10000);
        pending.set(request_id, { resolve, reject, timer });
        port.postMessage(message);
      });
    },
    close() { port.disconnect(); },
  };
}
export class Sessions {
  constructor(api, connect = () => nativeClient(api)) { this.api = api; this.connect = connect; }
  async state() {
    const state = await this.api.storage.local.get(['source_id', 'grants']);
    if (!state.source_id) { state.source_id = crypto.randomUUID().replaceAll('-', ''); await this.api.storage.local.set({ source_id: state.source_id }); }
    return { ...state, grants: state.grants || {} };
  }
  async withClient(action) { const client = this.connect(); try { await client.request({operation:'ping'}); return await action(client); } finally { client.close(); } }
  async collect(site) {
    if (!await this.api.permissions.contains({ origins: scope(site) })) throw Error('E_PERMISSION');
    // A single normal cookie store is bound at authorization; incognito is excluded in the manifest.
    try {
      const cookies = await this.api.cookies.getAll({ domain: site, storeId: '0' });
      const partitioned = await this.api.cookies.getAll({ domain: site, storeId: '0', partitionKey: {} });
      return cookiesForSite([...cookies, ...partitioned.filter(c => c.partitionKey)], site);
    } catch (error) { throw Error(error.message === 'E_SESSION_LIMIT' ? error.message : 'E_COOKIE_READ'); }
  }
  async status(site) {
    const state = await this.state();
    try {
      return await this.withClient(async client => {
        const grant = state.grants[site];
        if (grant?.error && !grant.pending) { try { await this.reportFailure(client, state, site, grant); } catch {} }
        return { sites: await client.request({ operation: 'list' }), source_id: state.source_id, grant };
      });
    } catch (error) { return { sites: [], source_id: state.source_id, grant: state.grants[site], error: safeError(error) }; }
  }
  async reportFailure(client, state, site, grant) {
    if (!grant.error || grant.pending) return;
    const error = grant.error.startsWith('E_BRIDGE_') || ['E_SESSION_REVOKED', 'E_SESSION_SOURCE_CHANGED'].includes(grant.error) ? 'E_BRIDGE' : grant.error;
    try {
      await client.request({ operation: 'report_failure', site, source_id: state.source_id, grant_id: grant.grant_id,
        sequence: grant.error_sequence ?? Math.max(0, grant.sequence - 1), error });
    } catch (error) { if (error.message !== 'E_SESSION_STALE') throw error; }
  }
  async authorize(site, replaces, source_name) {
    if (siteFromUrl(`https://${site}/`) !== site) throw Error('E_PAGE');
    const state = await this.state();
    state.grants[site] = { grant_id: crypto.randomUUID().replaceAll('-', ''), sequence: 0, pending: true, replaces, source_name };
    await this.api.storage.local.set({ grants: state.grants });
    return this.sync(site);
  }
  async releasePermission(site) {
    // Chromium removes a narrower grant with its encompassing origin. Keep the
    // HTTPS permission for the required page-tool hosts; never request it again.
    const keepHttps = Object.keys(PAGE_ORIGINS).some(host => within(host, site));
    const origins = scope(site).filter(origin => !keepHttps || !origin.startsWith('https:'));
    if (origins.length) await this.api.permissions.remove({ origins });
  }
  async sync(onlySite) {
    const state = await this.state();
    const results = {};
    const selected = Object.entries(state.grants).filter(([site]) => !onlySite || site === onlySite);
    if (!selected.length) return results;
    // Reserve even failed attempts before I/O, so a later success supersedes their status.
    for (const [, grant] of selected) { grant.sequence += 1; grant.attempted_at = Date.now(); }
    await this.api.storage.local.set({ grants: state.grants });
    const remember = (site, grant, error) => { grant.error = safeError(error); grant.error_sequence = grant.sequence; results[site] = grant.error; };
    try { await this.withClient(async client => {
      for (const [site, grant] of selected) {
        try {
          if (grant.revoking) {
            await client.request({ operation: 'revoke', site, source_id: state.source_id, grant_id: grant.grant_id });
            delete state.grants[site]; results[site] = 'revoked'; continue;
          }
          let data;
          try { data = await this.collect(site); } catch (error) {
            if (error.message !== 'E_PERMISSION') throw error;
            await client.request({ operation: 'revoke', site, source_id: state.source_id, grant_id: grant.grant_id });
            delete state.grants[site]; results[site] = 'revoked'; continue;
          }
          if (grant.pending) {
            await client.request({ operation: 'authorize', site, source_id: state.source_id, source_name: grant.source_name,
              grant_id: grant.grant_id, replaces: grant.replaces, ...data });
            grant.pending = false;
          }
          // Replaying authorize only confirms the grant; sync acknowledges the current cookies.
          await this.reportFailure(client, state, site, grant);
          await client.request({ operation: 'sync', site, source_id: state.source_id, grant_id: grant.grant_id, sequence: grant.sequence, ...data });
          grant.last_sync = Date.now(); grant.error = null; grant.error_sequence = null; results[site] = 'synced';
        } catch (error) {
          remember(site, grant, error);
          if (['E_SESSION_REVOKED', 'E_SESSION_SOURCE_CHANGED'].includes(grant.error)) {
            delete state.grants[site]; await this.releasePermission(site);
          } else { try { await this.reportFailure(client, state, site, grant); } catch {} }
        }
      }
    }); } catch (error) { for (const [site, grant] of selected) remember(site, grant, error); }
    await this.api.storage.local.set({ grants: state.grants });
    return results;
  }
  async revoke(site) {
    // Persist revocation before I/O. Retries must never collect another snapshot.
    const state = await this.state();
    if (state.grants[site]) { state.grants[site].revoking = true; await this.api.storage.local.set({ grants: state.grants }); }
    await this.releasePermission(site);
    return this.sync(site);
  }
}
