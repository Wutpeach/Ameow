# Real Screenshot Pipeline Design

## Architecture

首轮截图流水线必须捕获真实界面。Playwright 或其他工具只能用于控制浏览器、DPR、窗口尺寸、裁剪和输出，不得用重新绘制的 HTML/CSS fixture 替代产品 UI。本轮只输出可二次加工的干净 PNG 素材，不接入文档站。

- `scripts/capture-docs-screenshots.mjs`：统一入口，负责启动真实截图流程、设置 viewport / scale factor、裁剪和输出 PNG。
- `scripts/docs-screenshots/`：未来可放置配置、截图后处理、真实运行态启动辅助逻辑。
- `docs-screenshot-captures/`：唯一输出目录，生成后的图片作为用户二次加工素材。
- Playwright 可以作为根项目 devDependency，但只能在真实截图方案落地时引入；`site/` 保持内容站点职责。

## Rendering Strategy

### Authentic First

文档中的应用截图必须“真实”。确定性和自动化应服务于真实性，而不是绕开真实性：

- 扩展弹窗图片：优先加载真实 `browser-extension/popup.html`、真实 `popup.css`、真实 `popup.js`。可以通过 Playwright 注入受控 `chrome.runtime` / `chrome.tabs` mock 来让真实 popup 进入 Connected / Disconnected 状态，但 DOM 和 CSS 必须是当前扩展源码。
- 桌面悬浮窗口图片：优先启动真实 Electron/Vite 应用，用高 DPI / 高缩放窗口截图、Electron `capturePage()`、Playwright Electron 支持或系统截图工具捕获真实窗口。不得用手绘 200x200 面板替代。
- 输出目录、GitHub Releases、流程图和其他非应用界面图不在当前任务范围内。

### Output Defaults

建议首轮目标输出：

- 宽图 / 页面型示意图：`1600px` 以上有效宽度，DPR 2。
- 扩展 popup 单图：按真实弹窗比例渲染，再通过 DPR 3 输出，保证文档中缩放后清晰。
- 对比图：由真实 Disconnected 和 Connected 弹窗截图组合得到，允许后处理拼接和标注。
- 字体策略：记录截图平台和 scale factor；扩展/桌面截图应使用真实运行环境实际字体。

## Image Roles

本轮扩展截图只输出干净单图，不输出拼接对比图：

- `desktop-main-window-expanded.png`：真实 Electron 主窗口展开空闲状态，截图模式只通过真实鼠标移动/指针边界事件保持展开。
- `desktop-download-active.png`：真实 Electron 主窗口下载中状态，由真实 UI Lab 事件驱动。
- `desktop-transcode-active.png`：真实 Electron 主窗口转码中状态，由真实 UI Lab 事件驱动。
- `desktop-settings-*.png`：真实 Electron 设置窗口，各文件对应设置主界面和每个标签页；截图使用临时 userData，避免泄露本机配置。
- `extension-popup-connected.png`：真实 popup 的 Connected 状态。
- `extension-popup-disconnected.png`：真实 popup 的 Disconnected / Offline 状态。
- `browser-floating-launcher-entry.png`：真实浏览器扩展 content script 贴边入口，注入本地测试页面后截图。

实现时二者应来自同一套真实 popup 捕获流程，避免文案和状态漂移。

## Data Flow

1. 运行真实截图流程。
2. 脚本读取 target 配置和来源类型：真实 Electron、真实扩展、真实网页或明确示意图。
3. 对真实来源启动或连接运行态，并设置 DPI / viewport / scale factor。
4. 截取真实窗口、真实 popup 或真实网页区域。
5. PNG 写入 `docs-screenshot-captures/<target>.png`。
6. 脚本输出生成摘要，包括文件名、尺寸、来源类型和路径。

## Boundaries

- 该流水线属于文档资产工具，不影响应用运行时。
- 不应把 screenshot-only mock 状态混入生产 React/Electron 或扩展逻辑。
- 不允许新增 screenshot-only 重绘页面来冒充应用截图。
- 可对运行态输入进行 mock，例如扩展 API 响应、测试文件目录、测试链接；不可 mock 掉真实 UI 实现。
- 当前任务不得修改 `site` 子仓库，也不得将图片复制到 `site/public/images/docs/`。

## Risks And Mitigations

- 风险：截图不是真实界面，导致文档误导用户。
  缓解：应用/扩展图片验收必须检查来源；禁止重绘 UI；示意图必须明确标注。

- 风险：新增 Playwright 增加安装体积。
  缓解：只在真实截图自动化方案需要时作为 devDependency；脚本增加 Chromium 缺失 preflight 和清晰安装提示。

- 风险：真实 GitHub Releases 页面未来变化导致截图过期。
  缓解：首轮用本地标注图表达下载决策，不依赖线上页面。

- 风险：不同机器字体渲染差异。
  缓解：记录规范截图平台、DPI、scale factor 和窗口尺寸；验收看真实性、清晰度和主要内容，不要求像素级一致。

## Later Expansion

- 增加真实 Electron 悬浮窗口截图模式。
- 增加加载 unpacked extension 的 Chromium 截图模式。
- 扩展到 `site/public/images/docs/README.md` 中的全部占位图。
- 支持对已有图片做尺寸/命名/引用完整性检查。
- 后续再讨论把截图素材二次加工后接入文档站。

## Current Source Findings

- `browser-extension/popup.html` 是真实扩展弹窗入口；`popup.js` 在 `DOMContentLoaded` 后通过 `chrome.runtime.sendMessage(...)` 请求 `get_status`、`get_media_scan_cache`、`scan_page_media`、`get_launcher_controls_state`、`get_theme` 等状态。
- 扩展真实截图的可行方向是：用 Playwright 打开真实 `popup.html`，在页面加载前注入最小 `window.chrome` mock，让真实 `popup.js` 正常渲染目标状态。mock 只能返回状态和媒体候选数据，不能替换 DOM。
- Electron 主窗口由 `electron/main.mts` 的 `createMainWindow()` / `showMainWindow()` 创建，窗口尺寸来自 `getMainWindowOuterSize(...)` 和 `getMainWindowFullOuterSize(...)`，真实窗口是 frameless、transparent、alwaysOnTop。
- Electron 代码库已有 `webContents.capturePage()` 使用案例在 `electron/startupDiagnostics.mts`，说明真实窗口内部截图技术上可行；首轮应优先评估是否能加一个开发/文档专用截图入口来捕获 main window，而不是系统级手工截图。
