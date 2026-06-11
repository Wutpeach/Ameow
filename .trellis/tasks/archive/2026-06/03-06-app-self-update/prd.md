# app self-update via public GitHub Releases

## Goal

为 FlowSelect 增加应用内自动更新能力，并将主窗口右下角现有的 `yt-dlp` 更新入口替换为应用更新入口；同时保留 `Settings` 页中的 `yt-dlp` 更新面板。

本次实现基于当前仓库已经公开这一前提，采用公开 GitHub Releases + Electron 桌面运行时内置更新检查的方案，优先完成可落地的 MVP。

## Status Update (2026-03-16)

* 应用内自更新的 MVP 代码链路已经落地，包括主窗口更新入口、Tauri updater/process 插件、权限配置、签名清单生成脚本，以及 GitHub Release 发布流程。
* 发布链路已用 `v0.2.7-rc2` 预发布验证通过；该 release 已成功产出 `latest.json`、Windows 安装包和 macOS updater 归档资产。
* 针对 GitHub immutable prerelease 仓库限制，release workflow 已改为“先创建 draft、上传资产、再发布 release”。
* 当前仍未完成的是“真实已安装应用 -> 应用内发现新稳定版本 -> 下载并安装”的端到端冒烟测试；该测试计划延后到 `0.2.8` 版本开发完成后执行。
* 之所以延后到 `0.2.8`，是因为当前验证使用的是 `v0.2.7-rc2` 预发布，而现有稳定版 `0.2.7` 不会通过 GitHub `/releases/latest` 自动发现 prerelease，也不会把 `0.2.7-rc2` 视为高于 `0.2.7` 的稳定升级目标。

## Status Update (2026-04-07)

* 当前桌面实现已迁移到 Electron，应用更新入口仍保留在主窗口右下角，但更新检查逻辑已不再依赖 Tauri updater 插件。
* 本次追加范围是在 `Settings` 页新增“接收测试版更新”开关；开启后应用更新检查会消费公开 GitHub Releases 中最新的 prerelease（如 `beta` / `rc`），关闭时继续只消费稳定版。
* 预发布通道不会替换默认稳定通道；默认行为仍然是稳定版-only。
* 为避免稳定版被较旧的 RC 误判为“新版本”，应用版本比较需要改为遵守 semver prerelease 语义，而不是仅做宽松数字比较。

## Current Facts

* 主窗口右下角的更新入口位于 `src/App.tsx`，现已切换为消费应用更新状态；`yt-dlp` 更新逻辑保留在 `Settings` 页。
* `Settings` 页保留完整的 `yt-dlp` 版本查看与更新 UI，位于 `src/pages/SettingsPage.tsx`，本任务不移除该面板。
* 版本号统一由 `npm run version:set -- <version>` 维护，覆盖 `package.json`、`package-lock.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src/constants/appVersion.ts`。
* 现有 `.github/workflows/release.yml` 会在推送 `v*` tag 后构建 Windows/macOS 安装包并创建 GitHub Release。
* 当前项目已接入 `tauri-plugin-updater` / `@tauri-apps/plugin-updater`，并补充 `tauri-plugin-process`、updater 权限、公钥配置与 `latest.json` 生成逻辑。
* 当前公开仓库的 `latest release` 元数据可以匿名访问，公开 release 资产也可以匿名下载；这使公开 GitHub Releases 成为当前 MVP 的可行更新分发源。

## Product Decision

### Chosen MVP

* 使用公开 GitHub Releases 作为更新分发源。
* 使用 Electron 主进程内的更新检查与安装器拉起逻辑进行检查、下载、安装。
* 主窗口右下角入口从 “更新 yt-dlp” 改为 “应用有更新可安装时显示”。
* `Settings` 页增加一个轻量的应用更新通道开关，仅用于切换是否接收预发布版本；不新增完整应用更新卡片。
* portable 包不纳入自动更新范围。
* 默认稳定通道保持不变，预发布通道仅对主动开启开关的用户可见。

### Explicit Non-Goals For This Iteration

* 私有仓库 / 私有 release 的鉴权分发。
* 自建更新代理服务或灰度发布系统。
* portable 包原地自更新。
* `Settings` 页新增完整应用更新卡片。
* 多更新通道切换（stable / beta / nightly）之外的更复杂通道管理 UI。
* 依据用户当前安装来源动态选择不同 Windows 安装器家族。

## Minimal Change List

这是“能把功能跑通并接入现有发布链路”的最小改造集合。

1. Release pipeline
* 在 Tauri 构建中启用 updater artifact 生成与签名。
* 在 GitHub Actions release 流程中收集签名产物，生成并上传公开 `latest.json`。
* 保留现有 MSI / NSIS / DMG / portable 发布资产，不重做整体 release 流程。

2. Desktop runtime
* 接入 `tauri-plugin-updater`。
* 接入前端 `@tauri-apps/plugin-updater`，在主窗口执行检查、下载、安装。
* 接入必要权限配置；若安装后需要自动重启，则补 `process` 插件与权限。

3. Main window UI
* 用应用更新状态替换现有 `yt-dlp` 角标逻辑。
* 仅在存在新版本时显示角标。
* 点击后执行下载并安装；安装完成后触发重启或提示用户重启。

4. Type/i18n contracts
* 新增应用更新状态类型定义。
* 新增主窗口应用更新相关文案。
* 不破坏现有 `yt-dlp` 类型、命令、Settings 文案与刷新事件。

## Non-Minimal Change List

这是“更完整但明显超出 MVP”的增强范围。

1. Distribution sophistication
* 自建更新代理或对象存储分层分发。
* 按 stable / prerelease / internal channel 切换 endpoint。
* 私有 release 与受控下载令牌。

2. Windows installer sophistication
* 针对 NSIS / MSI 安装来源分别分发不同 updater 清单。
* 自动识别当前安装类型并选择匹配安装器。
* 对旧版本非 updater 安装做迁移兜底。

3. Product surface expansion
* 在 `Settings` 页新增应用更新卡片。
* 加入“检查更新”按钮、“跳过此版本”、“查看更新日志”。
* 显示更细的下载进度、错误码、回滚文案。

4. Release process sophistication
* 自动区分 stable / prerelease 对应的 `latest*.json`。
* 独立的 updater metadata 校验任务。
* 更细的签名密钥轮换与迁移流程。

## Cross-Layer Contract

### Data Flow

GitHub Release assets
-> release workflow 生成并上传每个 release 自带的 `latest.json`
-> Electron 主进程按配置决定读取稳定 `latest.json` 或最新 prerelease release 附带的 `latest.json`
-> 前端主窗口检查更新
-> 用户点击角标开始下载与安装
-> 应用安装完成并重启

### Boundaries

1. Release workflow -> updater metadata
* 输入: 构建产物与对应 `.sig`
* 输出: 公开可访问的 `latest.json`
* 风险: 元数据 URL / signature / platform key 不匹配会导致客户端更新失败

2. Electron main -> preload -> frontend updater API
* 输入: 更新通道配置、manifest endpoint、预发布 release 查询结果
* 输出: `check()` / `downloadAndInstall()` 可用
* 风险: 配置读取错误、prerelease release 缺少 `latest.json`、版本比较不遵守 prerelease 语义，都会导致更新判断错误

3. Frontend update state -> main window badge
* 输入: 当前版本、远端版本、是否有更新、下载中状态、错误状态
* 输出: 主窗口角标显隐、tooltip、点击行为
* 风险: 状态机不清晰会导致角标消失、卡死或错误提示缺失

### Contract Decisions

* 主窗口入口只消费应用更新状态，不再绑定 `yt-dlp` 更新状态。
* `Settings` 页 `yt-dlp` 面板继续使用 `check_ytdlp_version` / `update_ytdlp`。
* updater endpoint 使用公开静态 JSON。
* 当用户开启测试版接收时，客户端应改为查询公开 GitHub Releases API 中最新的 prerelease，并读取该 release 的 `latest.json` 资产。
* Windows 自动更新优先使用单一 canonical 安装器资产；MVP 不处理“不同安装来源分别匹配不同安装器”的复杂分流。
* 默认通道仍为稳定版，`receivePrereleaseUpdates` 仅作为本地 opt-in 配置存在于用户设置文件中。

### Validation And Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| release 流程未生成 `.sig` 或 `latest.json` | CI artifact assembly | 自动更新不可用但普通 release 仍可下载 | CI 明确失败并阻止缺失 updater metadata 的正式 release |
| 前端已接入 updater API，但 Rust 未注册 plugin | runtime invoke | `check()` / install 调用失败 | 注册 updater plugin 并补 capability |
| capability 未开放 updater/process 权限 | runtime permission | 安装或重启阶段失败 | 为 `main` / `settings` 补对应权限 |
| GitHub latest.json 可访问但平台 key 不匹配 | update check | 客户端检查失败 | 生成脚本按 Tauri 平台 key 输出 |
| 当前版本是稳定版，最新 prerelease 属于同一 base version | app version compare | 不应把 `0.3.0-rc6` 误判为高于 `0.3.0` | 使用 semver-aware prerelease comparison |
| 用户开启测试版接收，但最新 prerelease release 缺少 `latest.json` | prerelease manifest lookup | 不应让更新链路整体崩掉 | 跳过无 manifest 的 prerelease，必要时回退稳定通道 |
| 当前无新版本 | main window UI | 不显示应用更新角标 | 保持静默 |
| 下载 / 安装失败 | main window UI | 角标保留并给出可重试状态 | 记录错误并允许再次点击 |
| release 资产公开但仓库将来转回私有 | product/release | 自动更新失效 | 后续改为自建更新代理，不在本次实现范围 |

### Good / Base / Bad Cases

* Good:
  用户运行 `v0.2.7`，公开 release 中已有 `v0.2.8` 的 `latest.json` 和安装器，主窗口出现更新角标，点击后完成下载、安装并重启到 `v0.2.8`。
* Base:
  用户当前已是最新版本，主窗口不显示更新角标；`Settings` 页里的 `yt-dlp` 更新面板行为不变。
* Bad:
  主窗口仍然显示 `yt-dlp` 更新红点，或者应用更新角标出现后点击仍调用 `update_ytdlp`。

## Requirements

* 主窗口右下角原 `yt-dlp` 更新入口改为应用更新入口。
* `Settings` 页中的 `yt-dlp` 更新面板保留，不与应用更新功能合并。
* `Settings` 页需新增“接收测试版更新”开关，并把结果持久化到本地配置。
* 应用需要具备检查新版本、下载、安装的完整链路。
* 更新机制必须兼容现有 tag + GitHub Release 发布流程，并以最小增量改造落地。
* 关闭开关时仅检查稳定版；开启开关时可检查最新 prerelease。
* prerelease 检查不得要求客户端内置私有 token。
* 方案不得在客户端硬编码私有 GitHub token 或私有仓库读权限。

## Acceptance Criteria

* [x] 主窗口入口与 `Settings` 页 `yt-dlp` 面板职责边界明确且落地到代码。
* [x] 公开 GitHub Releases + Tauri updater 的技术链路在仓库内接通。
* [x] release workflow 能生成并发布 updater metadata。
* [ ] `Settings` 页的测试版接收开关能立即影响后续应用更新检查结果。
* [ ] 主窗口存在新版本时能显示入口，并能执行下载/安装。
* [x] `Settings` 页原有 `yt-dlp` 更新能力不回归。
* [x] lint / typecheck / tests 通过。

## Deferred Validation

* 待 `0.2.8` 开发完成后，使用真实安装包执行一次稳定版升级冒烟测试：
  * 从已安装的 `0.2.7` 或更早稳定版启动应用。
  * 校验主窗口能发现 `0.2.8`。
  * 校验点击后可完成下载、安装与重启。
* 若稳定版验证通过，再将上面的“主窗口存在新版本时能显示入口，并能执行下载/安装”验收项勾选完成。

## Technical Notes

* Candidate files to modify:
  * `src/App.tsx`
  * `src/types/`
  * `src/pages/SettingsPage.tsx`
  * `src/updates/`
  * `electron/main.mts`
  * `electron/appUpdate.mts`
  * `locales/en/desktop.json`
  * `locales/zh-CN/desktop.json`
* Main-window current behavior:
  `src/App.tsx` 通过 Electron preload bridge 的 `check()` / `downloadAndInstall()` 状态驱动右下角应用更新入口。
* Settings current behavior:
  `src/pages/SettingsPage.tsx` 保留完整的 `yt-dlp` 查看与更新逻辑，并新增应用更新通道开关。

## Definition Of Done

* Code, types, i18n, permissions, and release workflow are updated coherently.
* `npm run lint`, `npm run typecheck`, and relevant tests pass.
* Public updater metadata is part of the release output contract.
* Remaining risks are documented, especially around untested platform-specific install behavior.
