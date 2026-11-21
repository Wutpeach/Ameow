import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createPreviewServer} from '../preview/server.mjs';

const launcher=fileURLToPath(new URL('../preview/launch.mjs',import.meta.url));
async function waitFor(check) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline) {const value=await check();if(value)return value;await delay(40);}
  throw Error('Timed out waiting for preview launcher');
}
async function controller(t,port) {
  const directory=await mkdtemp(join(tmpdir(),'ameow-popup-launch-'));
  const receipt=join(directory,'receipt.json');
  // Launch from outside the checkout, exactly as a native Gallery executable may.
  const child=spawn(process.execPath,[launcher,'--receipt',receipt,'--port',String(port)],
    {cwd:directory,stdio:['pipe','ignore','pipe'],windowsHide:true});
  let stderr='';child.stderr.on('data',bytes=>stderr+=bytes);
  t.after(async()=>{
    child.stdin.end();
    try {await waitFor(()=>child.exitCode!==null);} catch {child.kill();}
    await rm(directory,{recursive:true,force:true});
  });
  const read=async()=>{try{return JSON.parse(await readFile(receipt,'utf8'));}catch{return undefined;}};
  const ready=await waitFor(async()=>{
    const value=await read();
    if(!value&&child.exitCode!==null)throw Error(stderr);
    return value;
  });
  return {child,ready,read};
}

test('Gallery starts a real source preview and releases its listener when its stdin owner closes',async t=>{
  const {child,ready}=await controller(t,0);
  assert.equal(ready.state,'ready');assert.equal(ready.owned,true);
  assert.equal(new URL(ready.url).hostname,'127.0.0.1');
  assert.equal(new URL(ready.url).protocol,'http:');
  assert.equal((await fetch(ready.url)).status,200);
  child.stdin.end();
  await waitFor(()=>child.exitCode===0);
  await assert.rejects(fetch(ready.url));
});

test('Gallery reuses only the current repository preview and leaves it running on close',async t=>{
  const server=await createPreviewServer({port:0});
  t.after(()=>server.close());
  const {child,ready}=await controller(t,new URL(server.url).port);
  assert.deepEqual(ready,{state:'ready',url:server.url+'/',owned:false});
  child.stdin.end();await waitFor(()=>child.exitCode===0);
  assert.equal((await fetch(server.url)).status,200);
});

test('Gallery reports a reused service disappearing instead of retaining a ready status',async t=>{
  const server=await createPreviewServer({port:0});
  t.after(()=>server.server.listening?server.close():undefined);
  const {child,read}=await controller(t,new URL(server.url).port);
  await server.close();
  const stopped=await waitFor(async()=>{const value=await read();return value?.state==='error'?value:undefined;});
  assert.match(stopped.message,/已停止/);
  await waitFor(()=>child.exitCode===1);
});

test('Gallery refuses unrelated localhost services and other repository identities',async t=>{
  const source=await createPreviewServer({port:0});
  const metadata=await(await fetch(source.url+'/api/source')).json();
  await source.close();
  for(const body of [{}, {...metadata,repo:tmpdir()}]) {
    const server=createServer((_,response)=>response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(body)));
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    try {
      const {child,ready}=await controller(t,server.address().port);
      assert.equal(ready.state,'error');assert.match(ready.message,/不属于当前仓库/);
      await waitFor(()=>child.exitCode===1);
      assert.equal(server.listening,true);
    } finally {await new Promise(done=>server.close(done));}
  }
});
