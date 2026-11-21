import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname, extname, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {build} from 'esbuild';

const directory=dirname(fileURLToPath(import.meta.url));
const extension=resolve(directory,'..'), repo=resolve(extension,'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const script='<script type="module" src="popup.js"></script>';
const bootstrap='<script src="/fixture.js"></script><script type="module" src="/start.js"></script>';
const files=new Map([['/','index.html'],['/lab.css','lab.css'],['/lab.js','lab.js'],
  ['/fixture.js','fixture.js'],['/scenarios.js','scenarios.js'],['/start.js','start.js']]);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};

async function capture() {
  const inputs=new Map();
  async function input(path) {
    const bytes=await readFile(path); inputs.set(path,bytes); return bytes;
  }
  const [html,css,cat]=await Promise.all([
    input(resolve(extension,'popup.html')),input(resolve(extension,'popup.css')),
    input(resolve(repo,'assets/brand/tray/macos/ameow-menu-bar-white.svg')),
    input(resolve(extension,'package-lock.json')),
  ]);
  const result=await build({entryPoints:[resolve(extension,'src/popup.mjs')],absWorkingDir:extension,
    bundle:true,write:false,format:'esm',target:'chrome120',minify:false,loader:{'.svg':'text'},
    plugins:[{name:'preview-source-capture',setup(builder){
      builder.onLoad({filter:/\.(mjs|svg)$/},async args=>{
        if(args.path.split(/[\\/]/).includes('node_modules'))return;
        return {contents:(await input(args.path)).toString(),loader:extname(args.path)==='.svg'?'text':'js',resolveDir:dirname(args.path)};
      });
    }}],
  });
  if(html.toString().split(script).length!==2)throw Error('Popup脚本入口已变化，请同步preview/server.mjs中的启动适配。');
  const artifacts=new Map([
    ['/product/popup.html',['text/html; charset=utf-8',html.toString().replace(script,bootstrap)]],
    ['/product/popup.css',['text/css; charset=utf-8',css]],
    ['/product/popup.js',['text/javascript; charset=utf-8',result.outputFiles[0].contents]],
    ['/product/ameow-cat.svg',['image/svg+xml',cat]],
  ]);
  const hashes=Object.fromEntries([...inputs].map(([path,bytes])=>[relative(repo,path).replaceAll('\\','/'),sha(bytes)]).sort(([a],[b])=>a.localeCompare(b)));
  const bundleSha256=sha(result.outputFiles[0].contents);
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  let branch='',commit='';
  try {branch=git('branch','--show-current');commit=git('rev-parse','--short=8','HEAD');} catch { /* Source archives remain usable without Git metadata. */ }
  return {artifacts,metadata:{repo,branch,commit,loadedAt:new Date().toISOString(),
    fingerprint:sha(JSON.stringify({hashes,bundleSha256})),hashes,bundleSha256}};
}

export async function createPreviewServer({port=4322}={}) {
  let snapshot=await capture();
  const server=createServer(async(request,response)=>{
    const origin='http://127.0.0.1:'+server.address().port;
    const url=new URL(request.url,origin);
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'");
    try {
      if(url.pathname==='/api/refresh') {
        if(request.method!=='POST'){response.writeHead(405).end();return;}
        if(request.headers.origin!==origin){response.writeHead(403).end();return;}
        snapshot=await capture();
      } else if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
      let type,body;
      if(url.pathname==='/api/source'||url.pathname==='/api/refresh') {
        type='application/json; charset=utf-8';body=JSON.stringify(snapshot.metadata);
      } else if(snapshot.artifacts.has(url.pathname)) {
        [type,body]=snapshot.artifacts.get(url.pathname);
      } else if(files.has(url.pathname)) {
        const file=files.get(url.pathname);type=mime[extname(file)];body=await readFile(resolve(directory,file));
      } else if(url.pathname==='/favicon.ico'){response.writeHead(204).end();return;}
      else {response.writeHead(404).end('Not found');return;}
      response.writeHead(200,{'Content-Type':type});response.end(request.method==='HEAD'?undefined:body);
    } catch(error) {
      console.error(error);response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'}).end(error.message);
    }
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',done);});
  return {server,url:'http://127.0.0.1:'+server.address().port,
    close:()=>new Promise((done,reject)=>server.close(error=>error?reject(error):done()))};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {values}=parseArgs({options:{port:{type:'string',default:'4322'}}});
  const port=Number(values.port);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口必须是1到65535之间的整数。');
  try {const preview=await createPreviewServer({port});console.log('Popup preview: '+preview.url+'/');}
  catch(error){console.error(error.code==='EADDRINUSE'?'端口已被占用。可打开现有预览，或用 --port 指定其他端口。':error.message);process.exitCode=1;}
}
