import { build } from 'esbuild';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const out = new URL('./dist/', import.meta.url);
await mkdir(out, { recursive: true });
await build({ entryPoints: ['src/background.mjs', 'src/popup.mjs'], outdir: fileURLToPath(out), bundle: true, format: 'esm', target: 'chrome120', minify: false });
await build({ entryPoints: ['src/page.mjs'], outdir: fileURLToPath(out), bundle: true, format: 'iife', target: 'chrome120', loader: { ".svg": "text", ".css": "text" } });
await copyFile(new URL('src/page.css', import.meta.url), new URL('page.css', out));
for (const file of ['manifest.json', 'popup.html', 'popup.css']) await copyFile(new URL(file, import.meta.url), new URL(file, out));
const manifest = JSON.parse(await readFile(new URL('manifest.json', out)));
const licenses = await Promise.all(['tldts', 'tldts-core'].map(async name => name + '\n' + await readFile(new URL('node_modules/' + name + '/LICENSE', import.meta.url), 'utf8')));
licenses.push('Lucide icons (vendored scissors, broom-sparkles)\n' + await readFile(new URL('third-party/lucide-LICENSE', import.meta.url), 'utf8'));
await writeFile(new URL('LICENSES.txt', out), licenses.join('\n\n'));
const extensionId = [...createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest().subarray(0, 16)]
  .map(b => String.fromCharCode(97 + (b >> 4), 97 + (b & 15))).join('');
const source = createHash('sha256');
for (const file of ['manifest.json','popup.html','popup.css','build.mjs','package-lock.json','src/core.mjs','src/background.mjs','src/popup.mjs','src/page.mjs','src/icons/scissors.svg','src/icons/broom-sparkles.svg','third-party/lucide-LICENSE','src/page-core.mjs','src/page-background.mjs','src/page-ui.css','src/page.css','../assets/brand/tray/macos/ameow-menu-bar-white.svg']) {
  source.update(file); source.update(await readFile(new URL(file, import.meta.url)));
}
await writeFile(new URL('build.json', out), JSON.stringify({ version: manifest.version, extensionId, sourceSha256: source.digest('hex') }, null, 2));
console.log(`Extension ${manifest.version}: ${extensionId}`);
