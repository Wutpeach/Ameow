// Owned extension/profile: real Chromium permissions, synthetic empty Cookie/desktop APIs.
// Run from the repository root: node browser-extension/tests/session-permission.e2e.mjs <fresh-output> <browser>
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const root=resolve(process.argv[2]), extension=join(root,'extension');
await mkdir(root); await mkdir(extension);
await copyFile(new URL(import.meta.url),join(root,'executed-script.mjs'));
await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'Owned session permission regression',version:'1.0',
  permissions:['storage','alarms','scripting','cookies'],optional_host_permissions:['https://*/*','http://*/*'],
  background:{service_worker:'background.js',type:'module'},action:{default_popup:'popup.html'}}));
// No nativeMessaging permission, no native connection, no actual Cookie reads or website visits.
const setup=`
import {Sessions,scope} from './src/core.mjs';
globalThis.operations=[]; let rows=[];
Sessions.prototype.collect=async function(site){
  if(!await chrome.permissions.contains({origins:scope(site)}))throw Error('E_PERMISSION');
  return {cookies:[],skipped_partitioned:0};
};
Sessions.prototype.withClient=async function(action){return action({request:async op=>{
  operations.push(op.operation);
  if(op.operation==='authorize')rows=[{site:op.site,source_id:op.source_id,grant_id:op.grant_id,source_name:op.source_name,synced_at:1,cookie_count:0,skipped_partitioned:0}];
  if(op.operation==='sync')rows[0].last_result={at:2,error:null};
  return rows;
}});};
const request=chrome.permissions.request.bind(chrome.permissions);
chrome.permissions.request=options=>{
  globalThis.permissionStarted=true;
  return request(options).then(allowed=>new Promise(resolve=>{globalThis.releasePermission=()=>resolve(allowed);}));
};
import './src/background.mjs';
`;
await build({stdin:{contents:setup,resolveDir:resolve('browser-extension')},bundle:true,format:'esm',outfile:join(extension,'background.js')});
const popup=await readFile(resolve('browser-extension/dist/popup.js'),'utf8');
await writeFile(join(extension,'popup.js'),`chrome.tabs.query=async()=>[{id:1,url:'https://example.com/'}];\n`+popup);
for(const name of ['popup.html','popup.css','ameow-cat.svg'])await copyFile(resolve('browser-extension/dist',name),join(extension,name));
const context=await chromium.launchPersistentContext(join(root,'profile'),{executablePath:resolve(process.argv[3]),headless:true,
  ignoreDefaultArgs:['--disable-extensions'],args:['--headless=new','--disable-extensions-except='+extension,'--load-extension='+extension,'--no-first-run','--no-default-browser-check']});
const report={scope:'owned extension/profile; real native permissions API; already-granted scope with a delayed result; no native host, account, Cookie read or website',checks:[]};
try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const until=async predicate=>{
    for(let n=0;n<100;n++){if(await worker.evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,50));}
    assert.fail('worker permission/sync continuation did not finish');
  };
  const cdp=await context.browser().newBrowserCDPSession();
  async function openPopup(){
    await worker.evaluate(async()=>{
      const [tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});
      await chrome.windows.update(tab.windowId,{focused:true});
      await chrome.action.openPopup({windowId:tab.windowId});
    });
    const views=await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['POPUP']}));
    assert.equal(views.length,1);
    const target=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url===views[0].documentUrl);
    const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
    let serial=0; const pending=new Map();
    const onMessage=event=>{
      if(event.sessionId!==sessionId)return;
      const message=JSON.parse(event.message),entry=pending.get(message.id);
      if(entry){clearTimeout(entry.timer);pending.delete(message.id);entry.resolve(message);}
    };
    cdp.on('Target.receivedMessageFromTarget',onMessage);
    async function send(method,params={}){
      const id=++serial;
      const reply=new Promise((resolve,reject)=>pending.set(id,{resolve,timer:setTimeout(()=>reject(Error('Popup CDP timeout')),10000)}));
      await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});
      const response=await reply; assert(!response.error); return response.result;
    }
    async function evaluate(expression){
      const response=await send('Runtime.evaluate',{expression,returnByValue:true});
      assert(!response.exceptionDetails); return response.result.value;
    }
    const ready='!!document.querySelector("#authorize") && !document.documentElement.hasAttribute("data-initializing")';
    for(let n=0;n<100&&!await evaluate(ready);n++)await new Promise(resolve=>setTimeout(resolve,50));
    assert(await evaluate(ready));
    return {evaluate,
      async click(){
        const point=await evaluate('(()=>{const r=document.querySelector("#authorize").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
      },
      async screenshot(){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'reopened-popup.png'),Buffer.from(shot.data,'base64'));},
      async close(){
        cdp.off('Target.receivedMessageFromTarget',onMessage);await cdp.send('Target.closeTarget',{targetId:target.targetId});
        for(let n=0;n<100&&(await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['POPUP']}))).length;n++)await new Promise(resolve=>setTimeout(resolve,50));
      }
    };
  }
  const id=new URL(worker.url()).host;
  const manager=await context.newPage(); await manager.goto('chrome://extensions/');
  await manager.evaluate(async id=>{for(const origin of ['https://*.example.com/*','http://*.example.com/*'])await chrome.developerPrivate.addHostPermission(id,origin);},id);
  await manager.close();
  const page=await openPopup(); await page.click();
  await until(()=>globalThis.permissionStarted);
  await until(()=>typeof globalThis.releasePermission==='function');
  assert.equal(await worker.evaluate(()=>operations.includes('authorize')),false);
  await page.close(); // Destroy the requester before the permission result reaches the continuation.
  await worker.evaluate(()=>releasePermission());
  await until(()=>operations.includes('sync'));
  const state=await worker.evaluate(async()=>({operations,storage:await chrome.storage.local.get(['grants'])}));
  assert.equal(state.operations.filter(op=>op==='authorize').length,1);
  assert.equal(state.operations.filter(op=>op==='sync').length,1);
  assert.equal(state.storage.grants['example.com'].pending,false);
  assert.equal(state.storage.grants['example.com'].error,null);
  const reopened=await openPopup();
  assert.equal(await reopened.evaluate('document.querySelector("#sync").disabled'),false);
  assert.equal(await reopened.evaluate('document.querySelector("#authorize").hidden'),true);
  assert.equal(await reopened.evaluate('innerWidth'),240);
  await reopened.screenshot(); await reopened.close();
  report.checks.push('Popup click forwards real user gesture to worker permissions.request',
    'already-granted permission completes authorize and sync once after the real action Popup closes',
    'reopen shows persisted authorization with an enabled sync button at 240px');
  report.operations=state.operations; report.browserVersion=context.browser().version();
  report.limitation='Native prompt accept/deny is covered by synthetic decisions; no CDP native extension-dialog control is used.';
  report.result='PASS';
}catch(error){report.result='FAIL';report.error=error.stack;throw error;}
finally{await context.close();await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
