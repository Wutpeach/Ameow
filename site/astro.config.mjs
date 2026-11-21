// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeBlack from 'starlight-theme-black';
const base = '/Ameow';

// Preserve useful bookmarks to current topics; retired features have no replacement route.
const movedPages = {
  'getting-started': '',
  'extension/supported-sites': 'supported-sites/',
  'advanced/quality-and-formats': 'supported-sites/#quality',
  'advanced/download-dependencies': 'desktop/settings/#components',
  'troubleshooting/macos-first-run': 'troubleshooting/#mac',
  'developer/local-development': 'developer/',
};
const redirects = Object.fromEntries(['docs', 'en/docs'].flatMap(locale =>
  Object.entries(movedPages).map(([from, to]) => [`/${locale}/${from}/`, `${base}/${locale}/${to}`])
));

// https://astro.build/config
export default defineConfig({
	site: 'https://wutpeach.github.io',
	base,
	redirects,
	integrations: [
		starlight({
			plugins: [starlightThemeBlack({ sidebar: { useDropdowns: true } })],
			customCss: ['./src/styles/pagination.css', './src/styles/manual.css'],
			title: 'Ameow',
			description: 'Ameow · Windows and macOS floating downloads · 安装与使用指南。',
			favicon: '/ameow.ico',
			locales: {
				root: {
					label: '简体中文',
					lang: 'zh-CN',
				},
				en: {
					label: 'English',
					lang: 'en',
				},
			},
			logo: {
				src: './public/ameow-logo.png',
				alt: 'Ameow',
			},
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Wutpeach/Ameow' }],
			sidebar: [
				{ label: '开始使用', translations: { en: 'Get started' }, items: ['docs', 'docs/downloads'] },
				{ label: '使用指南', translations: { en: 'Using Ameow' }, items: [
					'docs/desktop/links-and-queue', 'docs/desktop/output-folder',
					'docs/supported-sites', 'docs/desktop/settings', 'docs/extension', 'docs/cli',
				] },
				{ label: '遇到问题', translations: { en: 'Get help' }, items: ['docs/troubleshooting'] },
				{ label: 'Changelog', collapsed: false, items: [
					'docs/changelog/0-5-1', 'docs/changelog/0-5-0', 'docs/changelog/0-3-1', 'docs/changelog/0-3-0',
					'docs/changelog/0-3-0-rc7', 'docs/changelog/0-3-0-rc6', 'docs/changelog/0-3-0-rc5',
					'docs/changelog/0-3-0-rc4', 'docs/changelog/0-3-0-rc3', 'docs/changelog/0-3-0-rc1',
					'docs/changelog/0-2-9', 'docs/changelog/0-2-8', 'docs/changelog/0-2-7',
					'docs/changelog/0-2-7-rc3', 'docs/changelog/0-2-7-rc2', 'docs/changelog/0-2-6', 'docs/changelog/0-2-2',
				] },
				'docs/developer',
			],
		}),
	],
});
