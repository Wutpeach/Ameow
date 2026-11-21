import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHost, canonicalTarget, clipRange, parseTime, formatTime } from '../src/page-core.mjs';
import { PageTools } from '../src/page-background.mjs';
import { Sessions } from '../src/core.mjs';
test('only the current unambiguous VOD is bound, including the Bilibili part', () => {
  const yt = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const evidence = { id: 'jNQXAC9IVRw', duration: 19.021, count: 1 };
  assert(canonicalTarget(yt, evidence));
  for (const change of [{ id: 'abcdefghijk' }, { count: 2 }, { ad: true }, { live: true }, { duration: Infinity }]) assert.equal(canonicalTarget(yt, { ...evidence, ...change }), null);
  assert.equal(pageHost('https://www.youtube.com.evil.net/watch'), null);
  const bili = { id: 'BV17x411w7KC', cid: 275431, aid: 170001, part: 2, duration: 100, count: 1 };
  assert.equal(canonicalTarget('https://www.bilibili.com/video/av170001/?p=2', bili).url, 'https://www.bilibili.com/video/BV17x411w7KC/?p=2');
  assert.equal(canonicalTarget('https://www.bilibili.com/video/BV17x411w7KC/?p=1', bili), null);
});
test('editable time preserves milliseconds and rejects malformed or out-of-bounds drafts', () => {
  for (const [value, ms] of [['1.25', 1250], ['1:12.500', 72500], ['1:02:03.004', 3723004]]) { assert.equal(parseTime(value), ms); assert.equal(parseTime(formatTime(ms)), ms); }
  for (const value of ['-1', 'Infinity', '1:60', '1.0001', '', '1::2']) assert.equal(parseTime(value), null);
  for (const value of [{ start_ms: null, end_ms: 10 }, { start_ms: 5, end_ms: 5 }, { start_ms: 0, end_ms: 11000 }, { start_ms: 0, end_ms: 1, mode: 'copy' }]) assert.throws(() => clipRange(value, 10));
});
test('an older native bridge refuses clip submission before any submit operation', async () => {
  const calls = [], target = { key: 'youtube:jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', duration: 19 };
  const pages = new PageTools({ runtime: { sendNativeMessage: async (_host, message) => { calls.push(message.operation.operation); return { ok: true, bridge: { capabilities: ['ping', 'report_failure'] } }; } } });
  pages.binding = async () => target;
  await assert.rejects(pages.submit({ ...target, clip: { start_ms: 1250, end_ms: 4750 }, request_id: '00000000-0000-0000-0000-000000000000' }, {}), /E_CLIP_UNSUPPORTED/);
  assert.deepEqual(calls, ['ping']);
});

test('cookie revocation survives a bridge outage without collecting or disabling page tools', async () => {
  const saved = { source_id: 'owned-fixture', grants: { 'youtube.com': { grant_id: 'owned-grant', sequence: 0 } }, page_tools: { 'www.youtube.com': true } };
  const removed = [], calls = [];
  const api = { storage: { local: { get: async () => structuredClone(saved), set: async value => Object.assign(saved, value) } }, permissions: { remove: async value => removed.push(...value.origins) } };
  let unavailable = true;
  const sessions = new Sessions(api, () => ({ request: async op => { calls.push(op.operation); if (unavailable) throw Error('E_BRIDGE'); return []; }, close() {} }));
  sessions.collect = async () => { throw Error('COOKIE_READ_MUST_NOT_HAPPEN'); };
  await sessions.revoke('youtube.com'); assert(saved.grants['youtube.com'].revoking);
  assert.deepEqual(removed, ['http://*.youtube.com/*']); assert(saved.page_tools['www.youtube.com']);
  unavailable = false; await sessions.sync(); assert.deepEqual(saved.grants, {}); assert(calls.includes('revoke'));
});

test('default registration injects open tabs once, retains explicit off and respects actual permission', async () => {
  const saved = {grants:{'youtube.com':{grant_id:'kept'}}}, registered = new Map(), attached = new Set(), removed = [], stops = [];
  const permissions = new Set(['https://www.youtube.com/*', 'https://www.bilibili.com/*']);
  const api = { storage: { local: { get: async () => structuredClone(saved), set: async value => Object.assign(saved, structuredClone(value)) } },
    permissions: { contains: async ({ origins }) => origins.every(x => permissions.has(x)), remove: async v => removed.push(v) },
    tabs: { query: async ({ url }) => [{ id: url[0].includes('youtube') ? 1 : 2 }], sendMessage: async (id, msg) => { stops.push([id, msg]); attached.delete(id); } },
    scripting: { getRegisteredContentScripts: async () => [...registered.values()],
      registerContentScripts: async rows => rows.forEach(x => registered.set(x.id, x)),
      unregisterContentScripts: async ({ ids }) => ids.forEach(id => registered.delete(id)),
      executeScript: async ({ target, func }) => func ? [{ result: attached.has(target.tabId) }] : (attached.add(target.tabId), []),
      insertCSS: async ({ target }) => { assert(!attached.has(target.tabId)); } } };
  const pages = new PageTools(api);
  await pages.reconcile(); assert.equal(registered.size, 2); assert.deepEqual([...attached], [1, 2]); assert(saved.grants['youtube.com']);
  await pages.reconcile(); assert.equal(registered.size, 2); assert.deepEqual([...attached], [1, 2]);
  await pages.set('www.youtube.com', false); assert.equal(await pages.enabled('www.youtube.com'), false); assert.equal(registered.size, 1); assert(stops.length >= 1); assert.deepEqual(removed, []); assert(saved.grants['youtube.com']);
  const restarted = new PageTools(api); await restarted.reconcile(); assert.equal(await restarted.enabled('www.youtube.com'), false); assert.equal(saved.page_tools['www.youtube.com'], false);
  permissions.delete('https://www.bilibili.com/*'); await pages.reconcile(); assert.equal(await pages.enabled('www.bilibili.com'), false); assert.equal(registered.size, 0); assert.notEqual(saved.page_tools['www.bilibili.com'], false);
  permissions.add('https://www.bilibili.com/*'); await pages.reconcile(); assert.equal(await pages.enabled('www.bilibili.com'), true); assert.equal(await pages.enabled('www.youtube.com'), false); assert.equal(registered.size, 1);
  await pages.set('www.youtube.com', true); assert.equal(await pages.enabled('www.youtube.com'), true); assert(attached.has(1));
});

test('session permission release keeps required page host even when page tools are off', async () => {
  const removed = [], api = { storage: { local: { get: async () => ({ page_tools: { 'www.youtube.com': false } }) } }, permissions: { remove: async ({ origins }) => removed.push(...origins) } };
  const sessions = new Sessions(api);
  await sessions.releasePermission('youtube.com');
  assert.deepEqual(removed, ['http://*.youtube.com/*']);
  await sessions.releasePermission('example.com');
  assert(removed.includes('https://*.example.com/*'));
});
