# Ameow

<div align="center">
  <p><strong>Ameow is an always-on-top floating window for downloads and quick collection. Drop in files, paste a link, and send web content straight to your desktop.</strong></p>
  <p>
    <a href="./README.md">中文</a> |
    <a href="./README.en.md">English</a> |
    <a href="https://github.com/Wutpeach/Ameow/releases">Download Releases</a> |
    <a href="./docs/getting-started.en.md">Getting Started</a> |
    <a href="./docs/browser-extension.en.md">Browser Extension</a> |
    <a href="./docs/faq.en.md">FAQ</a> |
    <a href="./release-notes/">Release Notes</a>
  </p>
  <p>
    <img alt="Latest release" src="https://img.shields.io/github/v/release/Wutpeach/Ameow?display_name=tag" />
    <img alt="Release workflow" src="https://img.shields.io/github/actions/workflow/status/Wutpeach/Ameow/release.yml?label=release" />
    <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-111827" />
  </p>
</div>

Drop in files, paste a link, and your download or collection starts right away. Add the browser extension, and web video or page content can move straight to the desktop too. One window keeps everyday download tasks in one place.

## Highlights

- **Floating drop zone** — drop files, folders, links, or Windows clipboard content straight into the window.
- **Download queue** — watch progress live, cancel tasks, and run up to three web downloads at once.
- **Browser handoff** — send video URLs, cookies, and download preferences from the extension straight to the desktop app.
- **Settings that stay out of the way** — tune output folders, rename rules, shortcuts, startup behavior, and After Effects integration when you need it.

## Get Ameow

<p>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="Windows Installer EXE" src="https://img.shields.io/badge/Windows-Installer_EXE-2563EB?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="Windows Portable ZIP" src="https://img.shields.io/badge/Windows-Portable_ZIP-0F6CBD?logo=windows&logoColor=white" /></a>
  <a href="https://github.com/Wutpeach/Ameow/releases/latest"><img alt="macOS Apple Silicon DMG" src="https://img.shields.io/badge/macOS-Apple_Silicon_DMG-111827?logo=apple&logoColor=white" /></a>
</p>

For installation, first launch, and platform-specific help, see [Getting Started](./docs/getting-started.en.md).

## Guides

- [Getting Started](./docs/getting-started.en.md): go from install to your first download in a few minutes.
- [Browser Extension](./docs/browser-extension.en.md): send links, cookies, and preferences from the browser to the desktop app.
- [FAQ](./docs/faq.en.md): troubleshoot macOS launch prompts, failed downloads, and connection issues.

## Development

### Requirements

- Node.js 20+
- npm

### Common Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
```

## Acknowledgements

Some of Ameow's core capabilities are built on top of excellent open-source projects. Special thanks to `yt-dlp`, `gallery-dl`, and `FFmpeg` for providing the foundation for web media extraction, resource downloading, and downstream media processing.

We also appreciate the maintainers of the many other open-source projects used throughout this repository.
