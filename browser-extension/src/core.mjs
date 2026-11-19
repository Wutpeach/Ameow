import { getDomain } from 'tldts';
export const HOST = 'org.ameow.browser_sessions';
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
    const entry = pending.get(response.request_id);
    if (!entry) return;
    pending.delete(response.request_id); clearTimeout(entry.timer);
    if (response.version !== 1) entry.reject(Error('E_SESSION_PROTOCOL'));
    else if (!response.ok) entry.reject(Error(response.error || 'E_SESSION_PROTOCOL'));
    else entry.resolve(response.sites);
  });
  port.onDisconnect.addListener(() => {
    // Reading lastError acknowledges it; its vendor text is never persisted.
    void api.runtime.lastError; disconnected = true;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Error('E_BRIDGE')); }
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
  async withClient(action) { const client = this.connect(); try { return await action(client); } finally { client.close(); } }
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
    return this.withClient(async client => ({ sites: await client.request({ operation: 'list' }), source_id: state.source_id, grant: state.grants[site] }));
  }
  async authorize(site, replaces, source_name) {
    if (siteFromUrl(`https://${site}/`) !== site) throw Error('E_PAGE');
    const state = await this.state();
    state.grants[site] = { grant_id: crypto.randomUUID().replaceAll('-', ''), sequence: 0, pending: true, replaces, source_name };
    await this.api.storage.local.set({ grants: state.grants });
    return this.sync(site);
  }
  async sync(onlySite) {
    const state = await this.state();
    const results = {};
    if (!Object.keys(state.grants).length) return results;
    await this.withClient(async client => {
      for (const [site, grant] of Object.entries(state.grants)) {
        if (onlySite && site !== onlySite) continue;
        try {
          let data;
          try { data = await this.collect(site); } catch (error) {
            if (error.message !== 'E_PERMISSION') throw error;
            await client.request({ operation: 'revoke', site, source_id: state.source_id, grant_id: grant.grant_id });
            delete state.grants[site]; results[site] = 'revoked'; continue;
          }
          // Persist the sequence before sending so a service-worker restart cannot reuse it.
          grant.sequence += 1; await this.api.storage.local.set({ grants: state.grants });
          if (grant.pending) {
            await client.request({ operation: 'authorize', site, source_id: state.source_id, source_name: grant.source_name,
              grant_id: grant.grant_id, replaces: grant.replaces, ...data });
            grant.pending = false;
          } else {
            await client.request({ operation: 'sync', site, source_id: state.source_id, grant_id: grant.grant_id, sequence: grant.sequence, ...data });
          }
          grant.last_sync = Date.now(); grant.error = null; results[site] = 'synced';
        } catch (error) {
          const known = ['E_SESSION_REVOKED', 'E_SESSION_SOURCE_CHANGED', 'E_SESSION_STALE', 'E_PERMISSION', 'E_COOKIE_READ', 'E_SESSION_LIMIT', 'E_SESSION_STORAGE', 'E_SESSION_INVALID'];
          grant.error = known.includes(error.message) ? error.message : 'E_BRIDGE';
          results[site] = grant.error;
          if (['E_SESSION_REVOKED', 'E_SESSION_SOURCE_CHANGED'].includes(grant.error)) {
            delete state.grants[site]; await this.api.permissions.remove({ origins: scope(site) });
          }
        }
      }
    });
    await this.api.storage.local.set({ grants: state.grants });
    return results;
  }
  async revoke(site) {
    // Remove browser permission first. An unavailable host is retried by the periodic reconciliation.
    await this.api.permissions.remove({ origins: scope(site) });
    return this.sync(site);
  }
}
