# Design: Ameow documentation content completion

## Objective

把 `ameow-site` 从 MVP 文档站扩展为中文用户文档基本完整的站点。信息架构以用户任务为中心，而不是以内部模块为中心。实现仍然保持 Astro 自由首页 + Starlight 文档区。

## Information Architecture

文档区建议按 6 个分组组织：

```text
docs/
  index.mdx
  getting-started.md
  concepts.md
  downloads.md
  desktop/
    floating-window.md
    files-and-folders.md
    links-and-queue.md
    output-folder.md
    settings.md
  browser-extension.md
  extension/
    install.md
    connection.md
    supported-sites.md
    cookies-and-login.md
  advanced/
    quality-and-formats.md
    ae-compatibility.md
    download-dependencies.md
  troubleshooting/
    index.md
    macos-first-run.md
    extension-disconnected.md
    download-failures.md
    missing-files.md
  releases/
    index.md
```

Recommended sidebar groups:

- 入门
  - 文档首页
  - 下载 Ameow
  - 快速上手
  - 基础概念
- 桌面端使用
  - 悬浮窗口
  - 文件与文件夹
  - 链接与下载队列
  - 输出目录
  - 常用设置
- 浏览器扩展
  - 浏览器扩展
  - 安装扩展
  - 连接桌面端
  - 支持站点
  - Cookies 与登录态
- 高级使用
  - 质量偏好与格式
  - AE 兼容格式
  - 下载依赖与自动准备
- 故障排查
  - 排查入口
  - macOS 首次启动
  - 扩展未连接
  - 下载失败
  - 找不到文件
- 版本记录
  - Release Notes

## Page Contracts

Each user-facing page should include:

- Purpose: what user problem this page solves.
- Short path: the fastest steps for the common case.
- Details: platform or edge-case sections when needed.
- Exit path: where to go next if the user succeeds or fails.
- Public-safe wording: describe behavior visible to users, not private implementation.

`concepts.md` scope:

- Explain the user mental model: floating window, output folder, download queue, browser extension, and settings.
- Do not duplicate the docs index.
- Link into the practical workflow pages.

`faq.md` scope:

- Preserve `/docs/faq/`.
- Act as a short, scannable question entry page.
- Link deeper troubleshooting pages instead of duplicating all detailed steps.

`advanced/download-dependencies.md` scope:

- Use the user-facing title “下载依赖与自动准备”.
- Explain that Ameow may prepare needed download components when first required.
- Avoid internal runtime architecture details.

`browser-extension.md` scope:

- Preserve `/docs/browser-extension/` as the canonical extension overview URL.
- Link to detailed extension install, connection, supported-sites, and Cookies pages.
- Do not add a second `extension/index.md` page that duplicates the existing overview route.

## Release Notes Migration

Source files: `release-notes/v*.md`.

URL strategy:

- All source files are migrated into a single Starlight page:
  - `src/content/docs/docs/releases/index.md`

Page structure:

- `/docs/releases/` should list stable releases first.
- Pre-release notes should be grouped under “预发布记录”.
- Each entry should include version, stability label, and short summary if available.
- Full note content should be included inline for each version because the existing notes are short.

Content transformation:

- Preserve Chinese user-facing release note wording.
- Translate English release notes into Chinese before including them.
- Preserve the `Full Changelog` link.
- Add Starlight frontmatter with `title` and `description`.
- Do not rewrite release history unless necessary for broken links or site navigation.
- Missing versions such as `v0.2.3` should not be invented.

## Homepage Scope

Homepage currently works as a product landing page. For this task, homepage changes should be limited to keeping entry points aligned with the expanded docs:

- Add or adjust links to downloads, docs, browser extension, troubleshooting, and release notes if needed.
- Avoid a redesign unless content changes make the current homepage misleading.

## Content Safety

Public docs may describe:

- Visible UI behavior.
- User actions.
- Supported platforms and package types.
- Supported sites at the time of writing.
- Cookies/login-state concepts at a high level.
- Runtime preparation from a user perspective.

Public docs should avoid:

- Internal implementation names unless already public and necessary.
- Private architecture details.
- Debug panels or workflows intended only for maintainers.
- Promises that a third-party site will always work.
- Details that could imply credential extraction beyond user-directed extension behavior.

## Validation Approach

- `npm run build` inside `site/` must pass.
- Starlight routes must build for all planned pages.
- Navigation should expose every top-level page.
- Public links should point to stable URLs or GitHub Releases.
- Existing GitHub Pages workflow should continue to deploy without configuration changes.
- Visual verification should include mobile and common desktop widths because the expanded sidebar can become long.

## Tradeoffs

- Migrating all release notes into one page gives the site a complete user-facing version history without creating sidebar bloat.
- Keeping advanced docs high-level avoids stale internals and still helps users understand settings and failures.
- Deferring i18n keeps this task focused on complete Chinese content.
