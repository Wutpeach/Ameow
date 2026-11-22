import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Sessions as RealSessions, within, scope, siteFromUrl } from '../src/core.mjs';

const source = (await readFile(new URL('../src/background.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
function fixture() {
  const listeners = {}, saved = {}, operations = [], requests = [];
  let gesture = false, allowed = false, decide, fault;
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  const chrome = {
    runtime: { id:'owned', getURL:path => 'chrome-extension://owned/'+path, onInstalled:event('install'), onStartup:event('startup'), onMessage:event('message') },
    alarms: { onAlarm:event('alarm'), get:async () => ({}), create:async () => {} },
    storage: { local: { get:async () => structuredClone(saved), set:async value => Object.assign(saved,structuredClone(value)) } },
    permissions: { onAdded:event('added'), onRemoved:event('removed'), contains:async () => allowed,
      request(data) {
        assert(gesture, 'permission request must run synchronously in the click message');
        requests.push(data); return new Promise((resolve,reject) => { decide = value => { allowed = value === true; value instanceof Error ? reject(value) : resolve(value); }; });
      } },
    cookies: { onChanged:event('cookies'), getAll:async () => [] },
  };
  class PageTools { async reconcile() {} }
  class Sessions extends RealSessions { constructor(api) { super(api,() => ({close(){},request:async operation => {
    operations.push(structuredClone(operation));
    if (fault) throw Error(fault);
    return [];
  }})); } }
  vm.runInNewContext(source, { chrome, PageTools, Sessions, within, scope, siteFromUrl, setTimeout, clearTimeout });
  return {saved,operations,requests,listeners,decide:value => decide(value),fault:value => {fault=value;},
    click(action,extra={}) {
      let response;
      const reply = new Promise(resolve => { response=resolve; });
      gesture = true;
      const retained = listeners.message({action,site:'example.com',replaces:null,source_name:'Chrome / Chromium',...extra},
        {id:'owned',url:'chrome-extension://owned/popup.html'},response);
      gesture = false; assert.equal(retained,true); return reply;
    },
  };
}

test('one click owns permission and sync after the Popup receiver closes', async () => {
  const f=fixture(), reply=f.click('authorize');
  assert.equal(f.requests.length,1);
  assert.deepEqual(f.requests[0].origins,scope('example.com'));
  assert.equal(f.operations.length,0);
  // No further Popup message is sent; resolving the browser decision completes the worker work.
  f.decide(true); await reply;
  assert.deepEqual(f.operations.map(op=>op.operation),['ping','authorize','sync']);
  assert.equal(f.saved.grants['example.com'].pending,false);
  assert.equal(f.saved.grants['example.com'].error,null);
  const grant=f.saved.grants['example.com'].grant_id;
  f.listeners.added({origins:scope('example.com')});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.saved.grants['example.com'].grant_id,grant);
  assert.equal(f.operations.filter(op=>op.operation==='authorize').length,1);
});

for (const decision of [false,Error('private vendor text')]) test(`permission ${decision===false?'denial':'failure'} never creates a grant or syncs`,async()=>{
  const f=fixture(), reply=f.click('authorize'); f.decide(decision);
  const response=await reply; assert.equal(response.value['example.com'],'E_PERMISSION');
  assert.deepEqual(f.saved,{}); assert.deepEqual(f.operations,[]);
  f.listeners.added({origins:scope('unrelated.example')});
  await new Promise(resolve=>setImmediate(resolve)); assert.deepEqual(f.operations,[]);
});

test('an initial bridge failure remains retryable with the same pending grant',async()=>{
  const f=fixture(); f.fault('E_BRIDGE'); const first=f.click('authorize'); f.decide(true);
  assert.equal((await first).value['example.com'],'E_BRIDGE');
  const grant=f.saved.grants['example.com'].grant_id;
  assert.equal(f.saved.grants['example.com'].pending,true); assert.equal(f.saved.grants['example.com'].error,'E_BRIDGE');
  f.fault(undefined); await f.click('sync');
  assert.equal(f.requests.length,1); assert.equal(f.saved.grants['example.com'].grant_id,grant);
  assert.equal(f.saved.grants['example.com'].pending,false); assert.equal(f.saved.grants['example.com'].sequence,2);
});

test('explicit permission recovery syncs the existing grant without replacing it',async()=>{
  const f=fixture(), first=f.click('authorize'); f.decide(true); await first;
  const grant=f.saved.grants['example.com'].grant_id;
  const retry=f.click('sync',{request_permission:true}); f.decide(true); await retry;
  assert.equal(f.requests.length,2); assert.equal(f.saved.grants['example.com'].grant_id,grant);
  assert.equal(f.operations.filter(op=>op.operation==='authorize').length,1);
  assert.equal(f.saved.grants['example.com'].sequence,2);
});

test('permission requests reject invalid scopes and non-Popup senders',()=>{
  const f=fixture(); let response;
  assert.equal(f.listeners.message({action:'authorize',site:'example.com/path'},
    {id:'owned',url:'chrome-extension://owned/popup.html'},value=>{response=value;}),false);
  assert.equal(response.error,'E_PERMISSION');
  assert.equal(f.listeners.message({action:'authorize',site:'example.com'},
    {id:'owned',url:'https://example.com'},()=>{}),false);
  assert.equal(f.requests.length,0);
});

test('permission additions reconcile page scripts without session synchronization', async () => {
  const listeners = {}, calls = [];
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  class PageTools { async reconcile() { calls.push('pages'); } }
  class Sessions { async sync() { calls.push('session-sync'); } }
  const chrome = { runtime: { onInstalled:event('install'), onStartup:event('startup'), onMessage:event('message') },
    alarms: { onAlarm:event('alarm'), get:async () => ({}), create:async () => calls.push('alarm-create') },
    permissions: { onAdded:event('added'), onRemoved:event('removed') }, cookies: { onChanged:event('cookies') } };
  vm.runInNewContext(source, { chrome, PageTools, Sessions, within:() => false, setTimeout, clearTimeout });
  listeners.added({ origins: ['https://www.youtube.com/*'] });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['pages']);
});
