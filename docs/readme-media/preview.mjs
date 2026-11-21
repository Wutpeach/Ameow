// GitHub-rendered Markdown and GitHub's own current styles, cached for local review.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'docs/readme-media/.work/preview');
const port = Number(process.env.README_PREVIEW_PORT || 8871);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('README_PREVIEW_PORT must be an integer from 1024 to 65535');
await mkdir(output, { recursive: true });
if (process.argv.includes('--build')) {
  let cachedStyles;
  try { cachedStyles = JSON.parse(await readFile(join(output, 'styles.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (cachedStyles) {
    for (const index of cachedStyles.keys()) if (!(await readFile(join(output, `github-${index}.css`))).length) throw Error('Empty cached GitHub style');
  } else {
    const page = await (await fetch('https://github.com/Wutpeach/Ameow', { signal:AbortSignal.timeout(15000) })).text();
    const css = [...new Set([...page.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(https:\/\/github.githubassets.com\/assets\/[^\"]+\.css)"/g)].map(m => m[1]))];
    if (!css.length) throw Error('GitHub styles were not found');
    await Promise.all(css.map(async (url, index) => {
      const response = await fetch(url, { signal:AbortSignal.timeout(15000) }); if (!response.ok) throw Error(url);
      await writeFile(join(output, `github-${index}.css`), await response.text());
    }));
    await writeFile(join(output, 'styles.json'), JSON.stringify(css));
  }
  for (const [language, file] of [['zh','README.md'], ['en','README.en.md']]) {
    const html = execFileSync('gh', ['api', 'markdown', '--input', '-'], { cwd: root, input: JSON.stringify({ text: await readFile(join(root,file),'utf8'), mode: 'gfm', context: 'Wutpeach/Ameow' }), encoding: 'utf8' });
    await writeFile(join(output, language + '.html'), html);
  }
  console.log('Cached both GitHub-rendered READMEs and current GitHub CSS.');
  process.exit(0);
}
const css = JSON.parse(await readFile(join(output, 'styles.json'), 'utf8'));
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'zh';
      const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
      const still = url.searchParams.get('static') === '1';
      let article = await readFile(join(output, lang + '.html'), 'utf8');
      if (still) for (const [gif, poster] of [['desktop-cat','desktop-cat-poster'],['paste-link','paste-link-poster'],['clip-selection','clip-poster'],['session-sync','session-sync-poster']]) article = article.replaceAll(gif + '.gif', poster + '.png');
      const query = (l, t, s) => `/?lang=${l}&amp;theme=${t}&amp;static=${s ? 1 : 0}`;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="${lang === 'en' ? 'en' : 'zh-CN'}" data-color-mode="${theme}" data-light-theme="light" data-dark-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ameow README review</title>${css.map((_, index) => `<link rel="stylesheet" href="/review/github-${index}.css">`).join('')}<style>body{margin:0;background:var(--bgColor-default);color:var(--fgColor-default)}.review-nav{max-width:896px;margin:auto;padding:16px;display:flex;flex-wrap:wrap;gap:16px;font-size:13px}article{max-width:896px;margin:auto;padding:32px}@media(max-width:600px){article{padding:16px}.review-nav{gap:12px}}</style></head><body><nav class="review-nav" aria-label="Review controls"><a href="${query('zh',theme,still)}">简体中文</a><a href="${query('en',theme,still)}">English</a><a href="${query(lang,'light',still)}">GitHub light</a><a href="${query(lang,'dark',still)}">GitHub dark</a><a href="${query(lang,theme,!still)}">${still ? 'Play GIFs' : 'Static posters'}</a></nav><article class="markdown-body">${article}</article></body></html>`);
      return;
    }
    const path = decodeURIComponent(url.pathname);
    let file;
    if (/^\/review\/github-\d+\.css$/.test(path)) file = join(output, path.slice(8));
    else if (/^\/docs\/images\/readme\/[a-z0-9-]+\.(gif|png)$/.test(path)) file = join(root, path.slice(1));
    else if (path === '/site/public/ameow-logo.png') file = join(root, path.slice(1));
    else if (['/README.md','/README.en.md','/CONTRIBUTING.md','/THIRD_PARTY_NOTICES.md','/docs/images/readme/README.md'].includes(path)) file = join(root, path.slice(1));
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    const types = { '.css':'text/css', '.gif':'image/gif', '.png':'image/png', '.md':'text/plain; charset=utf-8' };
    response.setHeader('Content-Type', types[extname(file)]);
    response.end(await readFile(file));
  } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end(error.message); }
});
server.listen(port, '127.0.0.1', () => console.log(`README review: http://127.0.0.1:${port}/ (Chinese/English, GitHub light/dark, GIFs/posters)`));
