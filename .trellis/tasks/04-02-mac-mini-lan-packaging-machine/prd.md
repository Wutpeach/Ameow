# brainstorm: mac mini 局域网打包机方案

## Goal

设计一套可落地的方案，把局域网内的一台 Mac mini 作为 FlowSelect 的本地 macOS 打包与运行验证机器使用，重点服务于“本地测试时验证 mac 平台能否正确运行”，同时保持现有 GitHub release / 打包链路不变。

## What I already know

* 当前项目已经从 Tauri 切换到 Electron，`package.json` 中存在 `package:mac:zip` 和 `package:macos-open-source-dmg`。
* 当前发布工作流 `.github/workflows/release.yml` 已包含 `build-macos` job，并分别为 `x86_64` 与 `aarch64` 生成 macOS ZIP / DMG 产物。
* 当前仓库的 mac 发布定位是“open-source unsigned DMG + ZIP”，`electron-builder.config.mjs` 中 `mac.identity = null`、`hardenedRuntime = false`、`gatekeeperAssess = false`。
* 本仓库的自定义脚本 `scripts/package-macos-open-source-dmg.mjs` 强制要求在 `darwin` 平台执行，因此 mac 产物本来就应该在 macOS 上构建。
* 你刚刚明确：这里只需要覆盖“本地测试时能在 Mac mini 上打包并验证运行”，GitHub 的正式打包链保持原状，不做改造。
* 你刚刚明确：这台 Mac mini 是 Apple Silicon，因此本地验证的默认目标架构应为 `arm64`。
* `electron-builder` 官方文档说明：不要指望在单一平台上构建所有平台；macOS code signing 只能在 macOS 上完成。
* Apple 官方文档说明：对 Mac App Store 外分发的 app，Developer ID 与 notarization 会提升 Gatekeeper 信任；macOS Catalina 及以后版本默认更偏好已 notarized 的软件。
* Apple 官方文档同时说明：未签名/未公证 app 仍可由用户手动放行，但用户体验与信任感更差。

## Assumptions (temporary)

* 这台 Mac mini 长期开机，可稳定访问 GitHub / npm 与外部依赖下载源。
* 你的目标首先是“让这台 Mac 能稳定产出 FlowSelect 的 macOS 包”，不是马上做 Developer ID 签名与 Apple notarization。
* 你希望尽量从当前 Windows 主开发机协同这台 Mac，而不是把完整开发工作迁到 Mac 上。
* 你更在意“本地验证闭环简单、低维护”，而不是正式 release 自动化。

## Open Questions

* 当前无阻塞问题；默认按 Apple Silicon / `arm64` 本地验证闭环设计。

## Requirements (evolving)

* 方案必须能在 macOS 上生成与当前仓库兼容的 ZIP / DMG 产物，供本地安装与运行验证。
* 方案必须明确本地测试链路如何触发、日志在哪里看、失败后如何重试，以及 Windows 主机与 Mac mini 如何协作。
* 方案必须覆盖最少可行的机器准备项：Node、npm、Xcode Command Line Tools、Git、SSH/远程控制方式、磁盘空间、缓存目录。
* 方案必须保持现有 GitHub release / tag workflow 不变。
* 方案必须给出未来如需接入签名 / notarization 时的升级路径，但不把它放入本轮 MVP。
* 已选定触发方式：由 Windows 主机通过 SSH 一键远程触发 Mac mini 执行打包与本地验证流程。

## Acceptance Criteria (evolving)

* [ ] 选定一种本地测试主方案，并说明为什么它比另外 1-2 种方案更适合当前诉求。
* [ ] 给出主方案的端到端流程：代码同步/触发构建/安装运行/查看日志/重试。
* [ ] 给出 Mac mini 的初始化清单、运行时依赖、目录约定、和基础运维建议。
* [ ] 给出至少一组失败场景与对应恢复动作。
* [ ] 明确哪些内容属于 MVP，哪些延后到签名、公证或正式 release 自动化阶段。
* [ ] 明确 Windows 远程触发链路中的代码同步方式、工作目录约定、和命令入口。

## Definition of Done (team quality bar)

* 方案与当前仓库打包脚本、现有 unsigned macOS 分发策略一致
* 关键技术取舍有可验证依据（仓库现状或官方文档）
* 范围清楚，MVP 与后续增强分层明确

## Research Notes

### What similar tools / official docs indicate

* `electron-builder` 的 mac 构建与 mac 签名都要求在 macOS 上执行。
* Apple 对站外分发的推荐方向是 Developer ID + notarization；如果继续 unsigned 分发，用户端需要处理 Gatekeeper 放行。

### Constraints from our repo/project

* 当前 `.github/workflows/release.yml` 已经是 tag 驱动的多平台 release 流程，macOS job 已独立。
* 当前 mac 包装脚本已经是 repo 内建脚本，不需要另起一套打包逻辑。
* 当前 Electron mac 配置是 unsigned；如果暂不引入 Apple 账号与证书，Mac mini 只需要负责构建，不需要 Keychain 签名配置。
* 项目同时生成 x64 与 arm64 mac 产物；这台 Mac mini 是 Apple Silicon，所以 MVP 只把 `arm64` 当作本地验证默认目标，`x64` 延后处理。

### Feasible approaches here

**Approach A: Mac mini 本地工作副本 + 手动/远程桌面触发打包** (Recommended)

* How it works:
  在 Mac mini 上保留一个稳定的仓库工作副本和固定依赖环境；需要验证时，把目标提交同步到 Mac，直接执行 `npm ci` / `npm run package:macos-open-source-dmg -- --arch ... --version ...`，随后在 Mac 上安装 app 做运行验证。
* Pros:
  实现最简单，和当前诉求最匹配；不改 GitHub workflow；问题定位直接，最少额外系统。
* Cons:
  自动化程度较低；从 Windows 到 Mac 的同步与触发需要你定义一个习惯流程。

**Approach B: Windows 主机通过 SSH 一键远程触发 Mac mini 打包** (Chosen)

* How it works:
  Windows 上编写一个发布脚本，SSH 到 Mac mini 执行 `git fetch && git checkout <ref> && npm ci && npm run package:macos-open-source-dmg ...`，然后把产物拷回主机或上传到对象存储 / GitHub Release。
* Pros:
  仍然不改 GitHub workflow，但日常使用体验更好；从 Windows 触发更顺手。
* Cons:
  需要自己处理 SSH、日志、工作副本状态和失败恢复；复杂度高于纯手动方案。

## Decision (ADR-lite)

**Context**: 用户当前只想在本地测试阶段验证 macOS 能否正确运行，不希望改动 GitHub 正式打包链路，但希望从 Windows 主机一键触发 Mac mini 完成 mac 打包与验证。

**Decision**: 采用 Windows -> SSH -> Mac mini 的旁路本地验证方案，独立于现有 GitHub Actions release workflow。

**Consequences**:

* 优点：不影响现有发布体系；日常使用成本低；符合“本地验证优先”的诉求。
* 代价：需要维护一套局域网远程触发脚本、Mac 工作副本约定、以及失败恢复流程。
* 后续：如果本地验证使用频率升高，可在此基础上再演进为更完整的远程构建服务或 self-hosted runner。

## Technical Approach

### Recommended MVP

在 Mac mini 上保留一个固定工作目录，例如 `~/flowselect-build/FlowSelect`，由 Windows 主机通过 SSH 远程执行单一入口脚本，例如 `scripts/remote-mac-build.sh` 或 `scripts/remote-mac-build.ps1` 对应的 Mac 侧脚本。

端到端流程：

* Windows 本地完成代码提交，拿到目标分支或 commit SHA。
* Windows 脚本通过 SSH 连接 Mac mini。
* Mac mini 在固定工作副本内执行：
  * `git fetch --all --tags`
  * `git checkout <branch-or-sha>`
  * `npm ci`
  * `npm run package:macos-open-source-dmg -- --arch aarch64 --version <derived-version>`
* 打包完成后，在 Mac 上直接安装 `dist-release/dmg/*.dmg` 或解压 `dist-release/*.zip`，执行一次人工 smoke test。
* 需要时由 Windows 再通过 `scp` / `rsync` 把产物拷回本机归档。

### Directory and command contract

* Mac 固定目录：
  * repo: `~/flowselect-build/FlowSelect`
  * logs: `~/flowselect-build/logs`
  * optional artifacts mirror: `~/flowselect-build/artifacts`
* Mac 单一入口脚本负责：
  * 校验目录是否存在
  * 输出当前 commit / branch / Node / npm 版本
  * 清晰记录成功或失败日志
  * 失败时返回非零退出码给 Windows
* Windows 单一入口脚本负责：
  * 接受 `--ref`、`--skip-install`、`--copy-artifacts` 等参数
  * 拼接 SSH 命令
  * 将日志实时打印到本机终端

### Machine bootstrap checklist

* Mac mini：
  * 安装 Xcode Command Line Tools
  * 安装 Homebrew（可选但推荐）
  * 安装 Node 20 LTS
  * 安装 Git
  * 启用 SSH Remote Login
  * 配置一个专用构建用户或至少专用 SSH key
  * 首次手动跑通 `npm ci` 与 `npm run package:macos-open-source-dmg -- --arch aarch64 --version <test-version>`
* Windows 主机：
  * 安装 OpenSSH client（Windows 自带即可）
  * 配置到 Mac mini 的 SSH key
  * 准备一个 PowerShell 包装脚本作为唯一入口

### Failure / recovery matrix

* `npm ci` 失败：
  * 先检查 Node 版本是否与 repo 约定一致
  * 再清理 Mac 上 `node_modules` 与 npm cache 后重试
* `package:macos-open-source-dmg` 失败：
  * 重点检查 `hdiutil`、桌面资源文件、以及 repo 工作副本是否干净
* 应用无法打开：
  * 因当前为 unsigned app，先执行 `xattr -dr com.apple.quarantine "/Applications/FlowSelect.app"` 再重试
* 远程脚本卡住：
  * 用超时控制终止 SSH 会话
  * 重新 SSH 到 Mac 检查残留 `npm` / `electron-builder` 进程和工作目录锁

## Out of Scope

* 自动生成双架构本地验证矩阵
* 将本地验证结果自动回写到 GitHub Checks
* Developer ID 签名与 notarization
* 对 GitHub release workflow 的任何结构性修改

**Approach C: 共享目录/rsync 驱动的“投递式”打包**

* How it works:
  Windows 把构建输入或源码同步到 Mac mini 的指定目录，Mac 侧 watcher 或固定脚本消费该目录并产出安装包。
* Pros:
  可以弱化 SSH 依赖，也便于以后扩展成半自动流水线。
* Cons:
  设计和维护成本偏高，对当前“只是本地验证”来说有些过度设计。

## Out of Scope (explicit)

* 本轮不修改 GitHub Actions release workflow。
* 本轮不直接实施签名、公证、App Store 上架。
* 本轮不设计多台 mac 机器的弹性调度。
* 本轮不追求全自动 CI，只聚焦“如何让这台 Mac mini 服务本地 mac 运行验证”。

## Technical Notes

* Repo files inspected:
  * `package.json`
  * `.github/workflows/release.yml`
  * `electron-builder.config.mjs`
  * `scripts/package-macos-open-source-dmg.mjs`
  * `.trellis/spec/guides/cross-platform-thinking-guide.md`
* Official references used:
  * GitHub Docs: self-hosted runners, labels, service config
  * electron-builder docs: multi-platform build / macOS signing constraints
  * Apple Developer / Apple Support: outside-App-Store distribution, notarization, Gatekeeper behavior
