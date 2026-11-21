// Gallery owns this controller through stdin; an existing service stays independent.
import {parseArgs} from 'node:util';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpath, rename, writeFile} from 'node:fs/promises';

const repo=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
const {values}=parseArgs({options:{receipt:{type:'string'},port:{type:'string',default:'4322'}}});
const port=Number(values.port);
if(!values.receipt||!Number.isInteger(port)||port<0||port>65535)throw Error('需要回执路径和有效端口。');
let preview, timer, closing=false;

async function receipt(value) {
  const pending=values.receipt+'.tmp';
  await writeFile(pending,JSON.stringify(value));
  await rename(pending,values.receipt);
}

async function probe(url) {
  let response;
  try {response=await fetch(url+'/api/source',{signal:AbortSignal.timeout(1200)});}
  catch {return 'absent';}
  try {
    if(!response.ok)return 'foreign';
    const source=await response.json();
    if(typeof source.repo!=='string'||await realpath(source.repo)!==repo)return 'foreign';
    const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
    return hash(source.fingerprint)&&hash(source.bundleSha256)&&
      hash(source.hashes?.['browser-extension/popup.css'])&&
      hash(source.hashes?.['browser-extension/src/popup.mjs'])?'matching':'foreign';
  } catch {return 'foreign';}
}

async function shutdown() {
  closing=true;
  clearTimeout(timer);
  process.stdin.destroy();
  const service=preview;preview=undefined;
  if(service) {service.server.closeAllConnections();await service.close();}
}

async function failed(error) {
  if(closing)return;
  const message=error.code==='EADDRINUSE'?'端口4322已被其他服务占用，请先释放端口。':
    error.code==='ERR_MODULE_NOT_FOUND'?'缺少扩展依赖，请在仓库运行 npm ci --prefix browser-extension。':error.message;
  console.error(message);
  await receipt({state:'error',message});
  process.exitCode=1;
  await shutdown();
}

async function monitor(url) {
  if(closing)return;
  if(await probe(url)!=='matching') {
    if(!closing)await failed(Error('预览服务已停止，请重新打开。'));
    return;
  }
  if(!closing)timer=setTimeout(()=>monitor(url).catch(failed),2000);
}

process.stdin.on('end',()=>shutdown().catch(error=>console.error(error)));
process.stdin.resume();
process.on('SIGTERM',()=>shutdown().catch(error=>console.error(error)));
process.on('SIGINT',()=>shutdown().catch(error=>console.error(error)));

try {
  let url='http://127.0.0.1:'+port;
  const existing=port===0?'absent':await probe(url);
  if(closing)process.exitCode=0;
  else {
    if(existing==='foreign')throw Error('端口'+port+'上的服务不属于当前仓库的Popup预览，请先释放端口。');
    if(existing==='absent') {
      const {createPreviewServer}=await import('./server.mjs');
      if(!closing)preview=await createPreviewServer({port});
      if(closing) {if(preview)await shutdown();}
      else url=preview.url;
    }
    if(!closing) {
      await receipt({state:'ready',url:url+'/',owned:!!preview});
      if(!preview)timer=setTimeout(()=>monitor(url).catch(failed),2000);
    }
  }
} catch(error) {await failed(error);}
