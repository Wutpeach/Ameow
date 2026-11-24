import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Sessions,nativeClient} from '../src/core.mjs';

function localStore(seed = {}) {
  const saved = structuredClone(seed), writes = [];
  return {saved,writes,api:{storage:{local:{
    get:async () => structuredClone(saved),
    set:async value => {writes.push(structuredClone(value));Object.assign(saved,structuredClone(value));},
  }}}};
}

test('concurrent first reads and identity reporting establish one profile source', async () => {
  const f = localStore(), sessions = new Sessions(f.api);
  const states = await Promise.all([sessions.state(),sessions.state(),sessions.state()]);
  assert.equal(new Set(states.map(state => state.source_id)).size,1);
  assert.equal(f.writes.length,1);
  assert.equal(states[0].source_id,f.saved.source_id);
  f.saved.source_id = undefined;
  assert.notEqual((await sessions.state()).source_id,states[0].source_id,'storage reset must not revive a cached source');
});

test('warm reads share only transport, read fresh rows and close after finite idle', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f = localStore({source_id:'a'.repeat(32)});
  let connects=0, closes=0, rows=[], operations=[];
  const sessions = new Sessions(f.api, () => {connects++;return {
    request:async operation => {operations.push(operation.operation);return structuredClone(rows);},close(){closes++;},
  };});
  assert.deepEqual((await sessions.status('example.com')).sites,[]);
  rows = [{site:'example.com',source_id:f.saved.source_id,grant_id:'new'}];
  assert.equal((await sessions.status('example.com')).sites[0].grant_id,'new');
  assert.equal(connects,1);assert.deepEqual(operations,['list','list']);
  t.mock.timers.tick(1500);assert.equal(closes,1);
  rows=[];assert.deepEqual((await sessions.status('example.com')).sites,[]);assert.equal(connects,2);
  const other = localStore({source_id:'b'.repeat(32)});
  const otherSessions = new Sessions(other.api,()=>({request:async()=>[],close(){}}));
  assert.equal((await otherSessions.status('example.com')).source_id,'b'.repeat(32));
  sessions.close();otherSessions.close();
});

test('a read during authorization observes pending and a later read observes its real completion', async () => {
  const f=localStore({source_id:'a'.repeat(32)});let release,permissionStarted=false;
  const permission=new Promise(resolve=>{release=resolve;});
  f.api.permissions={contains:async()=>{permissionStarted=true;return permission;}};
  f.api.cookies={getAll:async()=>[]};
  const sessions=new Sessions(f.api,()=>({request:async()=>[],close(){}}));
  const authorization=sessions.authorize('example.com',null,'Isolated browser');
  await new Promise(resolve=>setImmediate(resolve));assert.equal(permissionStarted,true);
  assert.equal((await sessions.status('example.com')).grant.pending,true);
  release(true);await authorization;
  assert.equal((await sessions.status('example.com')).grant.pending,false);
  sessions.close();
});

test('request timeout invalidates all shared requests and allows a new connection', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f=localStore({source_id:'a'.repeat(32)});let connects=0,closes=0;
  f.api.runtime={connectNative(){
    const generation=++connects;let receive;
    return {onMessage:{addListener(fn){receive=fn;}},onDisconnect:{addListener(){}},
      postMessage(message){if(generation>1)queueMicrotask(()=>receive({version:1,request_id:message.request_id,ok:true,sites:[]}));},
      disconnect(){closes++;}};
  }};
  const sessions=new Sessions(f.api);
  const pending=sessions.status('example.com');
  for(let i=0;i<8;i++)await Promise.resolve();
  t.mock.timers.tick(10000);
  assert.equal((await pending).error,'E_BRIDGE');assert.equal(closes>=1,true);
  assert.equal((await sessions.status('example.com')).error,undefined);assert.equal(connects,2);
  sessions.close();
});

test('the active port has a hard lifetime even if another API never finishes', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const f=localStore();let finish,closes=0;
  const sessions=new Sessions(f.api,()=>({request:async()=>[],close(){closes++;}}));
  const pending=sessions.withClient(()=>new Promise(resolve=>{finish=resolve;}),false);
  t.mock.timers.tick(30000);assert.equal(closes,1);assert.equal(sessions.lease,null);
  finish();await pending;
});

test('protocol-invalid native data does not leave a reusable healthy port', async () => {
  let receive,closes=0;
  const client=nativeClient({runtime:{connectNative:()=>({onMessage:{addListener(fn){receive=fn;}},onDisconnect:{addListener(){}},
    postMessage(message){queueMicrotask(()=>receive({version:2,request_id:message.request_id,ok:true,sites:[]}));},disconnect(){closes++;}})}});
  await assert.rejects(client.request({operation:'list'}),/E_SESSION_PROTOCOL/);
  assert.equal(client.connected,false);assert.equal(closes,1);
});

test('page and session reads bypass a blocked cookie mutation while mutations remain ordered', async () => {
  const source=(await readFile(new URL('../src/background.mjs',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
  const listeners={},event=name=>({addListener(fn){listeners[name]=fn;}});let finish;const order=[];
  class Sessions {
    async sync(){order.push('sync');await new Promise(resolve=>{finish=resolve;});}
    async revoke(){order.push('revoke');return {};}
    async status(){return {sites:[],source_id:'a'.repeat(32)};}
  }
  class PageTools {async enabled(){return true;}}
  const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onInstalled:event('install'),onStartup:event('startup'),onMessage:event('message')},
    alarms:{onAlarm:event('alarm'),get:async()=>({})},cookies:{onChanged:event('cookie')},permissions:{onRemoved:event('removed'),onAdded:event('added')}};
  vm.runInNewContext(source,{chrome,Sessions,PageTools,crypto,scope:()=>[],setTimeout,clearTimeout});
  const sender={id:'test',url:chrome.runtime.getURL('popup.html')};
  const call=action=>new Promise(resolve=>listeners.message({action,site:'example.com',host:'www.bilibili.com'},sender,resolve));
  const sync=call('sync');await new Promise(resolve=>setImmediate(resolve));
  const revoke=call('revoke');
  const [tools,status]=await Promise.all([call('pages-status'),call('status')]);
  assert.equal(tools.value.enabled,true);assert.equal(status.value.sites.length,0);assert.deepEqual(order,['sync']);
  finish();await Promise.all([sync,revoke]);assert.deepEqual(order,['sync','revoke']);
});
