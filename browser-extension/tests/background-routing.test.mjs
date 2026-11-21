import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('permission additions reconcile page scripts without session synchronization', async () => {
  const listeners = {}, calls = [];
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  class PageTools { async reconcile() { calls.push('pages'); } }
  class Sessions { async sync() { calls.push('session-sync'); } }
  const chrome = { runtime: { onInstalled:event('install'), onStartup:event('startup'), onMessage:event('message') },
    alarms: { onAlarm:event('alarm'), get:async () => ({}), create:async () => calls.push('alarm-create') },
    permissions: { onAdded:event('added'), onRemoved:event('removed') }, cookies: { onChanged:event('cookies') } };
  const source = (await readFile(new URL('../src/background.mjs', import.meta.url), 'utf8')).split(String.fromCharCode(10)).filter(line => !line.startsWith('import ')).join(String.fromCharCode(10));
  vm.runInNewContext(source, { chrome, PageTools, Sessions, within:() => false, setTimeout, clearTimeout });
  listeners.added({ origins: ['https://www.youtube.com/*'] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['pages']);
});
