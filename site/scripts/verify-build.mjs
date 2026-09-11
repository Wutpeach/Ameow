import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const routes = [
	'docs', 'en/docs',
	'docs/developer', 'en/docs/developer',
	'docs/downloads', 'en/docs/downloads',
];
const page = (route) => new URL(`../dist/${route}/index.html`, import.meta.url);
const read = (route) => readFile(page(route), 'utf8');

await Promise.all(routes.map((route) => access(page(route))));
const [zhHome, enHome, zhDownloads, enDownloads] = await Promise.all([
	read('docs'), read('en/docs'), read('docs/downloads'), read('en/docs/downloads'),
]);

for (const [route, html] of [['docs', zhHome], ['en/docs', enHome]]) {
	assert.match(html, /class="card-grid\b/, `${route} home must render its CardGrid`);
	assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh/i, `${route} home must not redirect`);
}
for (const [route, html] of [['docs/downloads', zhDownloads], ['en/docs/downloads', enDownloads]]) {
	assert.match(html, /<ol\b[^>]*\bsl-steps\b/i, `${route} must render Starlight Steps`);
}

console.log(`Verified ${routes.length} required docs routes.`);
