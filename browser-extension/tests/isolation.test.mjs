import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installNativeGuard, PRODUCT_HOST } from './isolation.mjs';
test('native fixture boundary allows only its own host and audits operation names without IDs or payloads', async () => {
  const called = [], saved = {}, host = PRODUCT_HOST + '.fixture.unit';
  const context = { crypto: { randomUUID: () => String(Object.keys(saved).length) }, Date,
    chrome: { storage: { local: { set: async v => Object.assign(saved, v) } }, runtime: {
      connectNative: host => { called.push(host); return { postMessage: message => called.push(message.operation.operation) }; },
      sendNativeMessage: (host, message) => { called.push(host, message.operation.operation); return Promise.resolve({}); },
    } } };
  vm.runInNewContext('(' + installNativeGuard.toString() + ')(' + JSON.stringify(host) + ')', context);
  assert.throws(() => context.chrome.runtime.connectNative(PRODUCT_HOST), /TEST_NATIVE_HOST_FORBIDDEN/);
  assert.throws(() => context.chrome.runtime.sendNativeMessage(PRODUCT_HOST, {}), /TEST_NATIVE_HOST_FORBIDDEN/);
  const port = context.chrome.runtime.connectNative(host); port.postMessage({ request_id: 'not-recorded', operation: { operation: 'list' } });
  await context.chrome.runtime.sendNativeMessage(host, { operation: { operation: 'ping' } });
  assert.deepEqual(called, [host, 'list', host, 'ping']);
  assert(!JSON.stringify(saved).includes('not-recorded'));
  assert.equal(Object.values(saved).filter(v => !v.allowed).length, 2);
});
