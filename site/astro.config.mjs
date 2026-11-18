// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeBlack from 'starlight-theme-black';

// https://astro.build/config
export default defineConfig({
	site: 'https://wutpeach.github.io',
	base: '/Ameow',
	integrations: [
		starlight({
			plugins: [starlightThemeBlack({})],
			customCss: ['./src/styles/pagination.css'],
			title: 'Ameow',
			description: 'Ameow 0.5.0 · Windows and macOS floating downloads · 安装与使用指南。',
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
    {
        "label": "入门",
        "translations": {
            "en": "Getting Started"
        },
        "items": [
            "docs",
            "docs/getting-started",
            "docs/downloads",
            "docs/concepts",
            "docs/faq",
            "docs/releases"
        ]
    },
    {
        "label": "桌面端",
        "translations": {
            "en": "Desktop"
        },
        "items": [
            "docs/desktop/floating-window",
            "docs/desktop/links-and-queue",
            "docs/desktop/output-folder",
            "docs/desktop/settings"
        ]
    },
    {
        "label": "下载与组件",
        "translations": {
            "en": "Downloads & Components"
        },
        "items": [
            "docs/extension/supported-sites",
            "docs/advanced/quality-and-formats",
            "docs/advanced/download-dependencies"
        ]
    },
    {
        "label": "故障排查",
        "translations": {
            "en": "Troubleshooting"
        },
        "items": [
            "docs/troubleshooting",
            "docs/troubleshooting/macos-first-run",
            "docs/troubleshooting/error-messages",
            "docs/troubleshooting/download-failures",
            "docs/troubleshooting/missing-files"
        ]
    },
    {
        "label": "扩展与兼容",
        "translations": {
            "en": "Extensions & Compatibility"
        },
        "collapsed": true,
        "items": [
            "docs/browser-extension",
            "docs/extension/install",
            "docs/extension/connection",
            "docs/extension/cookies-and-login",
            "docs/desktop/files-and-folders",
            "docs/advanced/ae-compatibility",
            "docs/troubleshooting/extension-disconnected"
        ]
    },
    {
        "label": "开发者指南",
        "translations": {
            "en": "Developer Guide"
        },
        "items": [
            "docs/developer",
            "docs/developer/local-development",
            "docs/developer/environment-variables",
            "docs/developer/testing",
            "docs/developer/docs-and-locales"
        ]
    }
],
		}),
	],
});
