import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const out = new URL('./dist/', import.meta.url);
await mkdir(out, { recursive: true });
await build({ entryPoints: ['src/background.mjs', 'src/popup.mjs'], outdir: fileURLToPath(out), bundle: true, format: 'esm', target: 'chrome120', minify: false, loader:{'.svg':'text'} });
await build({ entryPoints: ['src/page.mjs'], outdir: fileURLToPath(out), bundle: true, format: 'iife', target: 'chrome120', loader: { ".svg": "text", ".css": "text" } });
await copyFile(new URL('../assets/brand/tray/macos/ameow-menu-bar-white.svg', import.meta.url), new URL('ameow-cat.svg', out));
await copyFile(new URL('src/page.css', import.meta.url), new URL('page.css', out));
for (const file of ['manifest.json', 'popup.html', 'popup.css']) await copyFile(new URL(file, import.meta.url), new URL(file, out));
const manifest = JSON.parse(await readFile(new URL('manifest.json', out)));
// Reuse the approved application icon's PNG frames without redrawing or resampling.
const appIcon = await readFile(new URL('../assets/brand/ameow.ico', import.meta.url));
await mkdir(new URL('icons/', out), { recursive: true });
for (const [size, path] of Object.entries({ ...manifest.icons, ...manifest.action.default_icon })) {
  const entries = Array.from({ length: appIcon.readUInt16LE(4) }, (_, i) => 6 + i * 16);
  const entry = entries.find(p => (appIcon[p] || 256) === Number(size) && (appIcon[p + 1] || 256) === Number(size));
  if (entry === undefined) throw Error(`Missing approved Ameow icon frame: ${size}`);
  const offset = appIcon.readUInt32LE(entry + 12);
  const png = appIcon.subarray(offset, offset + appIcon.readUInt32LE(entry + 8));
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error(`Ameow icon frame is not PNG: ${size}`);
  await writeFile(new URL(path, out), png);
}
const licenses = await Promise.all(['tldts', 'tldts-core'].map(async name => name + '\n' + await readFile(new URL('node_modules/' + name + '/LICENSE', import.meta.url), 'utf8')));
licenses.push('Lucide icons (page tools and Popup)\n' + await readFile(new URL('third-party/lucide-LICENSE', import.meta.url), 'utf8'));
await writeFile(new URL('LICENSES.txt', out), licenses.join('\n\n'));
const extensionId = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(b => String.fromCharCode(97 + (b >> 4), 97 + (b & 15))).join('');
const source = createHash('sha256');
for (const file of ['manifest.json','popup.html','popup.css','build.mjs','package-lock.json','src/core.mjs','src/background.mjs','src/popup.mjs','src/page.mjs','src/icons/scissors.svg','src/icons/marker-range-in.svg','src/icons/marker-range-out.svg','third-party/lucide-LICENSE','src/page-core.mjs','src/page-background.mjs','src/page-ui.css','src/page.css','../assets/brand/tray/macos/ameow-menu-bar-white.svg','../assets/brand/ameow.ico']) {
  source.update(file); source.update(await readFile(new URL(file, import.meta.url)));
}
for(const name of ['copy','check','rotate-ccw','circle-alert','info','chevron-down']) {
  const file='../assets/'+name+'.svg'; source.update(file); source.update(await readFile(new URL(file,import.meta.url)));
}
await writeFile(new URL('build.json', out), JSON.stringify({ version: manifest.version, extensionId, sourceSha256: source.digest('hex') }, null, 2));
console.log(`Extension ${manifest.version}: ${extensionId}`);
