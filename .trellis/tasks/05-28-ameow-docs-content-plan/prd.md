# Ameow documentation content plan

## Goal

为已经上线的 `ameow-site` Astro/Starlight 文档站制定内容规划，并在本子任务后续执行完成后，让中文文档内容达到“基本填充完毕”的状态：软件使用的主要方面都应有可阅读、可执行、可维护的公开文档。内容优先服务“新用户第一次成功使用 Ameow”的路径，同时覆盖浏览器扩展、网页视频下载、登录态、常用设置、故障排查、版本更新和 release notes 站内归档。

## Parent Task

- Parent: `.trellis/tasks/archive/2026-05/05-28-astro-starlight-ameow-site`
- Public site: `https://wutpeach.github.io/ameow-site/`
- Site source submodule: `site/`

## Confirmed Facts

- 当前站点已经上线并可匿名访问。
- 当前站点内容为中文优先，英文/i18n 后续迭代。
- 当前站点已有页面：
  - `/`：Astro 自定义产品首页。
  - `/docs/`：Starlight 文档首页。
  - `/docs/getting-started/`：快速上手。
  - `/docs/browser-extension/`：浏览器扩展。
  - `/docs/downloads/`：下载入口。
  - `/docs/faq/`：FAQ。
- 当前站点内容主要从现有 README 和 `docs/*.md` 迁移，属于 MVP 级别。
- 主仓库现有可复用内容：
  - `README.md` / `README.en.md`
  - `docs/getting-started.md` / `.en.md`
  - `docs/browser-extension.md` / `.en.md`
  - `docs/faq.md` / `.en.md`
  - `release-notes/v*.md`
  - 产品预览 SVG：`docs/readme/*.svg`
- README 中明确的主要功能包括：
  - 悬浮窗口
  - 下载队列
  - 浏览器联动
  - 设置可控
- 现有文档已提到但尚未系统展开的主题包括：
  - 输出目录和文件收集流程。
  - Windows/macOS 安装与首次启动。
  - 浏览器扩展安装和本地连接。
  - Cookies、质量偏好、AE 兼容格式偏好。
  - 站点支持范围：YouTube、Bilibili、X/Twitter、Douyin、Xiaohongshu。
  - macOS unsigned DMG 放行。
  - 下载失败、扩展未连接、找不到文件。
- 近期开发记录中还存在更深的可写主题，例如稳定站点登录 profiles、下载架构、浏览器扩展控制台、上下文感知工具栏，但这些需要再判断是否适合公开用户文档。

## Target Audiences

- 新用户：想知道 Ameow 是什么、怎么下载、怎么完成第一次收集或下载。
- 桌面日常用户：关心拖拽、粘贴、输出目录、下载队列、设置和快捷操作。
- 浏览器扩展用户：关心扩展安装、连接状态、站点支持、Cookies 和质量偏好。
- macOS 用户：关心 unsigned DMG、系统放行、quarantine 和平台限制。
- 问题排查用户：遇到下载失败、扩展未连接、文件找不到、站点不支持。
- 潜在贡献者或高级用户：可能需要开发环境、仓库结构、release notes，但不是首轮内容主目标。

## Implemented Content Architecture

### Level 1: Product And Download

- `首页`
  - 目标：让第一次打开站点的人立刻知道 Ameow 是桌面悬浮下载与收集入口。
  - 本任务只做必要入口调整，例如加入 Release Notes、故障排查、浏览器扩展等入口；不重新设计首页。
- `下载 Ameow`
  - 目标：明确各平台该下载哪个包。
  - 应补充：Windows Installer vs Portable、macOS Apple Silicon DMG、浏览器扩展 zip、版本选择建议。

### Level 2: Getting Started

- `快速上手`
  - 目标：让新用户完成第一次启动、第一次拖拽/粘贴、第一次打开输出目录。
  - 应补充：更明确的步骤标题、成功判断、下一步推荐。
- `基础概念`
  - 目标：解释悬浮窗口、输出目录、下载队列、浏览器扩展之间的关系。
  - 推荐新增为独立页面，避免快速上手过长。

### Level 3: Core Workflows

- `拖拽文件与文件夹`
  - 目标：解释文件、文件夹、Windows 剪贴板文件、输出目录切换。
- `粘贴链接与下载队列`
  - 目标：解释支持的链接类型、队列状态、并发、取消、失败重试。
- `输出目录与文件管理`
  - 目标：解释默认目录、打开目录、切换目录、找不到文件时怎么查。
- `常用设置`
  - 目标：解释主题、全局快捷键、开机启动、重命名规则、AE 集成。

### Level 4: Browser Extension

- `浏览器扩展`
  - 目标：保留为总览页，解释安装、连接、当前能力。
- `扩展安装`
  - 目标：更细地覆盖 Release zip、Load unpacked、开发者模式。
- `扩展连接桌面端`
  - 目标：解释 Connected/Disconnected、本地 WebSocket、桌面端必须先启动。
- `站点支持`
  - 目标：列出 YouTube、Bilibili、X/Twitter、Douyin、Xiaohongshu 当前支持边界。
- `Cookies 与登录态`
  - 目标：解释为什么某些站点需要登录态，用户需要怎么处理；不暴露内部实现细节。

### Level 5: Troubleshooting

- `FAQ`
  - 目标：作为问题入口。
  - 应重构为更可扫描的问题分组。
- `macOS 首次启动与放行`
  - 目标：把 unsigned DMG、右键打开、隐私与安全性、quarantine 命令集中讲清楚。
- `扩展未连接`
  - 目标：本地连接、防火墙、重启应用、重载扩展的排查路径。
- `下载失败`
  - 目标：输出目录、网络、站点支持、登录态、链接有效性。
- `找不到文件`
  - 目标：默认输出目录、打开目录、切换目录后的定位。

### Level 6: Release And Advanced

- `版本更新`
  - 目标：说明在哪里看 Releases、如何理解 release notes、如何选择最新稳定版本。
- `Release Notes`
  - 目标：把主仓库 `release-notes/v*.md` 迁移到站内，让用户能在文档站浏览历史版本变化。
  - 建议结构：`/docs/releases/` 为单页聚合版本记录，不为每个短 release note 创建单独侧边栏页面。
  - 内容策略：正式版全部迁移；rc/pre-release 版本也迁移，但单独放到“预发布记录”分组，避免和稳定版混在一起。
  - 英文 release notes 需要翻译成中文后进入站内。
- `高级下载行为`
  - 目标：未来解释质量偏好、AE 兼容格式、转码、运行时准备。
  - 本子任务内应写基础用户说明，不写内部命令拼装和实现细节。
- `开发者说明`
  - 目标：未来承接 README 里的开发命令和仓库结构。
  - 不建议作为用户文档首轮重点。

## Content Completion Strategy

本子任务的总体目标不是只补一个最小 MVP，而是完成中文文档站的基本内容骨架和主要正文。执行时采用优先级分层：

### P0: New User Success Path

优先保证新用户第一次成功使用 Ameow：

1. 强化 `下载 Ameow`
2. 重写 `快速上手`
3. 新增 `基础概念`
4. 新增或强化 `输出目录与文件管理`
5. 新增 `macOS 首次启动与放行`
6. 重构 `FAQ`

这组页面必须先完成，因为它决定站点能否帮助用户从“看到产品”走到“第一次成功收集/下载”。

### P1: Common Workflows

覆盖日常使用路径：

1. `拖拽文件与文件夹`
2. `粘贴链接与下载队列`
3. `常用设置`
4. `浏览器扩展`
5. `扩展连接桌面端`

### P2: Advanced But Public-Safe Topics

覆盖高级内容的基础说明，但避免写内部实现细节：

1. `站点支持`
2. `Cookies 与登录态`
3. `质量偏好与 AE 兼容格式`
4. `下载失败排查`
5. `版本更新`
6. `Release Notes` 站内单页聚合归档

### Later Iterations

这些仍然留到后续，不要求在本子任务内完成：

- 英文/i18n。
- 开发者文档。
- 内部调试面板或未发布能力教程。
- 自动从主仓库同步文档。

## Requirements

- 内容以中文为主，英文/i18n 后续迭代。
- 本子任务完成后，中文文档站应达到“基本填充完毕”：核心页面不再是占位或最小迁移文本，主要用户路径都有可执行步骤和排查入口。
- “基本填充完毕”包含软件使用的主要方面：下载安装、首次启动、文件收集、链接下载、输出目录、队列、设置、浏览器扩展、站点支持、登录态/Cookies、质量偏好、AE 兼容格式、macOS 放行、常见故障、版本更新和 release notes。
- 内容优先级必须先保障新用户第一次成功使用 Ameow，再补浏览器扩展和高级下载主题。
- Release notes 应迁移到站内，而不是只保留 GitHub Releases 外链。
- Release notes 迁移范围包含正式版和 rc/pre-release 版本；正式版和预发布版必须分组展示。
- Release notes 采用 `/docs/releases/` 单页聚合方式承载，避免侧边栏出现大量短版本页。
- 英文 release notes 必须翻译成中文后进入站内，不保留英文原文作为主内容。
- `/docs/faq/` 必须保留为常见问题入口页，即使故障排查拆分为多个专题页面。
- 文档面向公开用户，不写私有实现细节、内部调试流程或未发布能力承诺。
- 页面标题和导航应让非开发用户能理解，不以内部模块名命名。
- 每个页面必须有明确用户任务，而不是功能清单堆叠。
- 文档应优先复用现有 README、docs 和 release notes 中已经公开的事实。
- 涉及版本、下载包和平台支持时，应以 GitHub Releases 的实际发布状态为准。
- 涉及站点支持和登录态时，应避免承诺“永久支持”，使用“当前支持/会继续演进”这类表述。

## Acceptance Criteria

- [x] 明确中文文档站基本填充完成所需的页面清单和优先级。
- [x] 每个计划页面都有目标用户、用户任务、主要章节和验收标准。
- [x] 明确哪些内容仍放到本子任务之外的后续迭代。
- [x] 明确首页范围：只做必要入口调整，不重新设计。
- [x] 明确 release notes 的站内迁移范围、URL 结构和正式版/预发布版分组方式。
- [x] 明确英文 release notes 的处理方式：翻译为中文。
- [x] 明确 `/docs/faq/` 保留策略。
- [x] 用户确认内容规划后，再进入正文写作和站点实现。
- [x] 中文文档正文已基本填充完毕，覆盖下载安装、首次启动、文件收集、链接下载、输出目录、队列、设置、浏览器扩展、站点支持、登录态/Cookies、质量偏好、AE 兼容格式、macOS 放行、常见故障、版本更新和 release notes。

## Out of Scope

- 不在本任务中做完整英文/i18n。
- 不写内部工程文档、调试面板文档或未发布功能教程。
- 不改变 GitHub Pages 部署架构。

## Open Questions

- 无。
