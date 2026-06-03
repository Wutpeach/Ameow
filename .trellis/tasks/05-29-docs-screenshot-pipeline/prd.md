# Prototype screenshot pipeline for docs

## Goal

为 Ameow 提供一批干净的高清真实界面截图素材，先覆盖桌面端应用和浏览器扩展。应用界面图片必须来自真实运行界面，包括真实 Electron 桌面端或真实浏览器扩展弹窗；不得用重新绘制的 HTML/CSS fixture 伪装成产品截图。

首轮目标不是接入文档，也不是生成 Release/标注/流程图，而是把可二次加工的高清 PNG 存到本地素材目录，并告知用户路径。

## User Value

- 用户可以拿到清晰、干净、真实的应用/扩展界面素材，用于后续二次加工和文档排版。
- 截图不依赖低分辨率手动截屏。
- 后续新增或更新截图时有脚本入口和命名约定，减少维护成本。
- 文档中的应用图片可信，能反映当前实际开发界面，而不是代理重新绘制的近似 UI。

## Confirmed Facts

- 文档站位于 `site/`，但当前任务不把图片写入 `site/public/images/docs/`，也不修改文档页面。
- 本轮截图素材建议输出到根目录 `docs-screenshot-captures/`，作为用户二次加工的本地素材目录。
- 根项目可以引入 Playwright 作为真实扩展截图自动化工具；`site/` 不参与当前截图流程。
- 浏览器扩展静态文件位于 `browser-extension/`，弹窗入口为 `popup.html`，样式为 `popup.css`，弹窗 CSS 宽度为 `344px`。
- 直接打开扩展 `popup.html` 无法完整复现真实运行态，因为 `popup.js` 依赖 Chrome Extension API 和桌面端连接状态。
- 真实 Electron 悬浮窗口截图受运行状态、窗口尺寸、透明窗口、桌面环境影响，因此需要专门设计真实截图方式，而不是退化为重绘 UI。
- 已撤回一次错误实现：该实现用 HTML/CSS fixture 重绘了应用、扩展和文件管理器示意图，并错误地接入文档。当前已删除这些产物和引用。

## Screenshot Targets

首轮只产出应用和扩展的干净界面图：

1. `desktop-main-window-expanded.png`：真实 Ameow Electron 主窗口展开空闲状态。
2. `desktop-download-active.png`：真实主窗口下载中状态。
3. `desktop-transcode-active.png`：真实主窗口转码中状态。
4. `desktop-settings-hub.png`：真实设置主界面。
5. `desktop-settings-appearance.png`：真实设置「外观与启动」界面。
6. `desktop-settings-saving.png`：真实设置「保存与命名」界面。
7. `desktop-settings-sites.png`：真实设置「站点登录」界面。
8. `desktop-settings-plugins.png`：真实设置「插件与集成」界面。
9. `desktop-settings-system.png`：真实设置「系统与支持」界面。
10. `extension-popup-connected.png`：真实浏览器扩展弹窗 Connected 状态。
11. `extension-popup-disconnected.png`：真实浏览器扩展弹窗 Disconnected / Offline 状态。
12. `browser-floating-launcher-entry.png`：真实浏览器页面贴边小入口。

如实现成本允许，可额外输出同一真实界面的高倍版本或不同状态版本，但不做标注、不拼接对比图。

## Requirements

- 提供一个可重复运行的真实截图入口，例如 `npm run docs:screenshots`，但只负责生成本地高清截图素材。
- 可以在根项目新增 Playwright 作为开发依赖；截图流水线属于 root tooling，而不是 `site/` 内部内容脚本。依赖应随真实截图方案一起引入，不为伪 fixture 单独引入。
- 生成文件写入根目录 `docs-screenshot-captures/`，不写入 `site/public/images/docs/`。
- 首轮图片应为高清 PNG，尺寸和 DPR 在脚本或文档中固定，避免不同机器输出差异过大。
- 应用界面图片必须来自真实运行界面。禁止用重新绘制的 HTML/CSS、静态 mock 或设计稿替代桌面端/浏览器扩展截图。
- 截图必须是干净界面图，不添加箭头、标注、说明文字、外框或拼接版式。
- Release、GitHub、流程图、输出目录、决策树等非应用/扩展图片不在当前任务范围内。
- 图片内容不得包含真实个人路径、账号、浏览器个人资料、私有链接或其他敏感信息。
- 在输出目录内记录简单说明，包含运行命令、截图来源和输出尺寸。
- 截图脚本必须对 Playwright Chromium 未安装给出清晰错误提示，不能只抛出难读堆栈。
- 扩展截图如果使用自动化，应加载真实扩展页面或真实扩展运行上下文；mock 只能用于 Chrome API/桌面连接响应，不得替换真实 DOM/CSS 结构。
- 首轮需明确截图的规范运行环境、DPI / scale factor、窗口尺寸和裁剪策略。

## Acceptance Criteria

- [x] 运行截图流程后，目标 PNG 文件会生成或刷新到 `docs-screenshot-captures/`。
- [x] 每张应用/扩展图片都能追溯到真实运行界面截图方式。
- [x] 每张 PNG 的截图来源、运行环境和输出尺寸有文档记录。
- [x] 生成过程不依赖真实个人账号、私人路径或私有链接。
- [x] 缺少所需截图工具时，脚本输出明确安装/启动指引。
- [x] PNG 均为非空文件，且尺寸符合目标配置。
- [x] 不修改 `site` 子仓库，不接入文档页面。
- [x] 方案已经过 Claude 评审，评审中的必须修正项已合并到计划中或明确延期理由。
- [x] 已撤回错误的重绘 fixture 实现，文档中没有引用伪应用截图。

## Out of Scope

- 首轮不要求生成全部文档图片。
- 首轮不要求补齐全部文档图片。
- 首轮不生成 Release/GitHub/输出目录/流程图/决策树图片。
- 首轮不把图片接入文档站。
- 首轮不处理多语言图片资产；文档当前以中文为主。
- 不允许将重绘 UI 作为应用/扩展截图交付。

## Resolved Decisions

- 真实截图方案可以使用 Playwright 作为根项目开发依赖，但必须服务于真实界面捕获。
- 应用/扩展截图的真实性高于自动化完整度。若某张图暂时无法自动化，也应保持占位或人工高清截图流程，不得用重绘 UI 顶替。
