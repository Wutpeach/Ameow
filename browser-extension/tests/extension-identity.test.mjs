import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../src/background.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
const identity = { version: '0.5.2', extensionId: 'icedkidcbbbijndplfofcbhikohlcool', sourceSha256: 'a'.repeat(64), capabilities: ['session_sync_v1'] };
function fixture({ compiled = identity, fail = false, deferred = false, cache = {} } = {}) {
  const listeners = {}, reports = []; let finish;
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  const chrome = { runtime: { onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message'),
    async sendNativeMessage(host, message) {
      reports.push(JSON.parse(JSON.stringify({ host, message })));
      if (fail) throw Error('old host does not support identity');
      if (deferred) await new Promise(resolve => { finish = resolve; });
      return { version: 1, ok: true, sites: [] };
    } }, storage: { session: { get: async () => ({...cache}), set: async value => Object.assign(cache,value) } },
    alarms: { onAlarm: event('alarm'), get: async () => ({}), create: async () => {} },
    permissions: { onAdded: event('added'), onRemoved: event('removed') }, cookies: { onChanged: event('cookies') } };
  class Sessions { async state() { return { source_id: '1'.repeat(32), grants: { private: 'must not leave storage' } }; } async sync() { return {}; } }
  class PageTools { async reconcile() {} }
  vm.runInNewContext(source, { chrome, Sessions, PageTools, __AMEOW_EXTENSION_IDENTITY__: compiled,
    crypto: { randomUUID: () => 'identity-report-0001' }, setTimeout, clearTimeout });
  return { listeners, reports, finish: () => finish?.() };
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('reports compiled loaded identity independently of disk files and private grant contents', async () => {
  const f = fixture(); await turn();
  assert.equal(f.reports.length, 1);
  assert.deepEqual(f.reports[0], { host: 'org.ameow.browser_sessions', message: { version: 1, request_id: 'identity-report-0001',
    operation: { operation: 'report_extension_identity', source_id: '1'.repeat(32), identity } } });
  assert(!JSON.stringify(f.reports).includes('must not leave storage'));
});

test('old host failure remains silent and does not stop existing reconciliation', async () => {
  const f = fixture({ fail: true }); await turn();
  f.listeners.alarm({ name: 'ameow-sync' }); await turn();
  assert.equal(f.reports.length, 2);
});

test('unknown source build does not invent identity and duplicate events share an in-flight report', async () => {
  const unknown = fixture({ compiled: null }); await turn(); assert.equal(unknown.reports.length, 0);
  const f = fixture({ deferred: true }); await turn();
  f.listeners.startup(); f.listeners.alarm({ name: 'ameow-sync' }); await turn();
  assert.equal(f.reports.length, 1); f.finish(); await turn();
});

test('successful loaded identity is reported once per browser session and changes still report', async () => {
  const cache = {};
  const first = fixture({cache}); await turn(); assert.equal(first.reports.length,1);
  const wake = fixture({cache}); await turn(); assert.equal(wake.reports.length,0);
  wake.listeners.alarm({name:'ameow-sync'}); await turn(); assert.equal(wake.reports.length,0);
  const reload = fixture({cache,compiled:{...identity,sourceSha256:'b'.repeat(64)}});
  await turn(); assert.equal(reload.reports.length,1);
  const otherProfile = fixture(); await turn(); assert.equal(otherProfile.reports.length,1);
});
