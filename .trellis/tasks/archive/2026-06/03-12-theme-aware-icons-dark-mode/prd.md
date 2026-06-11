# brainstorm: theme-aware icons for dark mode

## Goal

优化 FlowSelect 在黑色主题下的图标可见性，重点覆盖用户提到的浏览器扩展图标和桌面端任务栏/托盘图标，并评估是否应该根据应用当前主题在黑白两套图标之间自动切换。

## What I already know

* 用户反馈：浏览器扩展图标和桌面端任务栏图标在黑色主题下不够清晰，希望根据应用设置的 `black / white` 主题切换 icon。
* 前端主题系统当前只有两档：`black` 和 `white`，定义在 `src/contexts/ThemeContext.tsx`。
* 浏览器扩展后台已经维护 `currentTheme`，并且会在桌面端主题变化后接收 `theme_changed` / `theme_info` WebSocket 消息。
* 扩展 popup 已经会根据桌面端主题切换 `flowselect-theme-black / flowselect-theme-white` class，说明“主题同步到扩展”这条链路已经存在。
* 浏览器扩展 manifest 当前只声明了一套固定图标：`browser-extension/icons/icon16.png`、`icon48.png`、`icon128.png`。
* 桌面端托盘图标当前在 `src-tauri/src/lib.rs` 中通过 `TrayIconBuilder::new().icon(app.default_window_icon().unwrap().clone())` 固定为默认应用图标，启动后没有再跟随主题更新。
* 当前扩展图标和桌面图标素材本体都是深色猫头、透明底，在深色背景上对比度偏低。
* 本地 Tauri 依赖源码表明：
  * `TrayIcon::set_icon(...)` 支持运行时替换托盘图标。
  * `Window::set_icon(...)` 支持更新窗口图标。
  * Windows 还支持 `set_overlay_icon(...)`，但它是 taskbar overlay，不等同于主窗口 icon。
* Chrome 扩展官方 API 支持 `chrome.action.setIcon(...)` 在运行时替换 toolbar action icon。

## Assumptions (temporary)

* 用户真正关心的是“黑/白主题下都能清楚看见图标”，不一定执着于必须技术上“实时切换”。
* 运行中的桌面窗口/托盘图标可以做主题联动，但安装包、`exe` 文件、开始菜单/桌面快捷方式图标仍然属于静态打包资源，不会天然跟随主题变化。
* 现有主题同步链路足够支撑扩展和桌面端运行时图标切换，不需要重新设计主题协议。

## Open Questions

* 这次要做的范围是“运行时按主题切换”，还是“顺手把所有静态打包图标也一起重绘/替换”？

## Requirements (evolving)

* 黑色主题下的扩展图标和桌面端图标需要明显更易辨认。
* 方案需要兼容现有 `black / white` 主题设置，不引入第三种主题状态。
* 如果采用主题联动方案，图标切换应跟随应用当前主题，而不是跟随浏览器或系统主题各自独立变化。
* 扩展 popup、扩展 action icon、桌面托盘/窗口图标之间的视觉语义应保持一致，不应出现三套不相关的 icon 风格。

## Acceptance Criteria (evolving)

* [ ] 已明确本次范围覆盖哪些图标表面。
* [ ] 已明确是采用静态高对比图标，还是运行时主题联动切换。
* [ ] 若采用运行时切换，已确认扩展和桌面端分别使用的技术路径。
* [ ] 已明确静态打包图标（安装包、快捷方式、文件资源）是否纳入本次范围。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重新设计整个品牌视觉系统
* 新增系统主题自动跟随（除非后续明确要和 app theme 解耦）
* 修改与 icon 可见性无关的 popup 布局或主窗口交互

## Research Notes

### What similar tools do

* 浏览器扩展通常至少保证 action icon 在浅色/深色浏览器顶栏中都有足够对比度；Chrome 官方提供 `chrome.action.setIcon(...)` 作为运行时切换入口。
* 桌面应用通常要么：
  * 使用单套“任何背景都能站住”的高对比品牌图标；
  * 要么在运行时对 tray/icon 采用浅深两套资源。
* 安装包、开始菜单、`exe` 文件图标一般仍是静态资源，不会根据应用内部主题实时变更。

### Constraints from our repo/project

* 扩展侧已有主题同步链路，所以 action icon 跟随 app theme 切换的接入成本相对低。
* 桌面端当前创建 tray 时没有显式 theme-aware icon 更新逻辑，若要运行时切换，需要：
  * 为 tray icon 保留可寻址句柄或稳定 id；
  * 在主题变更时重新设置图标。
* 如果要让主窗口/taskbar button 跟随主题，除了托盘外，还需要额外处理 `Window::set_icon(...)`。
* 当前仓库只有一套深色 PNG/ICO/ICNS 资源，没有黑白双套成品。
* 即使运行时切换成功，打包后的静态安装图标仍需要单独决定是否改成“中性高对比版本”。

### Feasible approaches here

**Approach A: 单套中性高对比 icon**  
(Recommended if we want the lowest-risk fix)

* How it works:
  重新绘制一套在浅色/深色背景都清晰的 icon，扩展和桌面端都继续使用静态资源，不做运行时切换。
* Pros:
  实现最简单；跨平台最稳；不会引入主题切换时序问题；安装包/快捷方式/运行态图标都能一起改善。
* Cons:
  不能真正体现 `black / white` 主题联动；视觉表达空间较小。

**Approach B: 运行时主题联动切换 icon**

* How it works:
  准备 black/white 两套图标资源。扩展通过 `chrome.action.setIcon(...)` 随 app theme 切换；桌面端在主题变更时更新 tray icon，并尽量同步主窗口 icon。
* Pros:
  最符合用户直觉；能让运行中的界面真正“跟主题走”；充分复用现有主题同步链路。
* Cons:
  实现复杂度更高；要处理 tray/window 两条桌面端更新路径；安装包/快捷方式图标仍是静态资源，需要额外决定默认用哪一套。

**Approach C: 混合方案**

* How it works:
  运行时只对“最容易看不清”的表面做主题联动（扩展 action icon + 桌面 tray / 运行窗口），同时把静态打包图标换成一套中性高对比版本。
* Pros:
  兼顾可见性和一致性；可以覆盖“运行中”和“未运行”两类场景；风险低于全量动态化。
* Cons:
  需要同时维护动态和静态两类图标资源；实现和素材工作量高于方案 A。

## Proposed Option C Design

### Design target

把 icon 表面拆成两类处理：

* **运行时可变表面**
  * 浏览器扩展 toolbar/action icon
  * 桌面 tray icon
  * 运行中的桌面窗口 icon（主窗口、settings、context-menu）
* **打包静态表面**
  * `exe` / 安装包 / 快捷方式 / 文件资源里的 app icon

核心原则：

* 运行时表面跟随 app theme (`black` / `white`) 切换黑白两套 icon。
* 静态表面不做“实时切换”，统一换成一套中性高对比 icon，保证未运行时也不会在深色背景里发糊。

### Visual strategy

准备三类素材，而不是只维护一张图：

* `icon-neutral`
  * 用于静态打包资源。
  * 目标是在浅色/深色系统背景里都能站住。
* `icon-dark-surface`
  * 用于黑色主题运行态。
  * 以浅色猫头或浅描边为主，保证在深色 tray / toolbar 背景上可见。
* `icon-light-surface`
  * 用于白色主题运行态。
  * 可以沿用深色猫头或深描边版本。

这样不会把“静态资源也跟主题走”这个本来做不到的事情硬塞进运行时逻辑。

### Runtime theme flow

**Desktop app**

* 主题切换入口仍然只有 `ThemeContext.setTheme(...)`。
* 该入口继续：
  * `emit("theme-changed", t)`
  * `invoke("broadcast_theme", { theme: t })`
* 新增一条桌面端 icon 更新链路：
  * `invoke("sync_theme_icons", { theme: t })`
* Rust 后端负责：
  * 更新 tray icon
  * 更新当前已打开窗口 icon
  * 后续新建窗口时，按当前主题应用正确 icon

**Browser extension**

* 扩展后台继续把 desktop app 的 theme 作为唯一主题来源。
* 收到 `theme_info` / `theme_changed` 时：
  * 更新 `currentTheme`
  * 调用 `chrome.action.setIcon(...)` 切换 action icon
* service worker 冷启动或重连后：
  * 在拿到当前 theme 时再补一次 `setIcon(...)`
  * 避免休眠恢复后 icon 卡在旧主题

### Desktop implementation split

**Rust side**

新增一个小型 `ThemeIconState` / `AppIconState`：

* 保存当前主题
* 提供按主题解析图标资源的方法
* 提供：
  * `apply_theme_icons(app, theme)`
  * `apply_window_icons(app, theme)`
  * `apply_tray_icon(app, theme)`

启动阶段：

* 读取 config 里的当前主题
* 创建 tray 时使用对应主题 icon，而不是固定 `default_window_icon()`

主题变更阶段：

* `sync_theme_icons(theme)` command 调用上述更新函数

新窗口创建阶段：

* `settings` / `context-menu` 新建时，也用当前主题对应 icon
* 避免主窗口切过去了、后开的 settings 仍拿默认 icon

**Frontend side**

* `ThemeContext.setTheme(...)` 在保存配置和广播主题后，顺手调用 `sync_theme_icons`
* 不把图标切换散落在 `App.tsx` / `SettingsPage.tsx` 等页面里，避免多点维护

### Extension implementation split

**Assets**

* `browser-extension/icons/black/16|48|128.png`
* `browser-extension/icons/white/16|48|128.png`
* manifest 保留一套默认 icon，建议指向中性高对比或 white-safe 默认值

**Background worker**

新增：

* `applyActionIcon(theme)`:
  * black theme -> 用亮色 icon
  * white theme -> 用深色 icon
* 调用时机：
  * service worker 初始化
  * WebSocket 连接建立后收到 `theme_info`
  * 收到 `theme_changed`
  * 可选：响应 popup `get_theme` 前先确保 icon 已同步

### Packaging/static icon strategy

静态资源单独处理，不走运行时主题分支：

* `src-tauri/icons/*`
* `browser-extension/icons/icon*.png`（manifest 默认引用）

这批资源统一换成一套中性高对比版本。

原因：

* 安装包/快捷方式/浏览器扩展管理页读取的是静态资源，不会跟随 app 内部主题实时变化。
* 即使运行态 icon 做了主题联动，静态入口如果仍是低对比深色猫头，用户第一次看到还是会觉得“看不清”。

### Suggested rollout

* Phase 1: 出新素材，先替换静态资源为高对比版本
* Phase 2: 扩展 action icon 跟随主题切换
* Phase 3: 桌面 tray + window icon 跟随主题切换

这样即使 Phase 3 遇到平台差异，用户也已经先拿到可见性改善。

## Expansion Sweep

### Future evolution

* 如果未来引入“跟随系统主题”，icon 切换来源需要从“app theme”扩展成“resolved theme”。
* 如果以后还有更多系统面图标（通知、安装器、文件关联图标），现在最好先明确哪些属于“运行时可变”，哪些属于“打包静态”。

### Related scenarios

* popup 内部插画/按钮 icon、网页注入按钮 icon 是否也需要统一视觉方向，后续最好保持一致。
* 设置页主题切换如果会改变 icon，用户是否需要立即看到 tray / 扩展图标同步更新，而不是重启后生效。

### Failure & edge cases

* 扩展 service worker 休眠/重启后，需要能重新拿到当前 theme 并恢复正确 icon。
* 桌面端主题切换很早发生时，tray/window icon 不能出现“先黑后白”或“切了主题但图标没跟上”的状态。

## Technical Notes

* Relevant files inspected:
  * `src/contexts/ThemeContext.tsx`
  * `browser-extension/background.js`
  * `browser-extension/popup.js`
  * `browser-extension/manifest.json`
  * `src-tauri/src/lib.rs`
  * `browser-extension/icons/icon16.png`
  * `src-tauri/icons/icon.png`
* Official / primary references:
  * Chrome Extensions `chrome.action.setIcon`: https://developer.chrome.com/docs/extensions/reference/api/action
  * Tauri JS window API (`setIcon`, `setOverlayIcon`): https://v2.tauri.app/reference/javascript/api/namespacewindow/
* Local dependency references:
  * `tauri-2.9.5/src/tray/mod.rs` exposes `TrayIcon::set_icon(...)`
  * `tauri-2.9.5/src/window/mod.rs` exposes `Window::set_icon(...)`
  * `tauri-runtime-2.9.2/src/lib.rs` documents Windows taskbar overlay icon separately from badge APIs
