import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {createPreviewServer} from '../preview/server.mjs';
import {scenarios} from '../preview/scenarios.js';

const preview=await createPreviewServer({port:0});
const browser=await chromium.launch({headless:true,...(process.env.AMEOW_BROWSER?{executablePath:process.env.AMEOW_BROWSER}:{channel:process.platform==='win32'?'msedge':'chrome'})});
const evidence=process.env.AMEOW_PREVIEW_EVIDENCE&&resolve(process.env.AMEOW_PREVIEW_EVIDENCE);
if(evidence)await mkdir(evidence,{recursive:true});
const context=await browser.newContext({viewport:{width:1000,height:850},colorScheme:'light'});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{if(response.status()>=400)errors.push(response.status()+' '+response.url());});
await context.route('**/*',route=>{requests.push(route.request().url());return new URL(route.request().url()).origin===preview.url?route.continue():route.abort();});
async function ready(){
  await page.waitForFunction(()=>{const iframe=document.querySelector('#popup');return iframe.contentWindow?.location.href===iframe.src&&iframe.contentWindow.__popupPreview?.ready&&iframe.style.visibility==='visible';});
  return page.frameLocator('#popup');
}
try {
  await page.goto(preview.url+'/');
  let frame=await ready();
  assert.equal(await page.locator('#scenes button').count(),scenarios.length);
  for(const scene of ['synced','failed','pending','unknown','unauthorized']){
    await page.locator('button[data-scene="'+scene+'"]').click();frame=await ready();
    assert.equal(await frame.locator('.actions button:visible').count(),1);
    const width=await frame.locator('html').evaluate(node=>node.getBoundingClientRect().width);
    assert.equal((await page.locator('#popup').boundingBox()).width,width);
    assert.match(await page.locator('#dimensions').innerText(),new RegExp('^'+width+' × '));
  }
  for(const theme of ['light','dark'])for(const language of ['zh','en'])for(const site of ['bilibili','youtube']){
    await page.locator('#theme').selectOption(theme);
    await page.locator('#language').selectOption(language);
    await page.locator('#site').selectOption(site);frame=await ready();
    const label=frame.locator('#tools-title'),info=frame.locator('#tools-info'),toggle=frame.locator('#toggle-tools');
    assert.equal(await label.innerText(),language==='zh'?'切片/下载 工具条':'Clip/download toolbar');
    const a=await label.boundingBox(),b=await info.boundingBox(),c=await toggle.boundingBox(),popupBounds=await frame.locator('html').boundingBox();
    assert(a.x+a.width<=b.x && b.x+b.width<=c.x,'label, info and switch must not overlap');
    assert(c.x+c.width<=popupBounds.x+228 && c.width===36,'switch must fit the 240px Popup');
    assert.equal(await frame.locator('html').evaluate(node=>node.scrollWidth),240);
    await info.focus();await info.press('Enter');
    assert(await frame.locator('#tools-help').isVisible());
    assert.equal(await frame.locator('#tools-help').innerText(),language==='zh'?'在支持的视频页面显示下载与切片入口。':'Show download and clip actions on supported video pages.');
    if(evidence && site==='bilibili')await page.locator('#popup').screenshot({path:resolve(evidence,`tools-help-${theme}-${language}.png`)});
    await page.keyboard.press('Escape');
    assert.equal(await frame.locator('#tools-help').isVisible(),false);
    assert(await info.evaluate(node=>node===document.activeElement));
    await page.keyboard.press('Tab');
    assert(await toggle.evaluate(node=>node===document.activeElement));
    const enabled=await toggle.getAttribute('aria-pressed');
    await toggle.press('Space');assert.notEqual(await toggle.getAttribute('aria-pressed'),enabled);
    await toggle.press('Space');assert.equal(await toggle.getAttribute('aria-pressed'),enabled);
    await page.locator('#dimensions').click();
    if(evidence)await page.locator('#popup').screenshot({path:resolve(evidence,`tools-${site}-${theme}-${language}.png`)});
  }
  await page.locator('#theme').selectOption('light');
  await page.locator('#language').selectOption('zh');
  await page.locator('#site').selectOption('bilibili');frame=await ready();
  const lightBackground=await frame.locator('html').evaluate(node=>getComputedStyle(node).backgroundColor);
  await page.locator('#theme').selectOption('dark');frame=await ready();
  assert.notEqual(await frame.locator('html').evaluate(node=>getComputedStyle(node).backgroundColor),lightBackground);
  await page.locator('#language').selectOption('en');frame=await ready();
  assert.equal(await frame.locator('html').getAttribute('lang'),'en');
  await frame.locator('#authorize').click();await frame.locator('#sync').waitFor();
  await frame.locator('#copy-diagnostic').click();
  assert.match(await frame.locator('html').evaluate(()=>window.__popupPreview.copied),/Site: bilibili.com/);
  await page.locator('#reset').click();frame=await ready();assert(await frame.locator('#authorize').isVisible());
  await page.locator('#site').selectOption('ordinary');frame=await ready();assert.equal(await frame.locator('#page-tools').isVisible(),false);
  await page.locator('#reload-source').click();
  await page.waitForFunction(()=>!document.querySelector('#reload-source').disabled);
  await ready();
  await page.setViewportSize({width:320,height:850});
  assert.equal(await page.locator('html').evaluate(node=>node.scrollWidth),320);
  assert.equal((await page.locator('#popup').boundingBox()).width,await page.frameLocator('#popup').locator('html').evaluate(node=>node.getBoundingClientRect().width));
  assert(requests.every(url=>new URL(url).origin===preview.url));assert.deepEqual(errors,[]);
  if(evidence){
    await page.locator('#stage').screenshot({path:resolve(evidence,'preview-320.png')});
    await writeFile(resolve(evidence,'report.json'),JSON.stringify({result:'PASS',scenarios:scenarios.length,errors,externalRequests:0},null,2));
  }
  console.log('PASS Popup preview: states, actual dimensions, themes, language, interactions, refresh and isolation.');
} finally {await browser.close();await preview.close();}
