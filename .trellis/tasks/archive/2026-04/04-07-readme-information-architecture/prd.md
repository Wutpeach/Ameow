# brainstorm: optimize README information architecture

## Goal

为 FlowSelect 重新定义 README 的职责边界，减少首页信息负担，明确哪些内容应该保留在 README，哪些内容应该迁移到独立使用手册或文档站，并形成一套可执行的信息架构方案。

## What I already know

* 当前 `README.md` 和 `README.en.md` 都较长，承担了产品介绍、下载入口、安装说明、开发者快速开始、用户使用说明、扩展安装、仓库结构、维护说明等多种职责。
* 当前 `README.md` 约 223 行、739 词，中文与英文 README 基本是完整双份维护。
* README 中的“截图 / 界面预览”并不是真实产品截图，而是位于 `docs/readme/` 下的三张 SVG 预览图：
  * `preview-desktop.svg`
  * `preview-settings.svg`
  * `preview-browser.svg`
* 仓库中暂时没有现成的真实产品界面截图或录屏 GIF 资源。
* 仓库已经有一个独立的 planning 任务：`03-12-github-pages-docusaurus-public-docs`，其结论倾向于未来建立公开 docs 仓库与 GitHub Pages 文档站。
* 当前 `docs/` 目录主要承载 README 资源图和少量工程说明文档，不是面向终端用户的完整使用手册。

## Assumptions (temporary)

* README 的核心目标应优先服务首次访问仓库的人，而不是承载完整用户手册。
* 如果未来会建设公开文档站，那么 README 更适合作为产品落地页 + 导航入口。
* 如果短期内不会建设完整文档站，也至少需要一个更轻量的“使用手册 / 安装说明”承接页。

## Open Questions

* 无（已收敛）

## Requirements (evolving)

* 给出 README 推荐职责边界与页面结构。
* 判断 README 是否应保留产品界面截图，以及保留时的素材标准。
* 判断是否需要增加“使用手册 / 文档站”入口链接，并说明放置位置与承接内容。
* 尽量复用仓库现有文档与未来 docs 规划，避免重复建设。
* 输出结果应能直接指导后续 README 改写。
* README 采用“产品入口页”定位，不再承担完整用户手册职责。
* 短期先在仓库内建立轻量 `docs/` 文档体系，作为 README 的用户手册承接层。
* README 仅保留 1 张真实主界面截图，不再放多张示意图充当产品截图。

## Acceptance Criteria (evolving)

* [x] 明确 README 的目标受众排序与核心目标。
* [x] 给出推荐的信息架构方案（README 保留项 / 迁移项 / 可删除项）。
* [x] 给出截图策略建议（不用、少量真实截图、或暂时使用替代素材）。
* [x] 给出“使用手册 / 文档站链接”策略建议及其前置条件。
* [x] 形成一个可落地的 README MVP 结构草案。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 本任务暂不直接改写 README 文案。
* 本任务暂不创建新的 Docusaurus 站点。
* 本任务暂不制作真实产品截图或录屏素材。

## Technical Notes

* 已检查文件：
  * `README.md`
  * `README.en.md`
  * `docs/readme/*`
  * `.trellis/tasks/03-12-github-pages-docusaurus-public-docs/prd.md`
* 外部参考（2026-04 检索）：
  * GitHub Docs: About the repository README file
  * GitHub Docs: Setting guidelines for repository contributors
  * ShareX GitHub README
  * LocalSend GitHub README
  * yt-dlp GitHub README / Wiki
* 当前观察到的主要问题：
  * README 职责混杂，既像 landing page，又像 install guide，还像 user manual 和 contributor guide。
  * 非真实截图可能削弱可信度，尤其对首次访问者。
  * 中英文双份长文档会放大后续维护成本。

## Research Notes

### What similar tools do

* GitHub Docs 将 README 定义为仓库访问者首先看到的入口，典型内容包括：
  * 项目做什么
  * 为什么有用
  * 如何开始使用
  * 去哪里获得帮助
  * 谁在维护与贡献
* GitHub Docs 同时明确建议：更长的文档更适合放到 wiki 或独立文档中，而不是塞进 README。
* GitHub Docs 还建议把贡献者规范拆到 `CONTRIBUTING.md`，因为 GitHub 会单独给它提供可发现入口。
* ShareX 的 GitHub README 更像产品落地页：顶部价值主张、真实截图、外链到官网/文档页；深度说明分散到官网 docs。
* LocalSend 的 GitHub README 保留少量关键说明，但对于协议与更深层解释会直接链接外部 documentation。
* yt-dlp 即使 README 很长，也仍然把更细的安装与使用问题继续导向 Wiki/FAQ；它更适合 CLI power-user 项目，而不是 FlowSelect 这种 GUI 产品。

### Constraints from our repo/project

* FlowSelect 是 GUI 桌面应用 + 浏览器扩展，README 首页更像产品着陆页，而不是 CLI reference。
* 当前仓库还没有真实产品截图或录屏素材，若继续放“伪截图”，会影响可信度。
* 未来已有 Docusaurus 公共文档站规划，因此 README 最终大概率会演化为入口页，而不是主手册。
* 目前用户说明、开发说明、发布维护说明都在 README 里，导致首次访问者无法快速抓住核心价值。

### Feasible approaches here

**Approach A: README 作为产品入口页，使用手册外置** (Recommended)

* How it works:
  * README 只保留价值主张、适用场景、核心能力摘要、下载入口、少量真实截图/演示、文档入口、开发者入口。
  * 用户操作步骤、扩展安装、平台细节、故障排查迁移到 `docs/` 内手册，未来再迁移到 Docusaurus。
* Pros:
  * 最符合 GitHub README 的入口定位。
  * 首页明显更轻，用户更容易理解产品。
  * 与未来 docs 站方向一致，后续迁移成本最低。
* Cons:
  * 需要额外维护一份手册页或 docs 首页。

**Approach B: README 保持单文件主文档，但极限压缩**

* How it works:
  * 继续把主要说明留在 README，只是大幅删减章节，把开发者与维护者内容拆出去。
* Pros:
  * 改动最小，不依赖新文档入口。
  * 适合短期快速收敛。
* Cons:
  * README 仍会承担手册职责，后续继续膨胀的概率很高。
  * 与未来 docs 站会形成重复内容。

**Approach C: README 强产品营销化，几乎不放说明**

* How it works:
  * README 只保留品牌介绍、亮点、下载按钮、截图和跳转链接，所有使用与开发信息全部跳 docs。
* Pros:
  * 首页最简洁，产品感最强。
* Cons:
  * 在 docs 还没建设完善前，会让仓库内信息断层。
  * 对直接从 GitHub 来安装或开发的人不够友好。

## Decision (ADR-lite)

**Context**: 当前 README 同时承担产品介绍、下载说明、使用手册、开发者入口、维护说明，导致首页过长且职责模糊；同时仓库未来已有公共文档站规划。  
**Decision**: 采用 Approach A，将 README 收敛为“产品入口页”，把完整用户手册迁移到独立文档承接页。  
**Consequences**:
* 优点：README 更符合 GitHub 首页角色，首次访问者能更快理解产品价值与入口。
* 优点：与未来 Docusaurus 文档站方向一致，后续迁移路径清晰。
* 代价：需要额外维护一个短期文档承接页，并决定其与未来文档站的衔接方式。

## Follow-up Decision

**Context**: 未来会建设 Docusaurus 文档站，但当前不能等待 docs 站完成后再为 README 提供承接层。  
**Decision**: 短期先在当前仓库内建立小型 `docs/` 用户文档体系，例如：
* `docs/getting-started.md`
* `docs/browser-extension.md`
* `docs/faq.md`
  README 顶部或下载区提供入口，未来再迁移到 Docusaurus。  
**Consequences**:
* 优点：可以立刻瘦身 README，同时避免信息断层。
* 优点：后续迁移到 Docusaurus 时，已有内容边界和页面拆分基础。
* 代价：短期会存在 README + docs 两层维护，但比双语长 README 更可控。

## Screenshot Decision

**Context**: 当前 README 使用的是示意 SVG，而不是产品真实截图；这对 GitHub 首页访客的产品判断与可信度不够理想。  
**Decision**: README 仅保留 1 张真实主界面截图，优先展示桌面主悬浮窗。设置页、扩展安装示意等下沉到 `docs/` 文档页。  
**Consequences**:
* 优点：首页更短，同时保留必要的视觉确认。
* 优点：减少为了“展示完整产品”而在 README 堆叠多图。
* 代价：需要补一张真实截图素材后再执行最终改写。

## README MVP Structure

1. 顶部品牌区
   * Logo
   * 一句话价值主张
   * 语言切换
   * 下载 / 快速上手 / 浏览器扩展 / Release Notes
2. What It Is
   * 1 段简短介绍
   * 适合谁用（3 条以内）
3. Key Capabilities
   * 4 个以内的能力摘要，避免展开成长列表
4. One Real Screenshot
   * 仅 1 张真实主界面图
5. Download
   * Windows / macOS 下载按钮
   * 非常短的平台说明
6. Docs
   * `快速上手`
   * `浏览器扩展安装`
   * `FAQ / 常见问题`
7. Developer
   * 最小开发启动命令
   * 指向更详细开发文档或仓库结构说明
8. Footer Links
   * Release Notes
   * License
   * Contributing / Maintainer docs（如后续补）

## Recommended Docs Split

* `docs/getting-started.md`
  * 安装与第一次启动
  * 基础收集流程
  * 输出目录与设置入口
* `docs/browser-extension.md`
  * 扩展安装
  * 连接桌面端
  * 支持站点与常见问题
* `docs/faq.md`
  * macOS 拦截
  * 下载失败
  * 剪贴板 / 拖拽行为差异

## Keep / Move / Remove

### Keep in README

* 品牌区与一句话定位
* 适合场景
* 核心能力摘要
* 1 张真实主界面截图
* 下载入口
* 文档入口
* 最小开发者启动入口

### Move out of README

* 详细“如何使用”
* 典型工作流
* 浏览器扩展安装步骤
* 平台特定安装细节与排障
* 详细打包产物说明
* 维护者发布说明

### Remove or Simplify

* 多张示意 SVG 预览图
* 过长的架构概览
* 首页上的大段维护说明
* 与文档页重复的分步骤操作说明

## Expansion Options (for MVP boundary)

1. Future evolution
   * 未来 README 顶部可直接接入公开 docs 站入口，仓库内手册逐步退场。
   * 中英文内容可能从“双 README 全量维护”过渡为“README 简版 + docs 多语言”。
2. Related scenarios
   * 浏览器扩展安装说明应与桌面端快速上手拆分，否则 README 仍会继续膨胀。
   * 开发者说明与维护者发布说明适合拆到独立文档，例如 `CONTRIBUTING.md` 或 `docs/maintainer/`。
3. Failure & edge cases
   * 如果短期没有文档承接页，README 过度删减会导致信息断层。
   * 如果仍使用非真实截图但未明确标注，会继续损伤产品可信度。
