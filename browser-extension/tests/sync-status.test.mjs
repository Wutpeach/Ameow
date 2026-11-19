import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Sessions, SYNC_ERRORS, siteFromUrl, scope } from '../src/core.mjs';
const popup = (await readFile(new URL('../src/popup.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/, '');
async function openPopup(sessions) {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {textContent:'',attrs:new Set(),addEventListener(){},toggleAttribute(key,on){ if(on)this.attrs.add(key);else this.attrs.delete(key); }});
    return elements.get(id);
  }};
  const chrome = {tabs:{query:async()=>[{url:'https://www.example.com/fixture'}]},runtime:{sendMessage:async()=>({ok:true,value:await sessions.status('example.com')})}};
  await vm.runInNewContext('(async()=>{' + popup + '})()', {document,chrome,navigator:{userAgent:'Edg/156'},siteFromUrl,scope,SYNC_ERRORS,Date});
  return elements.get('status');
}
for (const code of ['E_SESSION_STORAGE', 'E_BRIDGE', 'E_COOKIE_READ']) test(`failed ${code} survives popup reopen until a fresh sync succeeds`, async () => {
  const saved = {}; let fault; let rows = []; let cookieReads = 0; const messages = [];
  const api = {storage:{local:{get:async()=>structuredClone(saved),set:async data=>Object.assign(saved,structuredClone(data))}},
    permissions:{contains:async()=>true},cookies:{getAll:async()=>{cookieReads++;if(fault==='E_COOKIE_READ')throw Error('private vendor message');return [];}}};
  const sessions = new Sessions(api,()=>({close(){},request:async message=>{
    messages.push(message);
    if (fault==='E_BRIDGE' || (fault==='E_SESSION_STORAGE' && ['sync','report_failure'].includes(message.operation))) throw Error(fault);
    if(message.operation==='authorize') rows=[{site:message.site,source_id:message.source_id,grant_id:message.grant_id,source_name:'Isolated Edge',synced_at:1234}];
    if(message.operation==='sync') {rows[0].synced_at++;rows[0].last_result={at:rows[0].synced_at,error:null};}
    if(message.operation==='report_failure') rows[0].last_result={at:2000,error:message.error};
    return structuredClone(rows);
  }}));
  await sessions.authorize('example.com',null,'Isolated Edge');
  const cached=rows[0].synced_at; fault=code; await sessions.sync();
  assert.equal(saved.grants['example.com'].error,code); assert.equal(rows[0].synced_at,cached);
  fault=undefined; const reads=cookieReads;
  const reopened=await openPopup(sessions);
  assert(reopened.attrs.has('data-error')); assert(reopened.textContent.includes(SYNC_ERRORS[code]));
  assert.equal(cookieReads,reads,'opening status must not refresh cookies or claim a new sync');
  assert.equal(rows[0].last_result.error,code); assert.equal(rows[0].synced_at,cached);
  const recoveryStart=messages.length; await sessions.sync();
  const recovery=messages.slice(recoveryStart).map(m=>m.operation);
  assert(recovery.indexOf('report_failure')<recovery.indexOf('sync'));
  assert.equal(saved.grants['example.com'].error,null); assert.equal(rows[0].last_result.error,null);
  const recovered=await openPopup(sessions); assert(!recovered.attrs.has('data-error'));
  assert(recovered.textContent.includes('最近收到的同步结果：成功'));
});
