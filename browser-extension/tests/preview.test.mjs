import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPreviewServer} from '../preview/server.mjs';

let preview;
before(async()=>{preview=await createPreviewServer({port:0});});
after(async()=>{await preview?.close();});
const get=path=>fetch(preview.url+path);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('preview serves the actual Popup and captured source identity without a copied UI',async()=>{
  const html=await readFile(new URL('../popup.html',import.meta.url),'utf8');
  const response=await get('/product/popup.html');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(await response.text(),html.replace('<script type="module" src="popup.js"></script>','<script src="/fixture.js"></script><script type="module" src="/start.js"></script>'));
  const css=await readFile(new URL('../popup.css',import.meta.url));
  assert.deepEqual(Buffer.from(await(await get('/product/popup.css')).arrayBuffer()),css);
  const source=await(await get('/api/source')).json();
  assert.equal(source.hashes['browser-extension/popup.css'],sha(css));
  assert.equal(source.hashes['browser-extension/src/popup.mjs'],sha(await readFile(new URL('../src/popup.mjs',import.meta.url))));
  assert.equal(source.bundleSha256,sha(Buffer.from(await(await get('/product/popup.js')).arrayBuffer())));
  assert.match(source.fingerprint,/^[a-f0-9]{64}$/);
});

test('preview exposes only its declared files and read-only source projection',async()=>{
  for(const path of ['/AGENTS.md','/.env','/src/core.mjs','/candidate/popup.html'])assert.equal((await get(path)).status,404);
  assert.equal((await fetch(preview.url+'/product/popup.html',{method:'POST'})).status,405);
  const header=await fetch(preview.url+'/product/popup.css',{method:'HEAD'});
  assert.equal(header.status,200);assert.equal(await header.text(),'');
  for(const path of ['/','/lab.js','/lab.css','/fixture.js','/scenarios.js','/start.js'])assert.equal((await get(path)).status,200);
});

test('source refresh requires an explicit same-origin POST and retains exact unchanged bytes',async()=>{
  assert.equal((await get('/api/refresh')).status,405);
  assert.equal((await fetch(preview.url+'/api/refresh',{method:'POST'})).status,403);
  const previous=await(await get('/api/source')).json();
  const response=await fetch(preview.url+'/api/refresh',{method:'POST',headers:{Origin:preview.url}});
  assert.equal(response.status,200);
  const refreshed=await response.json();
  assert.equal(refreshed.fingerprint,previous.fingerprint);
  assert.equal(refreshed.bundleSha256,previous.bundleSha256);
});
