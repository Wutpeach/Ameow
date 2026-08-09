# Stabilize Download Domain architecture

## Goal

稳定 Ameow 可脱离 Electron 复用和单测的核心下载架构，使 Site resolution、Download plan、Engine selection、fallback 与错误分类拥有明确的 Domain / Application / Infrastructure 所有权，并让 yt-dlp、gallery-dl 成为外围 infrastructure adapters。

成功不以目录是否像教科书式 Clean Architecture 判断，而以三件事判断：未来 CLI 能复用 Site → Plan → Orchestrator → Engine contract；新增 Engine 主要只需 adapter + capabilities + registration；没有 Electron 时核心计划与选择测试仍可运行。

## Background and confirmed facts

- P0 Runtime / Network 已完成。每个 queued Job 已生成一次稳定 `DownloadExecutionContext`，同一 network resolution 在 engine retry、engine fallback 与 auth recovery 中复用；本任务不得改变 `NetworkRoute` 的单一 authority 或引入隐式 refresh。
- 当前真实依赖图和违规证据记录于 `research/current-download-domain-audit.md`。
- 基线核心回归为 4 个文件、100 个测试通过：`npm test -- src/orchestration/download-orchestrator.test.ts src/sites/providers.test.ts src/core/errors/download-runtime-error.test.ts src/electron-runtime/service.test.ts`。
- 已有 `SiteProvider`、`SiteRegistry`、`EngineRegistry`、`DownloadIntent`、`ResolvedDownloadPlan`、`DownloadRuntimeError` 与构造注入点；本任务整理和收窄这些抽象，不另起平行体系。

## Requirements

### Dependency direction

- 形成逻辑依赖方向 `Domain <- Application <- Infrastructure`；不为目录美观做全仓搬迁。
- Domain 只表达下载意图、已解析计划、能力要求、结果、错误和 fallback policy；不得 import Electron、renderer/protocol payload、child process、CLI 参数、filesystem implementation 或 telemetry implementation。
- Application 负责 Site resolution、Engine eligibility/priority、execution sequencing、fallback 与 application-level transition；`DownloadOrchestrator` 保持在此层。
- Infrastructure 实现 yt-dlp、gallery-dl、subprocess、ffmpeg、filesystem、network 与 Electron adapter。

### Stable model and ownership

- 保留并收窄 `DownloadIntent`，使其表达用户要下载什么，而不是 IPC DTO；extension diagnostics、legacy protocol aliases 和 engine-specific advanced selector 不成为 Domain contract。
- `ResolvedDownloadPlan` 表达 canonical target、media semantics、能力要求、auth/quality requirements、preferred/required engine 与 fallback hints；不得包含 CLI args、child env 或 Electron session。
- 建立 core-owned `DownloadResult` / progress model，并在 runtime/protocol boundary 映射为现有 `DownloadResultPayload` / `DownloadProgressPayload`；现有 event/IPC JSON key 保持兼容。
- 明确主要类型 owner：Domain、Application、Protocol、Renderer、Electron、Infrastructure；允许少量 mapper，禁止万能共享 DTO。

### Engine port, capabilities, and composition

- `DownloadEngine` 成为稳定 application port，不 import `electron-runtime`、renderer payload、CLI/child-process/Electron 类型或 yt-dlp/gallery-dl 专用类型。
- port 至少提供 engine id、当前真实 selection 所需 capabilities、support decision 和 execute；详细签名以兼容现有调用链的最小实现为准。
- `YtDlpEngineAdapter`、`GalleryDlEngineAdapter` 归 Infrastructure，继续复用现有 command planners、manifests、process runner、network adapters、progress/error parsers，不复制实现。
- `EngineRegistry` 保存 port abstraction，支持显式注册/lookup/list/eligibility；重复注册行为必须明确并有测试。
- concrete adapters 由 Electron 外围 composition 注册；`src/core` / application 不 import concrete engines。不得引入 DI framework、factory hierarchy 或插件系统。
- capability 只建模当前实际影响选择的 media/quality/auth/network/live 等最小集合；Site 的真实特殊规则仍可由 provider 的 preferred/required engine 表达。

### Site and orchestration

- `SiteProvider` 只做 match 与 plan resolution，可声明 preferred/required engine、capability requirements、fallback candidates、auth/quality semantics；不得执行 downloader 或拼 CLI。
- 保留 first-match SiteRegistry 与现有 provider order、URL compatibility exceptions、downloader-owned redirect/extraction 语义。
- 统一 provider plan construction 只在能消除已确认 drift 时使用现有 strategy helpers；不把所有 provider 插件化或强迫所有特殊规则进入 capability registry。
- `DownloadOrchestrator` 只做 validate → resolve → eligible engines → execute → classify → fallback；不拼 CLI、不做 filesystem/process/network resolution、不格式化 UI payload。
- P0 `DownloadExecutionContext` 从 application/runtime boundary 注入；retry/fallback/auth recovery 保持同一 context identity 与 network object。

### Error and fallback

- 保留稳定 error code、classification、context/cause，但将 raw stderr/CLI string parsing 留在 infrastructure classifier/adapter；Domain/Application 不用 `includes`/regex 解析 CLI 文本决定业务 policy。
- Infrastructure 在丢出 typed error 前保留并脱敏 raw evidence；P0 network failure classification 继续复用。
- Fallback policy 只消费结构化 code/classification/recoverability；不引入 rule engine。
- 保持当前行为：auth-required 与 retry-same-engine 不因 `fallbackOn: "any"` 跨引擎；selected Weibo quality failure 不降级到其他质量；Engine-specific internal retry 仍归 adapter。

### Compatibility and scope

- 保持现有下载、provider order、engine priority、quality、auth recovery、queue/progress/completion events、telemetry、config、IPC/WS/extension payload 与 result JSON keys兼容。
- 不大拆 `electron/main.mts`、`src/electron-runtime/service.ts`、`App.tsx`；不重构 React UI 或 Browser Extension；不做完整 plugin/DDD/CQRS/event bus/DI framework。
- 不修改 P0 Network semantics，除非有可复现 bug；若行为或公共排障说明实际改变，同任务更新 `site/src/content/docs/`，否则不制造文档 churn。

## Acceptance criteria

- [ ] `DownloadOrchestrator` 不依赖 Electron implementation 或 `types/videoRuntime`。
- [ ] `DownloadEngine` port 不依赖 `electron-runtime`、renderer/protocol DTO、CLI/child-process/Electron 专用类型。
- [ ] yt-dlp 与 gallery-dl 是 Infrastructure adapters，现有 command/network/process authority 未复制。
- [ ] Domain 不依赖 renderer/runtime payload；core result/progress 通过 boundary mapper 转为原协议。
- [ ] SiteProvider 不直接执行 downloader 或拼 engine command。
- [ ] Engine selection 基于 plan requirements + engine capabilities，同时保留显式 site preference/requirement。
- [ ] Fallback 只依赖结构化 error classification/recoverability；Orchestrator 不解析 stderr/string。
- [ ] SiteRegistry / EngineRegistry 保存 abstraction，支持显式 construction/registration。
- [ ] concrete engines 在外围 composition 注册，application 不创建具体 adapter。
- [ ] `DownloadExecutionContext` 从 application/runtime boundary 注入，不在 Orchestrator 内解析 NetworkRoute。
- [ ] P0 NetworkRoute 继续保持唯一 authority；adapter 继续负责 route → args/env。
- [ ] retry、fallback、auth recovery 不改变同一 Job 的 context identity/network object/plan identity。
- [ ] Domain/Application 核心测试可在无 Electron import 的环境运行。
- [ ] ESLint restriction 或 architecture test 阻止 core/application 重新 import Electron/runtime implementation。
- [ ] 原有行为、配置、协议和结果 payload keys 保持兼容；任何刻意差异均在报告中明确。
- [ ] Orchestrator 测试覆盖 site resolution、priority、capability filtering、first success、fallback success、terminal stop、auth retry identity、context forwarding。
- [ ] Registry/Site/Error tests 覆盖 registration/lookup/unsupported/eligibility、match/no-match/resolve failure、raw evidence → stable classification。
- [ ] `npm test`、`npm run type-check`、`npm run lint`、`npm run build`、`git diff --check` 通过。
- [ ] `npm run runtime:smoke:downloaders` 通过；若本机 runtime 条件不满足，报告必须明确命令、原因和未验证风险，不得虚报。
- [ ] 完成后任务保持 `in_progress`，不提交、不 archive，按用户指定的 13 节格式等待架构评审。

## Out of scope

- Electron Main Process 或 runtime service 大拆分。
- React UI/UX、Browser Extension、完整 Engine/Site plugin system。
- 新增 DI framework、event bus、CQRS、DDD aggregate、repository abstraction 或复杂 fallback rule engine。
- 为命名一致进行大规模无行为 rename，或重排整个 `src/`。

## Blocking questions

无。用户已经明确范围、兼容要求、验证门、完成报告格式，以及规划批准后由 Develop worker 实施。
