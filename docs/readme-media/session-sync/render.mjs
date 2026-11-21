// Run the unchanged product popup with a local, credential-free example transport.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
assert(process.argv[2], 'Pass the reviewed Popup v2 dist directory');
const dist = resolve(process.argv[2]);
const playwright = process.env.PLAYWRIGHT_MODULE || 'D:/Ameow-handoffs/issue50-marker-toggle-20261120/candidate-ui-ec57a670-r7/payload/node_modules/playwright-core/index.mjs';
const executablePath = process.env.CHROMIUM_PATH || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const { chromium } = await import(pathToFileURL(playwright));
const revision = 'c9f7ca43cbc1e0acda24207d232763c931222cc4';
const output = join(root, 'docs/readme-media/.work/session-sync-popup-v2');
const assets = join(root, 'docs/images/readme');
await mkdir(join(output, 'frames'), { recursive: true });
const build = JSON.parse(await readFile(join(dist, 'build.json')));
assert.equal(build.sourceSha256, '2e1d393c1a08a401e94e4e005bdbdf7424c733b1b27c6944082fc250ce7be2b3', 'Build must match the approved Popup v2 package');
const expectedHashes = {
  'popup.html': '1c1d1f4ba235a36cab9895950e184566371acae708593b1a15fb7810fffe8cbc',
  'popup.css': '63e1b3f7c4c31be3489bfc3b8800cee71afaea8fae82ccd323f419124c0e57e2',
  'popup.js': 'f53bf2310efd39bd364b01e6157ebe3562632a1351f508af9256781edf4a66a5',
  'ameow-cat.svg': '337bf491c6c84891f9246a70e535dca23bc3ed34fb71cc158d431a8893a9bc21',
};
const files = {};
const hashes = {};
for (const [name, expected] of Object.entries(expectedHashes)) {
  files['/' + name] = await readFile(join(dist, name));
  hashes[name] = createHash('sha256').update(files['/' + name]).digest('hex');
  assert.equal(hashes[name], expected, name + ' differs from the reviewed product build');
}
// The frozen build retains working-tree line endings; serve its exact pinned bytes.
const normalize = data => data.toString('utf8').replaceAll(String.fromCharCode(13,10), String.fromCharCode(10));
for (const name of ['popup.html', 'popup.css']) {
  assert.equal(normalize(files['/' + name]), normalize(execFileSync('git', ['show', `${revision}:browser-extension/${name}`], { cwd: root })));
}
const contractText = normalize(await readFile(new URL('./sample-contract.json', import.meta.url)));
assert.equal(createHash('sha256').update(contractText).digest('hex'), '7c8522c7e602a88dfd1b6f14b6136c2b111c830591957753f6d73211c129b135', 'Synthetic contract differs from the reviewed product sample');
const contract = JSON.parse(contractText);
assert.equal(contract.synthetic, true);
assert.equal(contract.source_head, revision);
const server = createServer((request, response) => {
  const data = files[request.url];
  if (!data) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', request.url.endsWith('.css') ? 'text/css' : request.url.endsWith('.js') ? 'text/javascript' : request.url.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
  response.end(data);
});
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-extensions', '--no-first-run'] });
const errors = [], requests = [];
const fps = 20, frameCount = 140;
const report = { revision, build, hashes, fps, seconds: frameCount / fps, width: 640,
  scope: 'Unchanged Popup v2, already-authorized synthetic current site, Page tools on and diagnostics collapsed; no permission dialog, Native host, account, Cookie or download', states: [] };
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 500 }, deviceScaleFactor: 2, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', userAgent: 'Mozilla/5.0 Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0' });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    requests.push(route.request().url());
    return route.request().url().startsWith(origin + '/') ? route.continue() : route.abort();
  });
  await page.addInitScript(contract => {
    let synced = false, finish;
    globalThis.exampleCalls = [];
    globalThis.finishExampleSync = () => { synced = true; finish(); };
    globalThis.chrome = {
      tabs: { query: async () => [contract.tab] },
      permissions: { request: async () => { throw Error('Permission confirmation is outside this demonstration'); } },
      runtime: { sendMessage: async ({ action, site }) => {
        exampleCalls.push({ action, site });
        if (action === 'pages-status') return structuredClone(contract.other_messages.pages_status);
        if (site !== contract.site) throw Error('Unexpected demonstration site');
        if (action === 'sync') { await new Promise(resolve => { finish = resolve; }); return { ok: true, value: { [contract.site]: 'synced' } }; }
        if (action === 'status') return structuredClone(contract.status_response[synced ? 'saved' : 'unknown_result']);
        throw Error('Unexpected demonstration action: ' + action);
      } }
    };
  }, contract);
  await page.goto(origin + '/popup.html');
  await page.getByRole('button', { name: '立即同步', exact: true }).waitFor();
  assert.equal(await page.locator('#status').textContent(), '同步结果未知');
  assert.equal(await page.locator('#site').textContent(), contract.site);
  assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'), 'true');
  assert(await page.locator('#diagnostics').evaluate(e => !e.open));
  assert(await page.locator('#page-tools').evaluate(e => Boolean(e.compareDocumentPosition(document.querySelector('.session')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  report.states.push({ at: 0, status: await page.locator('#status').textContent() });
  const contentHeight = Math.ceil(await page.locator('main').evaluate(e => e.getBoundingClientRect().height));
  await page.setViewportSize({ width: 320, height: contentHeight });
  report.height = contentHeight * 2;
  // A cursor is a capture overlay. The product DOM, font, layout and response stay unchanged.
  await page.evaluate(() => {
    const cursor = document.createElement('div'); cursor.id = 'capture-cursor';
    cursor.style.cssText = 'position:fixed;z-index:10;pointer-events:none;width:22px;height:28px;display:none';
    cursor.innerHTML = '<svg width=22 height=28 viewBox="0 0 24 30"><path d="M3 2v21l6-5 4 9 4-2-4-9h8Z" fill="#292a2c" stroke="white" stroke-width="2"/></svg>';
    document.body.append(cursor);
  });
  const sync = page.getByRole('button', { name: '立即同步', exact: true });
  const box = await sync.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const away = { x: 275, y: contentHeight - 25 };
  for (let index = 0; index < frameCount; index++) {
    let p;
    if (index >= 22 && index <= 35) { const t = (index - 22) / 13; p = { x: away.x + (point.x - away.x) * t, y: away.y + (point.y - away.y) * t }; }
    else if (index > 35 && index < 71) p = point;
    else if (index >= 71 && index <= 83) { const t = (index - 71) / 12; p = { x: point.x + (away.x - point.x) * t, y: point.y + (away.y - point.y) * t }; }
    await page.evaluate(p => { const c = document.querySelector('#capture-cursor'); c.style.display = p ? 'block' : 'none'; if (p) { c.style.left = p.x + 'px'; c.style.top = p.y + 'px'; } }, p);
    if (p) await page.mouse.move(p.x, p.y);
    if (index === 36) await page.mouse.down();
    if (index === 38) { await page.mouse.up(); await page.waitForFunction(() => exampleCalls.some(c => c.action === 'sync')); assert(await sync.isDisabled()); }
    if (index === 53) {
      await page.evaluate(() => finishExampleSync());
      await page.waitForFunction(() => document.querySelector('#status').textContent === '已同步');
      assert(await page.locator('#notice').evaluate(e => e.hasAttribute('data-success')));
      assert.equal(await page.locator('#status-detail').textContent(), '');
      assert.equal(await page.locator('#toggle-tools').getAttribute('aria-pressed'), 'true');
      assert(await page.locator('#diagnostics').evaluate(e => !e.open));
      assert.doesNotMatch(await page.locator('main').innerText(), /安装来源|保留的快照|Cookie/);
      report.states.push({ at: index / fps, status: await page.locator('#status').textContent() });
    }
    await page.screenshot({ path: join(output, 'frames', `frame-${String(index).padStart(3, '0')}.png`) });
  }
  assert.deepEqual(errors, []);
  assert(requests.every(url => url.startsWith(origin + '/')));
  assert.deepEqual((await page.evaluate(() => exampleCalls)).map(c => c.action), ['pages-status','status','sync','status']);
  assert(await page.locator('body').evaluate(e => e.scrollHeight <= innerHeight));
  await copyFile(join(output, 'frames/frame-120.png'), join(assets, 'session-sync-poster.png'));
  execFileSync('ffmpeg', ['-v','error','-y','-framerate',String(fps),'-i',join(output,'frames/frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',join(assets,'session-sync.gif')], { stdio: 'inherit' });
  report.initialHoldSeconds = 1.1; report.finalHoldSeconds = (frameCount - 84) / fps; report.pass = true;
} finally {
  await browser.close(); await new Promise(done => server.close(done));
  await writeFile(join(output, 'capture.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
