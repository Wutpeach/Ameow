# brainstorm: optimize packaged app size

## Goal

在不破坏核心下载体验的前提下，降低 FlowSelect Windows 便携包体积（当前约 160MB），并收敛一条可落地的打包优化方案（短期可执行 + 中期可扩展）。

## What I already know

* 用户反馈当前打包体积约 160MB，需要优化。
* 用户已明确不采用双轨发行，要求维持单一正式发布形态。
* 用户已确认平台分流策略：安装包阶段自动尝试下载四个运行时；便携包/macOS 首启先检索本地环境，缺失时经用户确认后自动下载配置。
* 当前真实产物：`src-tauri/target/release/bundle/portable/FlowSelect_0.2.6_x64_portable.zip`，大小 `160.31 MB`（本地构建时间 2026-03-12 15:25）。
* 前端产物体积很小：`dist/` 总计约 `0.61 MB`，不是主要问题。
* 主程序二进制体积约 `16.77 MB`（`src-tauri/target/release/flowselect.exe`）。
* 便携包 staging 里最大体积来源为外部运行时二进制：
  * `deno.exe` `118.44 MB`
  * `ffmpeg.exe` `94.67 MB`
  * `pinterest-dl-x86_64-pc-windows-msvc.exe` `58.82 MB`
  * `yt-dlp-x86_64-pc-windows-msvc.exe` `17.56 MB`
* `scripts/package-portable.ps1` 当前会无条件把上面四个二进制都复制进 ZIP。
* `src-tauri/tauri.conf.json` 当前 `bundle.resources` 包含 `yt-dlp*`、`deno*`、`pinterest-dl*`、`locales/`；`locales` 体积仅约 `0.02 MB`。
* 代码行为上：
  * `ffmpeg` 查找支持 bundled + `PATH` 回退（`src-tauri/src/lib.rs`）。
  * `yt-dlp` 和 `pinterest-dl` 当前只走 bundled 路径，不走 `PATH` 回退。
  * YouTube 路径会显式传 `--js-runtimes node` 和 `--js-runtimes deno`，当前依赖 `deno` 在运行时可用。

## Assumptions (temporary)

* 本问题的主要矛盾是“可用性（开箱即用）”与“分发体积”之间的取舍，而不是前端打包优化。
* 若要显著降体积（例如降到 <100MB），大概率需要将部分大二进制改为按需下载或拆分发行形态。
* 若坚持完全离线开箱即用，体积优化空间有限，更多是压缩率/构建参数层面的小优化。
* 体积优化应优先覆盖 `portable` 产物，因为用户反馈的 160MB 问题对应 portable ZIP，不是前端 bundle。

## Open Questions

* 无

## Requirements (evolving)

* 明确当前包体构成占比，给出可验证的体积拆解。
* 提供 2-3 条可执行优化路径，并说明对功能、离线能力、首启体验的影响。
* 明确推荐路线及分阶段执行方式（MVP + 后续迭代）。
* 给出可度量目标（例如目标体积区间、首启耗时上限、失败回退策略）。
* 运行时补齐采用平台分流策略：
  * 安装包形态（如 Windows MSI/NSIS）：安装阶段自动尝试下载并配置 `deno/ffmpeg/pinterest-dl/yt-dlp`。
  * 便携包与 macOS 应用：首次启动先检索本地环境（含已存在系统依赖），缺失时先征得用户确认，再自动下载并配置。
* `pinterest-dl` 无官方可分发 exe；需要 FlowSelect 自建 sidecar 发布与更新通道。

## Acceptance Criteria (evolving)

* [x] 有完整的包体组成数据，能解释 160MB 的主要来源。
* [x] 至少提供两条可实施方案，并对比优缺点。
* [x] 明确一条推荐方案及其风险控制策略。
* [x] 形成后续实现边界（哪些改、哪些不改）。
* [ ] CI 能产出并发布 FlowSelect 自有 `pinterest-dl` 二进制与 manifest。
* [ ] 安装包形态在安装阶段会自动尝试下载 `deno/ffmpeg/pinterest-dl/yt-dlp` 并写入运行时目录。
* [ ] 便携包与 macOS 首次启动时，会先完成本地环境检索；仅对缺失依赖弹出确认。
* [ ] 用户确认后，缺失依赖可自动下载、校验并配置；下载成功后任务自动继续。
* [ ] 用户拒绝下载时，应用保持可用，并对受影响功能给出明确提示。
* [ ] 运行时下载必须通过 `sha256` 校验与原子替换。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 本任务先做需求收敛与方案选择，不直接提交实现代码。
* 暂不讨论与包体无关的 UI 视觉或交互改版。
* 暂不在本轮重构下载内核/协议策略。

## Research Notes

### What similar tools / platform conventions do

* Tauri 官方建议外部可执行通过 `bundle.externalBin` 进行架构化打包（按 target triple 命名）。
* Tauri 官方明确 Windows WebView2 分发是“体积 vs 离线能力”取舍：`downloadBootstrapper`（默认，小体积）到 `offlineInstaller/fixedVersion`（显著增大包体）。
* yt-dlp 官方文档显示 JS runtime 优先级是 `deno > node > quickjs > bun`，且 `deno` 默认启用；同时 `--remote-components` 在官方可执行场景下通常不是必需项。
* Tauri 官方 App Size 指南给出 Rust release profile 与 `removeUnusedCommands` 选项，属于低风险体积优化基础项。

### Constraints from our repo/project

* 当前 portable 打包脚本强制携带 `deno + ffmpeg + pinterest-sidecar + yt-dlp`，因此 ZIP 体积直接被外部二进制主导。
* 代码里 `ffmpeg` 支持 `PATH` 回退；`yt-dlp` / `pinterest-sidecar` 当前不支持 `PATH` 回退。
* YouTube 路径显式启用 `--js-runtimes node` 与 `--js-runtimes deno`，当前设计偏向“把 Deno 作为稳定性保障”。
* 现有 `dist` 与主程序 `exe` 体积占比低，纯前端或 Rust 常规优化无法单独解决 160MB 问题。

### Feasible approaches here

**Approach A: Full 离线包微优化（低风险，收益有限）**

* How it works:
  * 保持现有离线能力不变，仅做 Rust profile / 构建参数 / 打包压缩策略优化。
* Pros:
  * 改动风险低，不改变用户行为。
* Cons:
  * 对 160MB 级问题效果有限，无法根治主要矛盾。

**Approach B: 双轨发行（已不采用）**

* How it works:
  * 保留 `Full` 便携包（现状离线全功能）。
  * 新增 `Lite` 便携包，先不内置 `deno/ffmpeg`（可选不内置 `pinterest-sidecar`），首次需要时按需下载并缓存到应用目录。
* Pros:
  * 兼顾离线用户与体积敏感用户。
  * 从本地模拟看，移除 `deno+ffmpeg` 后 ZIP 可从 `160.31 MB` 降到约 `81.02 MB`。
* Cons:
  * 需要新增依赖下载、校验、失败回退逻辑。
  * 发布资产和文档复杂度上升。

**Approach C: 单轨 Lite（已不采用）**

* How it works:
  * 默认不内置大二进制，全部按需下载。
* Pros:
  * 初始包体最小（本地模拟 `yt-dlp-only` 约 `22.69 MB`）。
* Cons:
  * 首次体验和网络失败风险最高。
  * 离线场景几乎不可用，支持成本上升。

**Approach D: 单一正式包 + 首启依赖引导/自愈（Recommended）**

* How it works:
  * 仅发布一个正式安装包/便携包。
  * 主程序内置“运行时依赖管理器”：检测 `yt-dlp/ffmpeg/deno/pinterest-sidecar` 是否可用。
  * 缺失时自动下载到 `app_config_dir`（或专用 runtime 目录）并做校验；下载失败时在 UI 明确提示并提供“重试/手动配置路径”。
* Pros:
  * 保持“单一发布形态”，符合用户偏好。
  * 可显著降低初始包体，同时保证最终功能完整。
* Cons:
  * 首次启动依赖网络与下载镜像可用性。
  * 需要新增依赖状态机、校验、安全与错误恢复逻辑。

## Future / Related / Edge Sweep

### Future evolution

* 如果后续引入自动更新，可把“依赖运行时包”也做版本化与增量更新，而不是每次随主包全量发放。
* 如需支持更多平台（Linux 等），依赖下载器和校验机制应抽象成跨平台模块，避免每平台重复实现。

### Related scenarios

* Windows 安装器与 portable/macOS 采用不同补齐时机，需要明确并保持文案一致性。
* 需要同步 release-notes 与 README 下载说明（安装期自动尝试 vs 首启确认补齐）。
* 需要同步设置页文案，明确“检测到缺失运行时后将请求确认并自动配置”。

### Failure & edge cases

* 依赖下载失败时的回退策略（重试、镜像、手动导入）必须明确。
* 依赖完整性与供应链安全：至少需要 checksum 校验与版本锁定。
* 企业网络/代理环境下的可用性，需要有无代理两套验证路径。

## Technical Approach

单一正式包下采用“安装期预拉取 + 首启检索确认补齐”：

* 安装包形态（Windows MSI/NSIS）：
  * 安装流程中自动尝试下载并配置 `yt-dlp`、`ffmpeg`、`deno`、`pinterest-dl`。
  * 安装后启动时再次做快速一致性检查，确保运行时可用。
* 便携包与 macOS：
  * 首次启动执行本地环境检索（运行时目录 + 可选 PATH/常见系统路径）。
  * 若依赖已存在且可用，直接复用，不重复下载。
  * 若存在缺失项，先展示确认对话；用户确认后自动下载并配置缺失项。
* 下载中的任务行为：
  * 任务先入队，状态显示“准备运行时依赖”，待依赖就绪后自动继续。
* 失败与拒绝策略：
  * 下载失败自动重试并提示恢复选项。
  * 用户拒绝下载时，不阻断应用其他能力，仅对相关下载功能给出可操作提示。

`pinterest-dl` 的特殊处理（自产 sidecar）：

* 构建来源：继续使用仓库现有 PyInstaller 流程（`scripts/build-pinterest-sidecar.mjs`）。
* 版本锚点：以 `src-tauri/pinterest-sidecar/lock.json` 的 `flowselectSidecarVersion` + `upstream.version` 为唯一真值。
* 分发方式：由 FlowSelect 自托管 sidecar 二进制（按 target triple）和 manifest（含 sha256/size/version）。
* 客户端更新：应用只从 FlowSelect manifest 拉取 sidecar，不直接从 upstream 拉取“未知可执行物”。
* 更新策略：默认“受控自动更新”（仅更新到我们已构建并签名/校验通过的版本）。

## Technical Notes

* Inspected files:
  * `package.json`
  * `src-tauri/tauri.conf.json`
  * `src-tauri/Cargo.toml`
  * `src-tauri/src/lib.rs`
  * `scripts/package-portable.ps1`
  * `.github/workflows/release.yml`
* Local measurements:
  * `src-tauri/target/release/bundle/portable/FlowSelect_0.2.6_x64_portable.zip` => `160.31 MB`
  * `dist/` => `0.61 MB`
  * `src-tauri/target/release/flowselect.exe` => `16.77 MB`
  * `src-tauri/binaries/*` => `deno.exe 118.44 MB`, `ffmpeg.exe 94.67 MB`, `pinterest-dl*.exe 58.82 MB`, `yt-dlp*.exe 17.56 MB`
  * ZIP 体积模拟（同压缩参数）：
    * `all` => `160.31 MB`
    * `no-deno` => `115.31 MB`
    * `no-ffmpeg` => `126.01 MB`
    * `no-pinterest` => `101.98 MB`
    * `no-deno-no-ffmpeg` => `81.02 MB`
    * `ytdlp-only` => `22.69 MB`
* External references:
  * Tauri external binaries / sidecar: https://v2.tauri.app/develop/sidecar/
  * Tauri config reference (`resources`, `externalBin`, `removeUnusedCommands`): https://v2.tauri.app/reference/config/
  * Tauri app size guide: https://v2.tauri.app/concept/size/
  * Tauri Windows installer WebView2 options: https://v2.tauri.app/distribute/windows-installer/
  * yt-dlp README options (`--js-runtimes`, `--remote-components`): https://github.com/yt-dlp/yt-dlp/blob/master/README.md

## Decision (ADR-lite)

**Context**: 用户不接受双轨（Full/Lite）分发，希望维持单一正式发布形态，同时允许首启自动准备依赖。

**Decision**: 采用“单一正式包 + 自动补齐优先，失败后引导手动配置”策略。

默认策略细化：

* 安装包形态：安装阶段自动尝试补齐 `yt-dlp`、`ffmpeg`、`deno`、`pinterest-dl`。
* 便携包/macOS：首启先做本地检索，缺失时经用户确认后自动补齐。
* 所有运行时下载均通过 FlowSelect 自有 manifest + `sha256` 校验。

**Consequences**:

* 初始安装包可显著减重，但首次可用性依赖网络与下载源健康度。
* 需要补齐依赖状态管理、校验、重试、离线提示与手动路径配置。
* 发布文档和设置页需明确依赖准备阶段与失败恢复路径。

## Implementation Plan (small PRs)

* PR1: Runtime manifest + CI publish（拆分为独立 task）
  * 任务：`03-13-ci-build-publish-runtime-sidecars-manifest`
  * 产出：runtime manifest schema + `pinterest-dl` sidecar CI 构建发布链路。
* PR2: Backend runtime manager
  * Rust 侧实现 runtime 状态机（missing/downloading/ready/failed）。
  * 实现下载、哈希校验、原子替换、重试退避、错误上报事件。
* PR3: Platform runtime bootstrap + task gating
  * 安装包形态接入安装阶段自动尝试下载 `yt-dlp/ffmpeg/deno/pinterest-dl`。
  * 便携包/macOS 首启接入本地检索 + 用户确认 + 自动补齐流程。
  * Pinterest 下载路径接入依赖准备 gating，缺失依赖补齐后任务自动续跑。
* PR4: UI + docs
  * 设置页/主界面增加“运行时准备中/失败重试”提示。
  * README 与 release-notes 说明首次运行时下载行为与离线限制。

## Active Development Queue (2026-03-13)

为进入实现阶段，先按以下 3 项顺序推进：

1. Runtime state snapshot command
   * 新增 Tauri command：返回 `yt-dlp / ffmpeg / deno / pinterest-dl` 的当前可用性快照（`ready/missing`、`source`、`path`、`error`）。
   * 用于首启“本地环境先检索”流程与设置页诊断面板复用。
2. Runtime gating state machine skeleton
   * 后端接入“缺失依赖 -> 任务等待 -> 用户确认后补齐 -> 自动续跑”的状态机骨架（先不接 UI）。
   * 保证用户拒绝下载时不阻断非相关功能。
3. UI integration for runtime readiness
   * 主界面/设置页消费 runtime 快照与状态机事件，展示“准备中/缺失/失败重试”状态。
   * 首启仅对缺失项弹确认，并保留手动恢复入口。

### Progress

- [x] Runtime state snapshot command
- [x] Runtime gating state machine skeleton (backend-only, no downloader execution yet)
- [ ] UI integration for runtime readiness
  - 已完成：Settings 页接入 runtime 快照与 gate 状态（含状态刷新与用户决策按钮）。
  - 待完成：主界面接入同一状态与任务联动提示。
