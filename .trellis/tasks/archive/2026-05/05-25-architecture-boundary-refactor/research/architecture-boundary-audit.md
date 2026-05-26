# 架构边界审计

审计范围：当前工作树的 React 渲染层、Electron 主进程、`src/electron-runtime` 下载运行时、`src/core` / `src/sites` / `src/engines` 下载内核，以及 `browser-extension`。本轮只看模块职责、依赖方向和数据流，不评估具体功能正确性。

## 状态更新

更新时间：2026-05-25

已完成一轮低风险边界修复：

- 已收敛 `src/App.tsx` 内重复的下载/队列/转码 payload 类型定义，改为复用 `src/types/videoRuntime.ts`。这只改变类型来源，不改变运行时行为、协议字段或 UI 行为。
- 已解除 `src/core/types/engine.ts` 对 `src/electron-runtime/contracts.ts` 的反向类型依赖。`RuntimeBinaryPaths` 的字段和导出名保持兼容，类型所有权移动到 `src/core/types/runtime-binaries.ts`，`src/electron-runtime/contracts.ts` 继续导出同名别名。
- 已验证：`npm run type-check`、`npm run lint`、`npm test` 通过；导入循环扫描结果为 `cycles: []`。

仍未处理的主要边界：

- `src/App.tsx` 仍然承担主窗口状态机、拖放解析、下载/转码状态、runtime dependency gate、更新检查、窗口动画和错误展示等多项职责。
- `electron/main.mts` 仍然聚合窗口、IPC、WebSocket action、配置、站点会话、运行时启动和下载命令分发。
- `browser-extension/background.js` 仍是扩展端连接、协议、状态、媒体扫描和站点特例的高密度入口。
- `videoCandidates` / `video_selected_v2` / 配置 JSON parse 等协议和归一化逻辑仍分散在多处，尚未统一。

## 当前架构地图

| 区域 | 当前职责 | 主要文件 / 目录 |
| --- | --- | --- |
| React 桌面 UI | 主浮窗、设置页、上下文菜单、主题、下载/转码状态展示、用户交互入口 | `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/ContextMenuPage.tsx`, `src/contexts/ThemeContext.tsx` |
| 桌面桥接 | 渲染层访问 preload 暴露的 Electron API | `src/desktop/runtime.ts`, `src/types/electronBridge.ts`, `electron/preload.mts` |
| Electron 主进程 | 窗口、IPC、配置、托盘、全局快捷键、WebSocket、站点会话、运行时启动、下载命令分发 | `electron/main.mts`, `electron/configStore.mts`, `electron/videoDownloadCommands.mts`, `electron/extensionRequestBridge.mts`, `electron/siteSessionManager.mts` |
| 下载运行时 | 下载队列、转码队列、运行时依赖 gate、输出命名、telemetry、站点/引擎编排 | `src/electron-runtime/service.ts`, `src/electron-runtime/commandRouter.ts`, `src/electron-runtime/runtimeDependencyGate.ts`, `src/electron-runtime/runtimeUtils.ts` |
| 下载内核 | 输入/intent/engine/provider 类型、schema、错误码、站点 hint、候选排序 | `src/core`, `src/sites`, `src/engines`, `src/orchestration/download-orchestrator.ts` |
| 能力与策略数据 | 支持站点、引擎能力、探测、策略种子 | `src/download-capabilities`, `src/assets/capabilities-*.json`, `scripts/generate-capabilities-seed.mjs` |
| 浏览器扩展 | 页面注入、popup/options、content 检测、背景 WebSocket 客户端、与桌面协议转换 | `browser-extension/background.js`, `browser-extension/popup.js`, `browser-extension/floating-launcher.js`, `browser-extension/*-detector.js` |

## 主要模块职责

职责最清晰的边界在下载内核和运行时中段：

- `src/orchestration/download-orchestrator.ts` 只做输入 schema 校验、站点 provider 解析、engine fallback 顺序执行，依赖注入 `SiteRegistry` 和 `EngineRegistry`，边界相对干净。
- `src/sites/site-registry.ts` 与 `src/engines/engine-registry.ts` 是薄 registry，职责单一。
- `electron/configStore.mts` 已把配置文件 IO、启动语言、主题解析、部分配置变更广播收拢在一个可测试 factory 中。
- `electron/videoDownloadCommands.mts` 已把下载相关 Electron command 从 `electron/main.mts` 中部分剥离，方向是对的。

职责最不清晰的区域：

- `src/App.tsx` 有 5643 行，同时承担主窗口状态机、拖放解析、下载/转码队列状态、runtime dependency gate、更新检查、窗口动画、错误摘要、配置读取和业务入口。原先本地重复定义的下载/队列/转码 payload 类型已改为复用 `src/types/videoRuntime.ts`，但组件职责过宽的问题仍未收敛。
- `electron/main.mts` 有 3259 行，聚合 BrowserWindow 创建、IPC switch、WebSocket action switch、站点会话、配置、代理、下载桥、运行时 bootstrap、托盘、日志和诊断。`handleWebSocketMessage` / `handleCommand` 的责任仍然过宽，见 `electron/main.mts:2568` 到 `electron/main.mts:2658`。
- `browser-extension/background.js` 有 3367 行，同时处理连接、重试、语言/主题、context menu、媒体扫描缓存、下载协议、多个站点特例、拖拽解析和 popup 通信。全局状态从 `browser-extension/background.js:15` 到 `browser-extension/background.js:78` 连续定义，职责密度较高。
- `src/pages/SettingsPage.tsx` 有 2352 行，把设置页 UI、配置 JSON 读写、快捷键录制、支持日志、代理校验、站点 session 操作和更新设置混在同一个组件中。

## 主要数据流

### 渲染层发起下载

`src/App.tsx` 用户输入或拖放解析后调用 `desktopCommands.invoke("queue_video_download", payload)`，见 `src/App.tsx:1950` 到 `src/App.tsx:1970`。调用进入 `src/desktop/runtime.ts:29` 到 `src/desktop/runtime.ts:36`，再经 `electron/preload.mts:31` 到 `electron/preload.mts:35` 发 IPC。Electron 主进程在 `electron/main.mts:2624` 到 `electron/main.mts:2628` 先交给 `electron/videoDownloadCommands.mts`，再到 `src/electron-runtime/commandRouter.ts:377` 到 `src/electron-runtime/commandRouter.ts:440` 归一化为 `RawDownloadInput`，最后进入 `src/electron-runtime/service.ts:178` 到 `src/electron-runtime/service.ts:190` 的队列。

### 扩展发起下载

扩展端 `browser-extension/background.js:1763` 到 `browser-extension/background.js:1794` 通过 WebSocket 发送 `video_selected_v2`。Electron 主进程在 `electron/main.mts:2568` 到 `electron/main.mts:2613` 处理该 action，调用 `buildVideoSelectedV2QueuePayload`，再走同一个 `queue_video_download` 命令桥。这个统一路径是健康的，但协议归一化代码分散在扩展、Electron、runtime 三处。

### 下载运行时执行

`src/electron-runtime/service.ts` 持有 pending/active 队列、reserved output stem、转码队列和 runtime dependency resolver。下载执行时通过 `DownloadOrchestrator.execute(...)` 进入 `src/orchestration/download-orchestrator.ts:45` 到 `src/orchestration/download-orchestrator.ts:115`，由 provider 生成 plan，再由 engine 执行。完成后 runtime 发 `video-download-complete`，必要时继续在 `src/electron-runtime/service.ts:440` 到 `src/electron-runtime/service.ts:463` 准备转码。

### 状态回流到 UI

运行时事件经 Electron event sink 回到 preload，再由 `desktopEvents.on(...)` 订阅。主窗口在 `src/App.tsx:2285` 到 `src/App.tsx:2343` 直接处理 `video-download-progress` / `video-download-complete`，并同步更新 `downloadProgressByTrace`、错误展示和前景 outcome。UI 层目前直接承担了事件归并和阶段推进逻辑。

### 配置数据流

设置页和主窗口通过 `get_config` / `save_config` 读写 raw JSON string。`electron/configStore.mts:94` 到 `electron/configStore.mts:173` 是持久化和广播中心，但 `src/pages/SettingsPage.tsx:502` 到 `src/pages/SettingsPage.tsx:676` 多次重复读取、解析、局部修改、写回完整 JSON。主窗口也在 `src/App.tsx:1820` 到 `src/App.tsx:1825` 维护部分配置镜像。

## 依赖方向问题

1. `src/core` 对 `src/electron-runtime` 的反向类型依赖已修复。  
   原问题：`src/core/types/engine.ts` 通过 inline import 依赖 `../../electron-runtime/contracts.js` 的 `RuntimeBinaryPaths`，形成 `src/core/index.ts -> src/core/types/engine.ts -> src/electron-runtime/contracts.ts -> src/core/index.ts` 的循环。当前状态：`RuntimeBinaryPaths` 已移动到 `src/core/types/runtime-binaries.ts`，`src/core/types/engine.ts` 直接依赖 core 类型，`src/electron-runtime/contracts.ts` 保留同名别名导出。导入循环扫描结果为 `cycles: []`。

2. `electron/main.mts` 同时是 composition root 和协议/业务 handler。  
   `electron/main.mts:2568` 到 `electron/main.mts:2613` 处理扩展下载 action，`electron/main.mts:2631` 到 `electron/main.mts:2708` 处理 renderer commands。这里既解析协议，又读配置，又调用下载桥，还处理错误 envelope，导致未来新增 action 很容易继续堆进主入口。

3. `src/electron-runtime/commandRouter.ts` 与 `electron/videoHintNormalization.mts` 存在职责重叠。  
   `src/electron-runtime/commandRouter.ts:229` 到 `src/electron-runtime/commandRouter.ts:260` 和 `electron/videoHintNormalization.mts:82` 到 `electron/videoHintNormalization.mts:135` 都做 video candidate normalization。二者都依赖 site hint 和 Pinterest 特例，但输出规则不完全由同一个 schema 驱动。

4. 扩展协议常量和 desktop 协议类型没有共享源。  
   `browser-extension/background.js:18` 定义 `ws://127.0.0.1:39527`，`electron/main.mts:108` 定义同一个端口。`browser-extension/background.js:53` 定义 `video_selected_v2`，`electron/main.mts:2568` 通过字符串匹配同一 action，`src/types/electronBridge.ts:11` 到 `src/types/electronBridge.ts:54` 又定义 renderer command union。由于扩展是 JS，至少需要一个生成出的协议常量文件或测试约束来降低漂移。

## 重点边界发现

### 1. UI 层直接处理底层业务细节

- `src/App.tsx:1950` 到 `src/App.tsx:1970` 在 UI callback 中检查 Pinterest 是否需要 gallery-dl ready。这个规则更接近下载能力/运行时 gate，应靠 `src/electron-runtime/commandRouter.ts` 或 provider/engine validation 返回结构化错误，UI 只展示结果。
- `src/App.tsx:2285` 到 `src/App.tsx:2343` 直接推进下载阶段、判断取消、摘要错误并触发 foreground outcome。事件折叠逻辑可以收敛成 `src/desktop` 或 `src/features/downloads` 的 reducer/hook，组件只消费 view model。
- `src/pages/SettingsPage.tsx:502` 到 `src/pages/SettingsPage.tsx:676` 在 UI handler 中直接 parse/mutate raw config JSON，并调用多个 desktop commands。配置字段 ownership 分散，未来加字段时容易漏掉事件广播或回滚。
- `src/App.tsx:420` 到 `src/App.tsx:448` 的候选合并、`src/App.tsx:450` 到 `src/App.tsx:584` 的下载状态文本和阶段规则，是业务/展示混合逻辑，已经超出单纯渲染职责。

### 2. service / adapter / utils 混用

- `src/electron-runtime/service.ts` 是 service，但同时承担队列、转码调度、telemetry、输出文件命名、runtime dependency bootstrap 触发和 event payload 构造。`src/electron-runtime/service.ts:331` 到 `src/electron-runtime/service.ts:463` 是典型队列与转码职责混合点。
- `src/electron-runtime/runtimeUtils.ts` 名为 utils，但包含下载 trace、输出目录创建、文件名 sanitization、站点特定 output stem 规则和 JSON parsing。`src/electron-runtime/runtimeUtils.ts:57` 到 `src/electron-runtime/runtimeUtils.ts:120` 已经是 runtime policy，不只是工具函数。
- `electron/videoDownloadCommands.mts` 是 adapter，但也读配置、合并下载偏好、调用扩展辅助解析、做 fallback 策略，见 `electron/videoDownloadCommands.mts:135` 到 `electron/videoDownloadCommands.mts:212`。可以保留该模块，但命名/边界应更像 command service，而不是纯 bridge。
- `electron/configStore.mts` 的配置 IO 边界清晰，但 `parseJsonObject` 与 `src/electron-runtime/runtimeUtils.ts:46`、`src/updates/appUpdatePreferences.ts:5` 重复。

### 3. 循环依赖和隐性反向依赖

- 明确循环已修复：`src/core/index.ts` -> `src/core/types/engine.ts` -> `src/electron-runtime/contracts.ts` -> `src/core/index.ts`。当前通过 `src/core/types/runtime-binaries.ts` 持有 runtime-neutral binary path 类型，Electron runtime 只复用该类型。
- 隐性反向依赖：`src/electron-runtime/contracts.ts:26` 到 `src/electron-runtime/contracts.ts:42` 从 renderer event union `AmeowAppEvent` 中 Extract runtime event。runtime 事件事实被 renderer bridge 类型约束，方向上是后端运行时依赖 UI 桥接词表。
- 隐性反向依赖：`electron/main.mts` 从 `../src/core/index.js`、`../src/electron-runtime/index.js`、`../src/constants/windowMetrics.js`、`../src/config/globalProxy.js` 直接拉取多个 renderer/src 模块。部分是共享纯逻辑，部分把 Electron composition root 和 `src` 内部结构绑得过紧。

### 4. 核心逻辑散落在事件回调、组件、handler 中

- 下载完成处理在 `src/App.tsx:2306` 到 `src/App.tsx:2333` 的事件回调里，包含 progress 清理、取消判定、错误摘要和 outcome 展示。
- UI Lab reset 在 `src/App.tsx:2375` 到 `src/App.tsx:2419` 一次性清空多组下载、转码、运行时和 UI 状态，是多状态源并发重置的高风险 handler。
- WebSocket action `xiaohongshu_drag_resolution_result` 在 `electron/main.mts:2498` 到 `electron/main.mts:2566` 直接做字段归一化、pending request 关联和日志摘要。
- 扩展端 `browser-extension/background.js:1763` 到 `browser-extension/background.js:1880` 混合连接重试、站点支持判断、候选归一化和剪辑时间归一化。

### 5. 多处维护同一种状态

- 下载队列源状态在 `src/electron-runtime/service.ts` 的 `pending` / `active` / `pendingTranscodes` / `failedTranscodes`，UI 又在 `src/App.tsx:885` 到 `src/App.tsx:890` 维护 `downloadProgressByTrace`、queue count/detail、transcode progress/detail。UI 需要 view state，但事件折叠逻辑不应散在组件里。
- 取消/转码 pending action 同时有 React state 和 ref：`src/App.tsx:891` 到 `src/App.tsx:936`。这是为同步读取服务的合理技术手段，但目前没有独立 reducer 包住，调用方需要记住 state/ref 双写。
- 主题状态存在 `ThemeContext`、Electron config、扩展 `currentTheme`。扩展在 `browser-extension/background.js:68`、`browser-extension/background.js:1600` 到 `browser-extension/background.js:1609` 维护缓存；Electron config 在 `electron/configStore.mts:123` 到 `electron/configStore.mts:127` 解析。需要把桌面 config 作为权威源的协议写得更窄。
- 语言状态存在 `i18n`、Electron config、扩展 `currentLanguage` 和 `chrome.storage.local`。`browser-extension/background.js:155` 到 `browser-extension/background.js:207` 自己维护缓存和广播，属于跨进程复制状态。

### 6. 重复协议、类型和错误定义

- 已修复：`QueuedVideoDownloadRequest` 原先在 `src/App.tsx` 与 `src/types/videoRuntime.ts` 重复定义，现已改为由 `src/App.tsx` 直接导入 `src/types/videoRuntime.ts` 的共享类型。
- 已修复：`DownloadProgressPayload`、`VideoQueueStatePayload`、`VideoTranscodeTaskPayload` 等原先在 `src/App.tsx` 有本地 type，现已改为复用 `src/types/videoRuntime.ts`。
- video candidate normalization 至少出现在 `browser-extension/background.js:1806` 到 `browser-extension/background.js:1831`、`electron/videoHintNormalization.mts:82` 到 `electron/videoHintNormalization.mts:135`、`src/electron-runtime/commandRouter.ts:229` 到 `src/electron-runtime/commandRouter.ts:260`。
- 配置 JSON parse 出现在 `electron/configStore.mts:52`、`src/electron-runtime/runtimeUtils.ts:46`、`src/updates/appUpdatePreferences.ts:5`。这些语义不完全相同，容易让“无效 JSON 是否保留 raw string”的边界变模糊。
- 错误码核心定义已集中在 `src/core/constants/error-codes.ts` 和 `src/core/errors/download-runtime-error.ts`，但 UI 仍通过字符串判断取消和序号溢出，例如 `src/App.tsx:112` 到 `src/App.tsx:130`。建议后续让 command/event payload 带结构化错误码，而不是继续扩散字符串匹配。

### 7. 难以测试的耦合点

- `src/App.tsx` 依赖 DOM、Electron bridge、timers、animation、runtime events 和 i18n，主流程逻辑无法在不渲染整组件的情况下单测。下载 view model、窗口 shell reducer、runtime gate view model 应拆成纯 reducer/hook 后再测。
- `electron/main.mts` 顶层状态很多：`windows`、`wsClients`、pending request maps、runtime controllers、site session managers、active window animations。虽然周边有模块测试，但 `handleCommand` / `handleWebSocketMessage` 仍难以隔离。
- `browser-extension/background.js` 是 service worker 全局脚本，协议和状态都在全局 Map/let 中。虽然已有若干单文件测试，新增复杂协议时仍需要模拟 chrome、WebSocket、tabs、storage、alarms，耦合成本偏高。
- `src/electron-runtime/service.ts` 注入点已有进步，但队列、下载、转码、telemetry、依赖 gate 共处一类，单测一个行为时容易同时关心多个副作用。

### 8. 未来扩展会痛苦的结构

- 新增下载站点时，需要同时理解 `src/sites` provider、`src/download-capabilities` seed、`src/electron-runtime/commandRouter.ts` 归一化、`electron/videoHintNormalization.mts`、`browser-extension/*-detector.js` 和 `browser-extension/background.js` action 路由。站点扩展的切入点还不够集中。
- 新增设置项时，通常要改 `SettingsPage.tsx` UI、本地 state、raw config mutate、Electron config side effect、可能还要改 extension sync。缺少 typed config command 让设置扩展成本线性上升。
- 新增桌面 command/action 时，至少要改 `src/types/electronBridge.ts`、`electron/preload.mts`、`electron/main.mts` switch，有些还要改 `electron/videoDownloadCommands.mts` 或扩展 JS 字符串。没有生成或校验机制时容易协议漂移。
- 扩展 popup 的媒体浏览和下载动作在 `browser-extension/popup.js` 中以 DOM imperative state 管理，`browser-extension/popup.js:149` 到 `browser-extension/popup.js:167` 已有多组页面状态。继续扩展 popup 会放大状态同步难度。

## 最值得收敛的边界

1. 下载输入协议边界：收敛 `QueuedVideoDownloadRequest` / `RawDownloadInput` / `video_selected_v2`。  
   目标文件：`src/types/videoRuntime.ts`, `src/core/types/raw-download-input.ts`, `src/core/schemas/raw-download-input-schema.ts`, `electron/videoDownloadCommands.mts`, `src/electron-runtime/commandRouter.ts`, `browser-extension/background.js`。优先让桌面侧只有一个 canonical normalizer，扩展侧保留轻校验和兼容字段。

2. UI 下载 view model 边界：从 `src/App.tsx` 抽出下载/转码事件折叠。  
   目标文件：`src/App.tsx`, `src/types/videoRuntime.ts`, 可新增到 `src/desktop` 或 `src/features/downloads`。先移动纯函数和 reducer，不改变事件名或 UI 行为。

3. 配置读写边界：从 Settings handlers 收敛成 typed config service。  
   目标文件：`src/pages/SettingsPage.tsx`, `src/updates/appUpdatePreferences.ts`, `electron/configStore.mts`, `src/config/globalProxy.ts`。短期可以先做 renderer 侧 helper：`loadConfigObject`、`patchConfig(updates)`、失败回滚约定。

4. Electron main action/command 边界：把 `handleWebSocketMessage` 和非下载 command 分组迁出。  
   目标文件：`electron/main.mts`, `electron/videoDownloadCommands.mts`, `electron/extensionRequestBridge.mts`, `electron/siteSessionManager.mts`。不要一次重写 main，只按 action family 建小 controller。

5. 核心类型方向：移除 `src/core` 对 `src/electron-runtime` 的类型引用。  
   状态：已完成。`RuntimeBinaryPaths` 已移动到 `src/core/types/runtime-binaries.ts`，`src/electron-runtime/contracts.ts` 保留兼容别名。

## 不建议现在动的高风险区域

- 不建议一次性拆 `src/App.tsx`。它同时覆盖窗口动画、透明窗口 hit testing、启动 compact/full、下载 outcome 和 runtime gate。应先抽纯函数/reducer，再抽 hook，最后拆组件。
- 不建议一次性重写 `electron/main.mts` 的启动和窗口创建。`electron/main.mts:451` 之后的 BrowserWindow 创建和启动诊断牵涉 packaged Windows/macOS 差异，风险高。
- 不建议把 `browser-extension/background.js` 立即迁到 TypeScript 或模块化构建。扩展 service worker、manifest packaging 和现有未提交改动会让迁移风险偏大。先提取协议/normalizer 小模块和测试更稳。
- 不建议改变 `get_config` / `save_config` 的 raw string 协议。`.trellis/spec/backend/electron-runtime-contracts.md` 明确要求兼容 raw string，短期应在协议之上加 typed helper，而不是改 command contract。
- 不建议改变 WebSocket endpoint、action 名和 renderer command 名。`electron-runtime-contracts.md` 要求稳定这些协议，任何重命名都应单独做兼容迁移。

## 分阶段重构建议

### 阶段 1：收敛类型和纯逻辑，不改行为

- 已完成：删除 `src/App.tsx` 本地重复的下载/队列/转码 payload type，改用 `src/types/videoRuntime.ts`。
- 把 `src/App.tsx:450` 到 `src/App.tsx:584` 的下载/转码状态文案、阶段推进纯函数移动到独立模块并加测试。保留组件调用方式不变。
- 已完成：移动 `RuntimeBinaryPaths` 到 core 的 runtime-neutral 类型文件，解除 `src/core/types/engine.ts` 对 `src/electron-runtime/contracts.ts` 的依赖。
- 为 video candidate normalization 选一个桌面侧权威模块，先让 `src/electron-runtime/commandRouter.ts` 和 `electron/videoHintNormalization.mts` 复用同一实现。

### 阶段 2：收敛 UI 与配置边界

- 在 renderer 侧建立配置 helper，封装 `get_config` / `save_config` / parse / patch / rollback。替换 `src/pages/SettingsPage.tsx:502` 到 `src/pages/SettingsPage.tsx:676` 的重复 handler 逻辑。
- 把 `src/App.tsx:2285` 到 `src/App.tsx:2343` 的下载事件折叠改为 reducer/hook，输入为 runtime events，输出为 UI view state。
- 把 `src/App.tsx:2375` 到 `src/App.tsx:2419` 的 UI Lab reset 改为调用多个明确 reset action，避免一个 handler 直接清空所有状态源。

### 阶段 3：收敛 Electron 协议 controller

- 从 `electron/main.mts` 迁出 WebSocket action router，至少把 `video_selected_v2`、`pasted_video_selection_result`、`xiaohongshu_drag_resolution_result` 分到独立 controller。入口仍由 main 组装依赖。
- 把 renderer command 按领域拆成 config/window/session/file/download/update controllers，逐步削薄 `handleCommand`。优先拆 `electron/main.mts:2631` 到 `electron/main.mts:2708` 这种 command switch。
- 为扩展 WebSocket action 建 shared 常量或生成文件，覆盖 `browser-extension/background.js:53`、`electron/main.mts:2568`、`.trellis/spec/backend/electron-runtime-contracts.md` 中的协议名。

### 阶段 4：站点扩展边界

- 明确“新增站点”的单一清单：provider、capability entry、extension detector、normalizer、测试。落到 `src/sites`, `src/download-capabilities`, `browser-extension`, `src/electron-runtime/commandRouter.ts`。
- 把站点特例从 generic utils 中移出，例如 `src/electron-runtime/runtimeUtils.ts:81` 到 `src/electron-runtime/runtimeUtils.ts:100` 的 YouTube/Bilibili/Pinterest output stem policy，可转成 site/provider metadata。
- 给 `browser-extension/background.js` 的媒体扫描、下载请求、语言主题同步拆出独立 plain JS 模块，延续当前 importScripts 形态，避免立即引入构建链。
