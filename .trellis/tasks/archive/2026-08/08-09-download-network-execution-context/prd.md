# Unify download runtime network execution context

## Goal

建立统一的下载运行时网络执行上下文，让每个下载任务在执行前得到可解释、生命周期稳定的 `DownloadExecutionContext`；Electron、yt-dlp、gallery-dl 与 runtime bootstrap 共享唯一的代理来源优先级和 URL-specific 路由解析结果，避免 Electron 可访问而 CLI 实际未使用同一路径，同时保持现有下载与代理配置兼容。

## Background

- 当前网络处理分散在用户配置、Electron session、CLI 参数/环境变量、runtime bootstrap、下载任务执行与 diagnostics 中；具体真实行为必须以代码审计为准，不能预设现有模块有误或直接删除。
- P0 只处理 Runtime / Network / Execution Context；不做 UI 大改、Electron Main 大拆分、Browser Extension 大重构、App.tsx 大拆分或全仓目录迁移。

## Confirmed Facts

- Electron system/manual proxy 已通过 `session.setProxy(...)` 真实应用于 default session；“system 仅用于 diagnostics”这一怀疑不成立。
- 已验证的 manual HTTP(S) proxy 已真实应用于 Electron、yt-dlp、gallery-dl 与 pip；本任务保持其配置格式、验证、fallback 与 loopback bypass 语义。
- system `session.resolveProxy(targetUrl)` 当前只产生 yt-dlp diagnostics，不会进入 CLI；gallery-dl 甚至跳过该 diagnostics。
- yt-dlp、gallery-dl 与 pip 会隐式继承进程代理环境；manual overlay 不会清除 `ALL_PROXY` / `NO_PROXY`，因此多个来源可能同时生效。
- 当前 `proxyUrl: string | null` 在每个 engine candidate/auth recovery 中重新构建，无法区分 direct、resolution failure、complex 或 unsupported，也不能保证同一任务使用稳定路由。
- runtime asset fetch 使用 Electron session，pip 使用 child environment，同一 bootstrap 已存在网络路径分裂。
- 现有 parser 已拒绝静默压缩 multiple candidates，但其 production conversion helper 无调用者；旧 Trellis contract 有意规定 system/environment 仅 diagnostics，本任务将显式演进该规则。

## Requirements

- 审计 `networkProxyPolicy`、`desktopProxy`、`networkProxy`、`cliProxy`、Electron `session.setProxy` / `session.resolveProxy`、yt-dlp / gallery-dl spawn、runtime bootstrap、下载任务创建/执行、proxy failure detection、diagnostics/telemetry 与 proxy config。
- 建立 discriminated-union `NetworkRoute`，明确区分 direct、HTTP、HTTPS、SOCKS4、SOCKS5，以及 PAC / multiple candidates / unsupported 等复杂路由，并保留 manual、system、environment、direct 等来源。
- 建立集中式 `NetworkRouteService.resolveRoute({ targetUrl, consumer })`；system 模式必须针对目标 URL 复用 Electron/Chromium 的解析能力，Engine 不得自行读取系统代理。
- 固定并测试唯一的代理来源优先级；任何来源不得在 Electron 与 CLI 中隐式形成不同 precedence。
- 下载任务执行前生成一次 `DownloadExecutionContext`，同一 Engine execution 生命周期不得重新解析网络路由。
- yt-dlp 与 gallery-dl 通过各自 adapter 将既定 `NetworkRoute` 映射为 CLI 参数/环境，声明 capability；不支持的路由必须产生明确错误或诊断，不能静默忽略或重复拼参。
- system route 可可靠映射时必须真实应用到 CLI；PAC、多候选或不支持路由不得静默压缩或假装应用成功。
- 每次下载记录结构化网络诊断：preference、source、target、脱敏 route、protocol、engine、resolution status、是否 applied、failure classification；stderr 仅作为 raw evidence。
- 代理失败至少可区分 resolution、unsupported、connection、auth、timeout、DNS、TLS 与 unknown；普通日志不得暴露 proxy 用户名/密码、cookie 或 token。
- 优先复用现有代码和 Electron 能力，不新增复杂网络库，不使用 `@ts-nocheck`，不为形式上的 Clean Architecture 创建无实际职责的抽象。
- 用户可见的网络、代理或排障行为若发生变化，同任务更新 `site/src/content/docs/` 对应公共文档。
- gallery-dl 获得明确 route 后必须通过 pinned CLI 的 `extractor.*.proxy-env=false`（或经 executable evidence 验证的等价机制）关闭 Requests 环境变量与 Windows Registry 代理自动发现；只清理 child env 不算完成。
- direct 是显式 route：yt-dlp 必须用其明确的 direct proxy override，gallery-dl 必须同时明确空 proxy 并关闭 `proxy-env`，不能把“不传 proxy”当 direct。
- environment source 必须针对 `targetUrl` 综合解析大小写 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` precedence，输出最终 proxy/direct/complex route；Engine 不接收未解析的环境规则。
- route 和 diagnostics 必须携带 `resolvedFor`，表明 system/environment 结果只针对 canonical entry URL，不得描述成所有 downstream host 的全局 route。
- `DownloadExecutionContext` 在一个 Job 内稳定；retry、auth recovery、fallback engine 默认复用。未来刷新只能通过显式 refresh/rebuild context 语义，P0 不允许隐式重算。
- Runtime asset fetch 与 pip bootstrap 复用同一个 `NetworkRouteService`/precedence，但使用符合各自 lifecycle 的独立 execution context，不强行复用 `DownloadExecutionContext`。

## Key Decisions

- 保留用户的 system/manual 两种配置，不新增 direct、SOCKS、PAC 或 credentials 设置 UI。
- 唯一 precedence 为：effective manual > URL-specific system result（proxy 或显式 DIRECT）> target-resolved environment（仅当 system 不可用/不适用时）> direct fallback。显式 system DIRECT 是终态 direct（source system），不再进入 environment；system 返回 multiple/malformed/unsupported 时停止为 complex，不静默绕到环境代理。
- Engine child environment 先清除大小写 HTTP(S)/ALL/NO proxy keys，再只应用 context 捕获的选中来源；Engine 不再自行读取 ambient proxy state。
- gallery-dl 无论 direct 或 proxy 都显式设置 `extractor.*.proxy-env=false`，阻断 Requests 从环境或 Windows Registry 发现第二代理来源。
- direct adapter mapping 必须显式：yt-dlp 使用 `--proxy ""`；gallery-dl 使用空 proxy override 加 `proxy-env=false`，并对两者清理 proxy env。
- environment 在 service 内完成 target-specific precedence 与 `NO_PROXY` 判断；adapter 只消费最终 route。
- 同一 queued Job 只解析一次基础 route，并在 engine retry/fallback/auth recovery 中复用；下一个 Job 重新解析。
- Electron 返回单一 system candidate 时可按 canonical target 映射；route/diagnostics 以 `resolvedFor` 保存该 URL。多候选/不支持结果不可映射。Electron API 无法识别“只返回单候选的 PAC”，因此 P0 不宣称解决所有 downloader 下游 host 的 PAC 等价性，此限制必须进入 diagnostics 与最终报告。
- runtime bootstrap 按具体 asset/index target 建立自己的 execution context；download task 仍保持每 Job 一次解析。两者只共享 resolver/policy，不共享 lifecycle context。
- 不扩展 ordinary UI；新增 structured runtime/telemetry diagnostics 映射到现有用户可见错误类别。

## Acceptance Criteria

- [ ] 每个下载任务在 Engine 启动前都获得一个稳定的 `DownloadExecutionContext`，yt-dlp 与 gallery-dl 消费同一个标准 `NetworkRoute`。
- [ ] manual、system、environment、direct 只有一套可测试、可记录的 precedence；Engine 不再自行猜测系统网络环境。
- [ ] system proxy 按 target URL 解析；可映射路由真实应用给 CLI，PAC / multiple / unsupported 产生明确诊断且不被静默忽略。
- [ ] 同一任务的 engine fallback/auth recovery 不会重新解析 route；新任务会重新解析。
- [ ] child process 不再同时继承未选中的 HTTP(S)/ALL/NO proxy 来源。
- [ ] gallery-dl direct/proxy 路径均显式关闭 `proxy-env`，测试证明 Windows Registry/environment 自动发现不能覆盖已选 route。
- [ ] yt-dlp 与 gallery-dl direct 均产生明确的 no-proxy CLI/config decision，而不是省略设置。
- [ ] environment route 测试覆盖 target scheme、大小写变量、ALL fallback、NO_PROXY match/non-match 与冲突 precedence。
- [ ] system/environment route 和 diagnostics 保存并脱敏显示 `resolvedFor`；测试确认不会宣称 downstream-host 全局等价。
- [ ] retry、auth recovery、fallback engine 共用同一 Job context；只有显式 rebuild/下一 Job 才可再次解析。
- [ ] runtime asset fetch 与 pip bootstrap 使用共享 resolver/policy 但不同 execution-context lifecycle，并有独立测试。
- [ ] direct、PROXY、HTTPS、SOCKS4、SOCKS5、多候选、malformed parsing 均有单元测试。
- [ ] manual、system、environment、direct precedence 均有测试。
- [ ] yt-dlp 与 gallery-dl 的 direct、HTTP、HTTPS、unsupported mapping 均有测试；yt-dlp 实际下载对 SOCKS4/5 fail closed（FFmpegFD 动态选择不可预知），非下载 probe 保留原生 SOCKS。
- [ ] 安全测试确认普通日志不暴露代理凭据、cookie、token；无代理用户保持回归兼容。
- [ ] 现有相关测试、项目全量测试、`npm run type-check` 与 `npm run lint` 通过。
- [ ] 变更不包含无关 UI、Electron Main、Extension 或目录结构重构。
- [ ] 最终报告覆盖旧架构审计、最终设计、主要文件、各 route 行为、兼容性、测试结果、刻意遗留问题及仅限 Runtime / Network 的后续建议。
- [ ] 最终报告逐项说明新增的六项 P0 约束如何落地，并列出每项对应测试。

## Out of Scope

- 完整 PAC 引擎、AuthContext 完整实现、UI 重设计、Electron Main 大拆分、Browser Extension 大重构、整体目录重排，以及与 Runtime / Network 无关的下一阶段重构。
