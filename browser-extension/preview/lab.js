import {scenarios, sites} from './scenarios.js';
const $ = id => document.getElementById(id);
const initial = new URLSearchParams(location.search);
let scene = scenarios.some(([id]) => id === initial.get('scene')) ? initial.get('scene') : 'unauthorized';
let generation = 0;
for (const [id, label] of scenarios) {
  $('scene').add(new Option(label, id));
  const button = document.createElement('button');
  button.textContent = label; button.dataset.scene = id;
  button.addEventListener('click', () => {scene = id; render();});
  $('scenes').append(button);
}
for (const [id, site] of Object.entries(sites)) $('site').add(new Option(site.label, id));
for (const id of ['theme', 'language', 'site', 'tools']) {
  if ([...$(id).options].some(option => option.value === initial.get(id))) $(id).value = initial.get(id);
}
if (!initial.has('theme')) $('theme').value = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
function error(message) {$('error').textContent = message; $('error').hidden = !message;}
function updateUrl() {
  const params = new URLSearchParams({scene, theme: $('theme').value, language: $('language').value,
    site: $('site').value, tools: $('tools').value});
  history.replaceState(null, '', '/?' + params);
  return params;
}
function render() {
  error('');
  const selected = scenarios.find(([id]) => id === scene);
  const restricted = $('site').value === 'restricted';
  $('scene').value = scene;
  $('scene').disabled = restricted;
  $('scene-title').textContent = restricted ? '浏览器内部页面' : selected[1];
  $('scene-description').textContent = restricted ? '当前页面不是普通网页，显示当前代码的不可用状态。' : selected[2];
  for (const button of $('scenes').children) {button.setAttribute('aria-current', String(button.dataset.scene === scene)); button.disabled = restricted;}
  $('tools').disabled = !sites[$('site').value].tools;
  $('popup').style.visibility = 'hidden';
  $('stage').dataset.theme = $('theme').value;
  $('current-state').textContent = '正在载入…';
  const params = updateUrl(); params.set('generation', String(++generation));
  $('popup').src = '/product/popup.html?' + params;
}
$('scene').addEventListener('change', () => {scene = $('scene').value; render();});
for (const id of ['theme', 'language', 'site', 'tools']) $(id).addEventListener('change', render);
$('reset').addEventListener('click', render);
addEventListener('message', event => {
  if (event.source !== $('popup').contentWindow || event.origin !== location.origin) return;
  if (event.data?.kind === 'popup-preview-error') {error('预览载入失败：' + event.data.message); return;}
  if (event.data?.kind !== 'popup-preview' || event.data.generation !== String(generation) || !event.data.ready) return;
  if (!Number.isFinite(event.data.width) || !Number.isFinite(event.data.height)) return;
  const height = Math.min(600, Math.max(25, Math.ceil(event.data.height)));
  const width = Math.min(800, Math.max(25, Math.ceil(event.data.width)));
  $('popup').width = String(width); $('stage').style.setProperty('--popup-width', width + 'px');
  $('popup').height = String(height);
  $('popup').style.visibility = 'visible';
  $('dimensions').textContent = width + ' × ' + height + ' px · 100%' + (event.data.width > 800 ? ' · 内容横向溢出' : '') + (event.data.height > 600 ? ' · 内部滚动' : '');
  if (event.data.toolsVisible && $('tools').value !== 'missing') $('tools').value = event.data.toolsEnabled ? 'on' : 'off';
  $('current-state').textContent = [event.data.connection, event.data.status, event.data.copied ? '诊断已复制到预览内存' : ''].filter(Boolean).join(' · ');
  updateUrl();
});
async function showSource(response) {
  if (!response.ok) throw Error(await response.text());
  const source = await response.json();
  $('source').textContent = (source.commit ? source.branch + ' @ ' + source.commit : '当前工作区') + ' · 源码 ' + source.fingerprint.slice(0, 12) + ' · 载入于 ' + new Date(source.loadedAt).toLocaleTimeString('zh-CN');
  $('source-details').textContent = source.repo + '\n' + Object.entries(source.hashes).map(([file, hash]) => file + '\n  ' + hash).join('\n');
  window.__popupPreviewSource = source;
}
$('reload-source').addEventListener('click', async () => {
  $('reload-source').disabled = true;
  try {await showSource(await fetch('/api/refresh', {method: 'POST'})); render();}
  catch (caught) {error('读取当前源码失败：' + caught.message);}
  finally {$('reload-source').disabled = false;}
});
render();
showSource(await fetch('/api/source')).catch(caught => error('源码信息载入失败：' + caught.message));
