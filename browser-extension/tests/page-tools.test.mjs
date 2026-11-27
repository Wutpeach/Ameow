import test from 'node:test';
import assert from 'node:assert/strict';
import { pageHost, canonicalTarget, clipRange, formatTime } from '../src/page-core.mjs';
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
test('time display preserves milliseconds and malformed or out-of-bounds drafts are rejected', () => {
  for (const [ms, text] of [[1250, '0:01.250'], [72500, '1:12.500'], [3723004, '1:02:03.004']]) assert.equal(formatTime(ms), text);
  for (const value of [{ start_ms: null, end_ms: 10 }, { start_ms: 5, end_ms: 5 }, { start_ms: 0, end_ms: 11000 }, { start_ms: 0, end_ms: 1, mode: 'copy' }]) assert.throws(() => clipRange(value, 10));
});

test('Xiaohongshu binds the current single video and keeps the complete sharing query', () => {
  const id='6b08a8be000000002903d864', url='https://www.xiaohongshu.com/explore/'+id+'?xsec_token=synthetic&xsec_source=pc_feed&source=webshare';
  const evidence={id,currentId:id,noteType:'video',duration:29.35467,count:1,bound:true};
  assert.equal(canonicalTarget(url,evidence).url,url);
  assert.equal(canonicalTarget(url,evidence).key,'xiaohongshu:'+id);
  for(const change of [{id:'6b08a8be000000002903d865'},{currentId:'6b08a8be000000002903d865'},{noteType:'normal'},{count:2},{bound:false},{duration:NaN}]) assert.equal(canonicalTarget(url,{...evidence,...change}),null);
  for(const url of ['https://www.xiaohongshu.com:444/explore/'+id,'https://www.xiaohongshu.com/explore/bad','https://www.xiaohongshu.com/user/profile/'+id]) assert.equal(canonicalTarget(url,evidence),null);
  assert.equal(pageHost('https://www.xiaohongshu.com.evil.test/explore/'+id),null);
});

test('Xiaohongshu optional access is retained only while tools or a session still need it', async () => {
  const saved={page_tools:{'www.xiaohongshu.com':true},grants:{}},removed=[];
  const api={storage:{local:{get:async()=>structuredClone(saved),set:async value=>Object.assign(saved,value)}},permissions:{remove:async ({origins})=>removed.push(...origins)}};
  const sessions=new Sessions(api);
  await sessions.releasePermission('xiaohongshu.com');assert.deepEqual(removed,['http://*.xiaohongshu.com/*']);
  removed.length=0;saved.page_tools['www.xiaohongshu.com']=false;
  await sessions.releasePermission('xiaohongshu.com');assert.deepEqual(removed,['https://*.xiaohongshu.com/*','http://*.xiaohongshu.com/*']);
  const pages=new PageTools(api);pages.reconcile=async()=>{};api.tabs={query:async()=>[]};removed.length=0;
  await pages.set('www.xiaohongshu.com',false);assert.deepEqual(removed,['https://www.xiaohongshu.com/*']);
  saved.grants['xiaohongshu.com']={grant_id:'retained'};removed.length=0;
  await pages.set('www.xiaohongshu.com',false);assert.deepEqual(removed,[]);
});
test('an older native bridge refuses clip submission before any submit operation', async () => {
  const calls = [], target = { key: 'youtube:jNQXAC9IVRw', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', duration: 19 };
  const pages = new PageTools({ runtime: { sendNativeMessage: async (_host, message) => { calls.push(message.operation.operation); return { ok: true, bridge: { capabilities: ['ping', 'report_failure'] } }; } } });
  pages.binding = async () => target;
  await assert.rejects(pages.submit({ ...target, clip: { start_ms: 1250, end_ms: 4750 }, request_id: '00000000-0000-0000-0000-000000000000' }, {}), /E_CLIP_UNSUPPORTED/);
  assert.deepEqual(calls, ['ping']);
});

test('precision is typed, preserved through native submission, and never downgraded for older hosts', async () => {
  const range={start_ms:1250,end_ms:4750};
  assert.deepEqual(clipRange({...range,precise:true},10),{...range,precise:true});
  assert.deepEqual(clipRange({...range,precise:false},10),range);
  for(const precise of [null,1,'true']) assert.throws(()=>clipRange({...range,precise},10));
  const target={key:'youtube:jNQXAC9IVRw',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',duration:10};
  for(const supported of [false,true]) {
    const calls=[];
    const pages=new PageTools({runtime:{sendNativeMessage:async (_host,message)=>{
      calls.push(message);
      return message.operation.operation==='ping' ? {ok:true,bridge:{capabilities:['page_submit_v1','clip_v1',...(supported?['precise_clip_v1']:[])]}}
        : {version:1,ok:true,request_id:message.request_id,accepted:{task_id:'fixture:1'}};
    }}});
    pages.binding=async()=>target;
    const action=()=>pages.submit({...target,clip:{...range,precise:true},request_id:'00000000-0000-0000-0000-000000000000'},{});
    if(supported) { await action(); assert.deepEqual(calls[1].operation.clip,{...range,precise:true}); }
    else { await assert.rejects(action(),/E_CLIP_UNSUPPORTED/); assert.equal(calls.length,1); }
  }
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
