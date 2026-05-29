# Improve Ameow site documentation quality

## Goal

重构 `ameow-site` 中文用户文档的内容表达质量，让文档从“索引式跳转页面”变成“用户打开某个页面就能直接完成任务”的专业产品文档。页面可以继续互相链接，但链接只能作为延伸阅读或下一步，不应替代当前页面的核心答案。同时为后续补充截图建立统一的图片占位、存放目录和命名规则。

## Problem Statement

用户反馈当前文档“到处使用超链接索引回答”，很多页面只给一句摘要然后让用户跳到另一页，导致阅读体验像目录而不是可执行指南。当前文档还缺少截图或视觉提示，用户不容易确认自己看到的界面、按钮、状态是否正确。

本任务先进入规划阶段，并与 Claude 讨论内容策略。后续实施时应以专业、面向普通用户、可直接执行为目标重写正文。

## Confirmed Facts

- 文档站位于独立子模块 `site/`，仓库为 `https://github.com/Wutpeach/ameow-site.git`。
- 当前站点使用 Astro + Starlight，文档源文件位于 `site/src/content/docs/docs/`。
- 当前有 24 个文档源文件，覆盖入门、桌面端、浏览器扩展、高级使用、故障排查和 Release Notes。
- 当前 `site/public/images/` 只有：
  - `preview-desktop.svg`
  - `preview-browser.svg`
  - `preview-settings.svg`
  - `extension-install.svg`
  - `favicon.svg`
- 当前页面存在明显索引式表达：
  - `faq.md` 多数问题只给一两句摘要，然后“请看某页面”。
  - `browser-extension.md` 的“详细步骤”是 3 个链接列表，而不是本页内给出完整安装/连接/使用路径。
  - `downloads.md` 对下载入口和包选择有基本说明，但缺少“我应该下载哪个文件”的识别方式和截图占位。
  - `extension/install.md` 有步骤，但缺少 Chrome/Edge 操作细节、成功判断和截图占位。
  - `troubleshooting/download-failures.md` 指向多个专题页，当前页没有把排查路径写成足够完整的决策树。
- 上一轮实现已迁移 Release Notes，保留 `/docs/releases/` 单页聚合。
- 用户希望配图先用 `[什么类型的图片]` 标注，后续由用户补充图片文件。
- 用户已确认 FAQ 入口统一移动到“入门”组末尾，“故障排查”组保留具体排查专题页。
- 用户已确认采用推荐实施范围：一次性完整重写 P0、P1、P2 页面，Release Notes 基本不动。

## Documentation Quality Principles

- 每个专题页必须先回答本页标题承诺的问题。
- 用户打开任意一个工作流或故障排查页面，应能不跳页完成主要操作。
- 自包含规则：把页面里所有链接暂时遮住后，用户仍应能完成该页面承诺的核心任务。
- 链接用于：
  - 进阶说明。
  - 下一步阅读。
  - 避免重复的大型背景知识。
  - 版本记录或外部下载入口。
- 链接不得用于替代核心步骤、关键判断、成功/失败状态说明。
- FAQ 可以保留短入口属性，但每个问题至少应包含可执行的快速答案、适用条件、下一步；不能只有“请看链接”。
- 文档语气应像产品用户手册，而不是开发任务摘要。
- 页面应包含“你应该看到什么”或“成功后是什么状态”，帮助用户自检。
- 全站语气保持一致，首轮推荐使用“你”，避免“你/您”混用。
- 故障排查页面必须有显式分支判断，例如“如果下载任务已经开始 / 如果完全没有开始”。

## Image Placeholder Strategy

首轮重写时不直接生成最终截图，先在正文中加入标准图片占位：

```md
[截图：Ameow 主悬浮窗口，显示空闲状态和当前输出目录入口]
```

占位格式要求：

- 使用方括号。
- 以 `截图：` 或 `示意图：` 开头。
- `截图：` 用于真实 app UI、浏览器 UI、系统弹窗、设置页面。
- `示意图：` 用于概念流程、决策树、前后关系说明。
- 描述必须具体到画面内容，而不是只写“配图”。
- 描述应可直接作为后续图片 alt text 使用。
- 占位应靠近对应步骤，不能集中堆在页面顶部或底部。

后续图片建议统一放在：

```text
site/public/images/docs/
```

建议命名规则：

```text
<page-slug>-<topic>.png
```

示例：

- `getting-started-floating-window.png`
- `getting-started-output-folder.png`
- `downloads-github-release-assets.png`
- `downloads-github-release-assets-annotated.png`
- `extension-install-load-unpacked.png`
- `extension-connected-popup.png`
- `troubleshooting-macos-security-allow.png`
- `troubleshooting-macos-quarantine-dialog.png`
- `download-failures-queue-error.png`

实施时应同时创建：

```text
site/public/images/docs/README.md
```

这个 README 记录每个图片占位对应的预期文件名，作为后续补图清单。

Markdown 引用路径建议使用：

```md
![Ameow 主悬浮窗口空闲状态](/ameow-site/images/docs/getting-started-floating-window.png)
```

如果后续希望兼容不同 `base`，可再评估是否使用 Astro 组件或 Starlight 图片组件。

## Target Rewrite Scope

### High Priority Pages

- `getting-started.md`
  - 从安装、首次启动、拖入文件、粘贴链接、打开输出目录写成完整端到端教程。
  - 加入每一步“你应该看到什么”。
  - 加入关键截图占位。
- `downloads.md`
  - 明确普通用户如何识别 GitHub Release 资产。
  - 用表格说明 Windows Installer、Portable ZIP、macOS DMG、browser extension zip。
  - 加入 Release Assets 区域截图占位。
- `faq.md`
  - 保留入口属性，但每个问题必须给出本页可执行答案。
  - 链接只放在答案末尾作为“继续深入”。
  - 侧边栏中移动到 `入门` 组末尾。
- `browser-extension.md`
  - 作为扩展自包含 walkthrough，而不是只做 hub。
  - 本页应直接包含安装、连接、发送下载任务的最短路径；子页面只作为边界情况和更细说明。
  - 加入扩展弹窗连接状态截图占位。
- `extension/install.md`
  - 写清 Chrome/Edge 的开发者模式、Load unpacked、选择目录、成功判断。
  - 加入安装步骤截图占位。
- `extension/connection.md`
  - 写清 Connected/Disconnected 状态、桌面端启动顺序、重连操作。
  - 加入连接状态截图占位。
- `troubleshooting/download-failures.md`
  - 写成完整排查决策树，而不是索引页。
  - 必须包含显式分支，例如“任务完全没出现 / 任务出现但失败 / 一直准备中 / 已完成但找不到文件”。
  - 对输出目录、网络、站点支持、Cookies、下载依赖、重试路径分别给出可执行动作。
- `troubleshooting/macos-first-run.md`
  - 加入 macOS 安全提示、右键打开、系统设置放行、quarantine 命令的截图占位。

### Medium Priority Pages

- `desktop/floating-window.md`
- `desktop/files-and-folders.md`
- `desktop/output-folder.md`
- `desktop/links-and-queue.md`
- `desktop/settings.md`
- `extension/supported-sites.md`
- `extension/cookies-and-login.md`
- `advanced/quality-and-formats.md`
- `advanced/ae-compatibility.md`
- `advanced/download-dependencies.md`
- `troubleshooting/extension-disconnected.md`
- `troubleshooting/missing-files.md`

这些页面应补足本页可执行步骤、成功判断、常见误解、必要截图占位。

### Low Priority / Preserve Mostly

- `releases/index.md`
  - 保持作为版本历史归档。
  - 不要求改成图文教程。
- `index.mdx`
  - 可以保留导航性质，但需要更像“文档门户”，不是替代教程。

## Requirements

- 中文优先。
- 不改变 Astro Starlight + GitHub Pages + `site/` submodule 架构。
- 不改变现有核心 URL。
- 不把页面写成纯链接目录。
- 每个工作流页面至少包含：
  - 用户目标。
  - 准备条件。
  - 具体步骤。
  - 成功判断。
  - 常见失败点。
  - 相关截图占位。
- 工作流页面建议至少有 2 个图片占位：起始状态和成功状态；如果某一步依赖视觉确认，则该步骤附近应有占位。
- 每个故障排查页面至少包含：
  - 现象描述。
  - 快速判断。
  - 按优先级排列的排查步骤。
  - 什么时候需要换路径或升级版本。
  - 相关截图占位。
- 故障排查页面至少包含 1 个症状或修复相关图片占位，并至少包含一个明确分支判断。
- FAQ 每个答案都必须能在当前页面解决最常见情况。
- `请看 [X]`、`详见 [X]` 这类纯跳转句应尽量减少，目标每页不超过 2 处，且不能替代必要步骤。
- 低于约 400 个中文实质字符的普通专题页应视为内容不足，需要补充；Release Notes、索引页可例外。
- 侧边栏顺序和页面正文承诺需要一致，页面第一段应直接回应侧边栏标题。
- 图片占位必须具体、可交付，后续用户能按占位清单补图。
- 需要告诉用户图片应放到 `site/public/images/docs/`，并给出命名规则。
- 需要与 Claude 讨论文档策略，并把采纳/不采纳的建议写入规划。

## Acceptance Criteria

- [x] 已完成本地文档问题审阅，列出主要问题类型和受影响页面。
- [x] 已向 Claude 咨询文档质量优化方案。
- [x] 已把 Claude 建议整合进 `design.md` 或 PRD。
- [x] 明确页面重写原则：本页直接回答，链接只作延伸。
- [x] 明确图片占位格式、存放目录和命名规则。
- [x] 明确首轮必须重写的高优先级页面清单。
- [x] 明确哪些页面只需要轻量增强或保留。
- [x] 后续实施前，用户确认内容重构方案。
- [x] 已按确认范围重写 P0、P1、P2 文档页面，`releases/index.md` 基本保持不动。
- [x] 已创建 `site/public/images/docs/README.md` 作为后续补图清单。
- [x] 质量检查通过：构建、内部链接、纯跳转句、图片占位映射、页面长度、语气混用和乱码检查。

## Out of Scope

- 本规划阶段不直接重写所有正文。
- 不要求本轮生成或拍摄真实截图。
- 不做英文/i18n。
- 不改 GitHub Pages 部署流程。
- 不重做首页视觉设计，除非内容入口文字与文档结构不匹配。

## Open Questions

- 无。
