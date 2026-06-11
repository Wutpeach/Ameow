# Windows Installer Prewarm For Managed Runtimes

## Goal

让 Windows `setup.exe` 在安装阶段尽可能提前完成 `ffmpeg`、`pinterest-dl`、`deno` 的 managed runtime 预热，减少用户首次启动 FlowSelect 后再等待运行时下载的情况。

同时保留现有“应用首次启动后自动 bootstrap”的能力作为兜底修复链路，避免安装期预热失败、被跳过、或后续运行时文件丢失时出现不可恢复状态。

## Problem

当前 Windows 安装包不会在 NSIS 安装阶段下载和配置 `ffmpeg`、`pinterest-dl`、`deno`。

现状是：

- 安装包内只显式打包 `yt-dlp` 和 `flowselect-cli-proxy`
- `ffmpeg`、`pinterest-dl`、`deno` 在应用启动后由 runtime gate 检测缺失并异步 bootstrap
- 这会导致用户第一次打开应用时仍然要等待运行时下载完成
- 如果用户第一次启动时网络较差，主窗口会承担一部分“安装后补齐环境”的体验负担

## Current Facts

- 当前 managed runtime 的真实来源和目录布局已经稳定：
  - 安装路径位于 `app_config_dir/runtimes/<component>/<target>/`
  - Windows 下 `ffmpeg` / `deno` 采用 `proxy-front + real/` 布局
  - `pinterest-dl` 从 runtime manifest 拉取
- 当前前端会在主窗口可见后，如果发现 managed runtime 缺失，则调用 `start_runtime_dependency_bootstrap`
- 当前 Rust 端 bootstrap 逻辑已经具备：
  - 缺失检测
  - 下载
  - sha256 / size 校验
  - staged install
  - 原子替换
  - Windows proxy 复制
  - 失败后首启继续重试
- 当前运行时路径配置只影响 FlowSelect 自己启动的子进程，不会写系统级 `PATH`

## Proposed Product Behavior

### Chosen Draft Direction

- Windows NSIS 安装流程增加一个“安装期 runtime prewarm”步骤
- 该步骤复用 FlowSelect 现有 Rust bootstrap 逻辑，不在 NSIS 脚本中重复实现下载、校验、解压、替换逻辑
- 安装器通过一个 headless/bootstrap 入口触发预热，不直接维护每个运行时的下载 URL、sha、目录规则
- 如果安装期预热成功，用户首次启动时 runtime gate 应直接读到 `ready`
- 如果安装期预热失败、超时、被用户跳过、或设备离线，首次启动后的现有 bootstrap 继续兜底

### User-Visible Outcome

- 理想路径：
  - 用户运行 Windows 安装包
  - 安装器明确提示正在下载和配置运行时组件
  - 安装结束前完成 managed runtime 预热
  - 用户首次打开应用时无需再等待 `ffmpeg` / `pinterest-dl` / `deno` 下载
- 兜底路径：
  - 安装期预热未完成或失败
  - 应用首次启动时仍可按当前逻辑自动补齐缺失运行时

## In Scope

- 为 Windows NSIS 安装流程增加 installer-time runtime prewarm 能力
- 为桌面端增加可被安装器调用的 headless runtime bootstrap 入口
- 复用现有 Rust managed runtime bootstrap 逻辑与目录契约
- 明确安装期预热与首启 bootstrap 的职责边界和优先级
- 明确安装失败、下载失败、离线、取消等场景下的行为
- 保持当前主窗口 runtime gate 的可见状态和重试能力作为 fallback / repair path

## Explicit Non-Goals

- 不修改 macOS 安装分发行为
- 不把 `ffmpeg`、`pinterest-dl`、`deno` 改成安装到系统级路径
- 不写系统环境变量，不修改系统级 `PATH`
- 不把 portable ZIP 包改成安装期预热模型；portable 继续沿用现有 Rust bootstrap 逻辑
- 不在 NSIS 中复制一套独立的 runtime 下载与校验逻辑
- 不改变现有 managed runtime 的下载源、校验源和目录布局
- 不把 `yt-dlp` 纳入本任务的安装期预热范围

## Cross-Layer Contract

### Data Flow

Windows installer
-> NSIS post-install hook
-> FlowSelect headless runtime bootstrap entrypoint
-> existing Rust managed runtime bootstrap functions
-> `app_config_dir/runtimes/<component>/<target>/`
-> normal app first launch
-> runtime status check
-> if still missing, existing frontend-triggered bootstrap fallback

### Boundaries

1. NSIS installer -> desktop bootstrap entrypoint
- 输入：已安装的应用路径、安装阶段上下文
- 输出：一次 installer-time bootstrap 尝试
- 风险：如果安装器调用方式不稳定，可能导致安装完成但运行时未预热

2. Bootstrap entrypoint -> existing Rust runtime installers
- 输入：installer trigger
- 输出：对 `ffmpeg`、`pinterest-dl`、`deno` 的统一 bootstrap
- 风险：如果这里重复实现逻辑，会和现有首启链路分叉

3. Runtime files on disk -> first-launch runtime gate
- 输入：managed runtime 目录中的文件状态
- 输出：`ready` 或 `missing`
- 风险：如果安装期预热的目录布局和首启检查不一致，会出现“明明下载了但仍判缺失”

### Contract Decisions

- 安装期预热与首启 bootstrap 必须共享同一套 Rust 下载/校验/安装逻辑
- 安装期预热成功后，首启链路只做状态检查，不应重复下载
- 安装期预热失败不得破坏安装完成后的正常首次启动
- 首启 bootstrap 保留，作为 repair path 和非安装包路径的统一兜底
- 安装期预热仅写入应用 managed runtime 目录，不写系统目录
- Windows 安装器只有在 installer-time prewarm 结束后，才允许进入“安装完成后立即启动应用”的下一步

## Requirements

- Windows 安装器需要在安装阶段尝试预热 `ffmpeg`、`pinterest-dl`、`deno`
- 安装器触发的预热必须复用现有 Rust runtime bootstrap 逻辑
- 现有首启 bootstrap 必须保留，不能被安装期链路替换掉
- 安装期和首启两条链路必须具备幂等性，不能因重复触发而破坏已安装运行时
- 安装期预热必须继续使用当前 managed runtime 目录布局与校验机制
- 安装期预热采用 best-effort 策略；失败时不阻塞 `setup.exe` 完成
- 安装后如果选择“立即启动应用”，启动时不得与尚未结束的安装期预热并发写同一目录
- 安装器需要给用户一个明确但简短的提示，说明正在下载 / 配置运行时组件
- 任务交付后，Windows 用户应当在大多数联网安装场景下，首次启动无需再等待 runtime 下载

## Acceptance Criteria

- [ ] Windows 安装器具备 installer-time runtime prewarm 能力
- [ ] 安装期预热复用现有 Rust bootstrap 实现，而不是复制一套下载逻辑
- [ ] `ffmpeg`、`pinterest-dl`、`deno` 的安装结果与现有首启链路兼容
- [ ] 安装期预热成功后，首次启动 `get_runtime_dependency_status` 返回对应组件为 `ready`
- [ ] 安装期预热失败或被跳过时，首次启动仍能按当前逻辑继续 bootstrap
- [ ] 安装器在预热期间展示清晰的运行时下载 / 配置提示
- [ ] 不写系统级 `PATH`，不污染全局环境
- [ ] 不影响 portable ZIP 包和非 Windows 平台现有行为

## Recommended Technical Direction

- 为桌面端新增一个可由安装器调用的 headless bootstrap 模式，例如：
  - `FlowSelect.exe --bootstrap-runtimes --noninteractive --exit`
- 该模式内部直接调用现有 `ensure_missing_managed_runtimes_ready(...)`
- NSIS `POSTINSTALL` hook 调用该入口，并等待其退出
- 这条链路定义为“best-effort prewarm”，而不是重新定义安装器的核心成功标准
- portable ZIP 不接入该 installer hook，继续依赖当前应用内 Rust bootstrap

## Implementation Research Outcome

### Confirmed Integration Point

- Tauri Windows 安装器应使用 `bundle.windows.nsis.installerHooks`
- hook 文件建议放在 `src-tauri/windows/hooks.nsh`
- 本任务应使用 `NSIS_HOOK_POSTINSTALL`

### Recommended Implementation Shape

- 在 `FlowSelect.exe` 主入口增加一个 installer-only CLI mode，例如：
  - `--bootstrap-runtimes`
  - `--noninteractive`
  - `--exit`
- 该模式必须在真正进入 `tauri::Builder::default()` 之前短路
- 不建议让安装器直接启动“正常 Tauri UI 再在 setup 里退出”，因为当前 `run()` 会继续初始化：
  - single-instance plugin
  - tray
  - WebSocket server
  - 主窗口 / 设置窗口相关逻辑

### Required Refactor Direction

- 当前 managed runtime bootstrap helper 强依赖 `AppHandle`
- 为了让 installer-only CLI mode 不必完整启动 Tauri UI，需要把 runtime bootstrap 核心抽成 app-independent core
- 该 core 负责：
  - managed runtime 路径解析
  - 下载
  - 校验
  - staged install
  - Windows proxy 复制
- Tauri app 路径继续在外层保留：
  - runtime gate state 更新
  - event emit
  - 前端状态同步

### Path Resolution Findings

- Windows 上 `resource_dir` 实际解析为主 exe 所在目录
- `app_config_dir` 实际解析为 `dirs::config_dir() / bundle_identifier`
- 这意味着 installer-only CLI mode 可以在不完整启动 Tauri app 的前提下，稳定复用当前目录契约

### Preferred File Change Shape

- `src-tauri/src/main.rs`
  - 解析 installer bootstrap CLI 参数
  - 在普通 Tauri 启动前短路到 headless bootstrap path
- `src-tauri/src/lib.rs`
  - 抽离 managed runtime bootstrap core
  - 保留现有 Tauri command / gate state / first-run fallback 包装层
- `src-tauri/tauri.conf.json`
  - 新增 `bundle.windows.nsis.installerHooks`
- `src-tauri/windows/hooks.nsh`
  - 在 `NSIS_HOOK_POSTINSTALL` 调用 `FlowSelect.exe --bootstrap-runtimes --noninteractive --exit`
  - 给安装器输出简短提示，说明正在下载 / 配置运行时组件

### Fallback Option

- 如果主程序短路模式实现成本异常高，备选方案是单独新增 installer bootstrap helper binary
- 但这会引入额外二进制交付与入口维护成本，因此当前不作为首选方案

## Validation And Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| 安装器成功，但设备离线 | installer-time prewarm | 安装完成；首次启动继续 bootstrap | 记录预热失败，不阻塞应用可用性 |
| 安装器预热成功 | first launch status | `ffmpeg` / `pinterest-dl` / `deno` 均为 `ready` | 首启不再重复下载 |
| 安装器预热只完成一部分 | first launch status | 已完成组件为 `ready`，缺失组件继续首启 bootstrap | 保持幂等补齐 |
| 安装器与首启并发触发 | launch-after-install path | 不发生双写冲突 | 安装器等待 prewarm 结束后再允许启动应用 |
| 安装期入口复制了一套 URL / sha 逻辑 | code review | 合同分叉，后续维护成本增加 | 改为复用现有 Rust bootstrap |
| 预热写入了错误目录 | runtime status check | 应用仍判缺失 | 严格复用当前 managed runtime 路径 helpers |
| 安装期失败导致整个安装回滚 | product behavior | 用户可能完全无法安装 | 需要明确是否允许这种强阻塞策略 |

## Good / Base / Bad Cases

- Good:
  - 用户联网运行 Windows 安装器，安装阶段完成 runtime prewarm，首次打开应用时 runtime 面板全部为 `ready`
- Base:
  - 用户离线安装，安装阶段预热失败，但首次启动时仍能看到当前 runtime gate，并在联网后完成下载
- Bad:
  - 安装器成功执行过预热，但首次启动仍因路径布局不一致再次完整下载一遍
- Bad:
  - 为了安装期预热，在 NSIS 内维护了一套与 Rust 不一致的下载 URL / checksum / 解压逻辑

## Files Likely To Change

- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- installer-related Windows bundle hook files under `src-tauri/`
- potentially a new NSIS hook script
- possibly `scripts/` helper files if packaging needs a shared bootstrap wrapper
- maybe `src/App.tsx` only if runtime gate copy or startup coordination needs adjustment

## Requirement Review Outcome (2026-03-16)

- 已确认：安装期预热失败时，`setup.exe` 继续完成安装，不把预热失败升级为安装失败
- 已确认：接受安装时间变长，以换取首次启动更接近开箱即用
- 已确认：安装器需要给出明确提示，说明正在下载 / 配置运行时组件
- 已确认：本任务只覆盖 Windows `setup.exe`
- 已确认：portable ZIP 不接入安装期预热，继续走现有 Rust bootstrap 逻辑
