import test from 'node:test';
import assert from 'node:assert/strict';
import { siteFromUrl, scope, cookiesForSite, Sessions, nativeClient } from '../src/core.mjs';
const cookie = { domain: '.example.com', path: '/', name: 'session', value: 'SYNTHETIC_ONLY', secure: true, httpOnly: true, hostOnly: false, session: true };
test('site scope follows the public and private suffix boundaries', () => {
  assert.equal(siteFromUrl('https://www.bilibili.com/video/fixture'), 'bilibili.com');
  assert.equal(siteFromUrl('https://app.example.co.uk/page'), 'example.co.uk');
  assert.equal(siteFromUrl('https://one.github.io/page'), 'one.github.io');
  assert.deepEqual(scope('example.com'), ['https://*.example.com/*', 'http://*.example.com/*']);
  for (const url of ['file:///tmp/a', 'edge://settings', 'http://localhost/', 'http://127.0.0.1/', 'https://name:secret@example.com/']) assert.throws(() => siteFromUrl(url));
});
test('only scoped unpartitioned cookies are converted, with native semantics', () => {
  const result = cookiesForSite([cookie, { ...cookie, domain: 'api.example.com', hostOnly: true },
    { ...cookie, domain: '.evilexample.com' }, { ...cookie, domain: '.evil.net' },
    { ...cookie, partitionKey: { topLevelSite: 'https://example.com' } }], 'example.com');
  assert.equal(result.cookies.length, 2); assert.equal(result.skipped_partitioned, 1);
  assert.equal(result.cookies[0].http_only, true); assert.equal(result.cookies[0].expires, null);
  assert.equal(result.cookies[1].host_only, true);
});
function fixture() {
  const saved = {}; let allowed = true; let cookies = [cookie]; let responseError;
  const messages = []; const removed = [];
  const api = {
    storage: { local: { get: async () => structuredClone(saved), set: async data => Object.assign(saved, structuredClone(data)) } },
    permissions: { contains: async () => allowed, remove: async data => { removed.push(data); allowed = false; } },
    cookies: { getAll: async data => { assert.equal(data.domain, 'example.com'); assert.equal(data.storeId, '0'); return data.partitionKey ? [] : cookies; } },
  };
  const sessions = new Sessions(api, () => ({ request: async message => {
    messages.push(structuredClone(message)); if (responseError && !['ping', 'list'].includes(message.operation)) throw Error(responseError); return [];
  }, close() {} }));
  return { sessions, saved, messages, removed, permissions(value) { allowed = value; }, cookies(value) { cookies = value; }, error(value) { responseError = value; } };
}
test('explicit authorization, changes, deletions and worker restart use monotonic grants', async () => {
  const f = fixture();
  await f.sessions.authorize('example.com', null, 'Isolated Edge');
  assert.equal(f.messages.find(m => m.operation === 'authorize').replaces, null);
  const grant = f.saved.grants['example.com'].grant_id;
  f.cookies([{ ...cookie, value: 'CHANGED_SYNTHETIC' }]); await f.sessions.sync();
  const changed = f.messages.filter(m => m.operation === 'sync').at(-1);
  assert.equal(changed.grant_id, grant); assert.equal(changed.sequence, 2); assert.equal(changed.cookies[0].value, 'CHANGED_SYNTHETIC');
  f.cookies([]); await f.sessions.sync(); assert.deepEqual(f.messages.filter(m => m.operation === 'sync').at(-1).cookies, []);
  assert(!JSON.stringify(f.saved).includes('SYNTHETIC')); // Browser storage never contains cookie values.
  f.permissions(false); await f.sessions.sync(); assert.equal(f.messages.at(-1).operation, 'revoke');
  assert.deepEqual(f.saved.grants, {});
});
test('desktop removal cannot be recreated by automatic synchronization', async () => {
  const f = fixture(); await f.sessions.authorize('example.com', null, 'Isolated Edge');
  f.error('E_SESSION_REVOKED'); await f.sessions.sync();
  assert.deepEqual(f.saved.grants, {}); assert.deepEqual(f.removed, [{ origins: ['https://*.example.com/*', 'http://*.example.com/*'] }]);
  f.messages.length = 0; await f.sessions.sync(); assert.equal(f.messages.length, 0);
});
test('lost initial receipt retries only the explicitly pending authorization', async () => {
  const f = fixture(); f.error('E_BRIDGE'); await f.sessions.authorize('example.com', null, 'Isolated Edge');
  const grant = f.saved.grants['example.com'].grant_id; assert.equal(f.saved.grants['example.com'].pending, true);
  f.error(undefined); await f.sessions.sync();
  const retries = f.messages.filter(m => m.operation === 'authorize');
  assert.equal(retries.length, 2); assert.equal(retries[1].grant_id, grant);
  assert.equal(f.messages.at(-1).operation, 'sync');
  assert.equal(f.saved.grants['example.com'].pending, false);
});
test('browser read failure stores only a safe code and sends no partial credential set', async () => {
  const saved = {};
  const messages = [];
  const api = {storage:{local:{get:async()=>structuredClone(saved),set:async data=>Object.assign(saved,structuredClone(data))}},
    permissions:{contains:async()=>true},cookies:{getAll:async()=>{throw Error('vendor text with PRIVATE_COOKIE');}}};
  const sessions = new Sessions(api,()=>({request:async message=>{messages.push(message);return [];},close(){}}));
  const result = await sessions.authorize('example.com',null,'Isolated browser');
  assert.equal(result['example.com'],'E_COOKIE_READ'); assert(messages.every(m => m.operation === 'ping'));
  assert(!JSON.stringify(saved).includes('PRIVATE_COOKIE'));
});
test('oversized native payload is rejected before transmission', async () => {
  let sent = false;
  const port = {onMessage:{addListener(){}},onDisconnect:{addListener(){}},postMessage(){sent=true;},disconnect(){}};
  const client = nativeClient({runtime:{connectNative:()=>port}});
  await assert.rejects(client.request({operation:'sync',cookies:['x'.repeat(600*1024)]}),/E_SESSION_LIMIT/);
  assert.equal(sent,false); client.close();
});
test('native disconnects and unsupported protocols use safe distinct errors', async () => {
  for (const [message, expected] of [['Specified native messaging host not found.','E_BRIDGE_NOT_REGISTERED'],['Error when communicating with the native messaging host.','E_BRIDGE_IO']]) {
    let disconnect; const api={runtime:{lastError:{message},connectNative:()=>({onMessage:{addListener(){}},onDisconnect:{addListener(fn){disconnect=fn;}},postMessage(){queueMicrotask(disconnect);},disconnect(){}})}};
    const client=nativeClient(api); await assert.rejects(client.request({operation:'ping'}),new RegExp(expected));client.close();
  }
  let receive; const api={runtime:{connectNative:()=>({onMessage:{addListener(fn){receive=fn;}},onDisconnect:{addListener(){}},postMessage(){queueMicrotask(()=>receive({version:1,ok:false,error:'E_SESSION_PROTOCOL'}));},disconnect(){}})}};
  const client=nativeClient(api);await assert.rejects(client.request({operation:'ping'}),/E_SESSION_PROTOCOL/);client.close();
});
