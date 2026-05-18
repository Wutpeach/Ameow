# brainstorm: circleci release packaging

## Goal

为 FlowSelect 设计一条可替代现有 GitHub Actions 发布流水线的 CircleCI 打包方案，重点是在 GitHub Actions 配额不足的情况下，仍能稳定产出当前发布所需的 Windows 与 macOS 安装包/便携包，并明确哪些现有能力可以直接迁移、哪些需要调整发布策略。

## What I already know

* 当前仓库只有 GitHub Actions 发布流水线，定义在 `.github/workflows/release.yml`；`.circleci/` 目录目前不存在。
* 用户新增明确约束：当前阶段必须让 CircleCI 承担打包任务，因为 GitHub Actions 配额已用尽，不能再依赖 GitHub Actions 完成打包。
* 现有发布流程由 3 个 job 组成：
  * `build-windows`
  * `build-macos`
  * `create-release`
* Windows 发布链路当前会：
  * 下载 `yt-dlp.exe`
  * 下载 `deno-x86_64-pc-windows-msvc.zip`
  * 下载并提取 `ffmpeg.exe`
  * 从 tag 提取版本号，并把 pre-release 版本转换为 MSI-safe 版本
  * 更新版本号
  * `npm ci`
  * 构建并 smoke test Pinterest sidecar
  * `npm run tauri build`
  * 调用 `scripts/package-portable.ps1` 生成便携版 ZIP
  * 上传 MSI / NSIS / portable 三类产物
* macOS 发布链路当前会：
  * 在 `x86_64-apple-darwin` 和 `aarch64-apple-darwin` 两个 runner 上分别构建
  * 下载对应 target 的 `deno`
  * 下载 `yt-dlp_macos`
  * 构建并 smoke test Pinterest sidecar
  * `npm run tauri build -- --target <triple>`
  * 上传 Intel / ARM 两个 DMG
* 最后的 `create-release` job 会：
  * 聚合前面 jobs 的 artifacts
  * 检查 `release-notes/v<version>.md` 是否存在
  * 创建 GitHub Release 并上传产物
* 项目约定要求版本更新必须走 `npm run version:set -- <version>`，不能手工散改版本字符串；当前 GitHub workflow 仍直接调用 `node ./scripts/update-version.mjs`，迁移时应顺手收敛到约定入口。
* `src-tauri/tauri.conf.json` 当前 bundle 配置会把 `binaries/yt-dlp*`、`binaries/deno*`、`binaries/pinterest-dl*` 以及 `resources/locales/` 一起打进包。
* 当前 release 流程没有看到额外的 macOS notarization / Windows signing 步骤，说明当前目标更偏向“生成可分发产物 + GitHub Release 发布”，而不是完整签名发布链。
* `scripts/build-pinterest-sidecar.mjs` 的 `--target` 主要影响输出文件名；脚本本身是在当前宿主机上创建 venv、安装 PyInstaller 并本机构建 sidecar。
* `scripts/smoke-pinterest-sidecar.mjs` 也是依赖本地产出的目标二进制做 smoke test。
* 当前 CircleCI 官方文档显示：
  * Windows 可以用 machine image，例如 `windows-server-2022-gui:current`
  * macOS executor 当前展示的是 Apple Silicon 资源类，例如 `m4pro.medium` / `m4pro.large`
  * workflow 可以用 `pipeline.git.tag` 做 tag 触发过滤
  * 可用 `persist_to_workspace` 和 `store_artifacts` 做跨 job 传递和产物保留

## Assumptions (temporary)

* 用户希望 CircleCI 至少接管“打包”这部分工作，而不是只做校验。
* GitHub Actions 当前对这个任务可视为不可用打包平台，而不是可选备用平台。
* GitHub Releases 仍然是对外分发目标，除非后续明确改成只保留 CircleCI artifacts。
* Windows 产物应尽量保持现有 parity：MSI、NSIS、portable ZIP 继续保留。
* 真正的难点不在 Windows，而在 macOS Intel/ARM 双架构支持如何在 CircleCI 上落地。

## Open Questions

* 无

## Requirements (evolving)

* 需要给出一条可在 CircleCI 上运行的发布/打包方案，而不是停留在概念建议。
* 打包阶段不能依赖 GitHub Actions；CircleCI 需要能独立完成本次选定范围内的构建产物生成。
* 方案需要覆盖当前 release.yml 中已经存在的关键发布动作：
  * tag 驱动的版本解析
  * 版本注入
  * 第三方二进制准备
  * Pinterest sidecar build + smoke test
  * Tauri 打包
  * artifacts 聚合
* Windows 方案应继续覆盖：
  * MSI
  * NSIS
  * portable ZIP
* 当前 MVP 的 macOS 范围收敛为 `aarch64-apple-darwin`（macOS ARM）产物。
* 当前 MVP 不要求继续产出 Intel macOS 安装包。
* 版本更新流程应改用项目约定的 `npm run version:set -- <version>`。
* 当前 MVP 需要由 CircleCI 自动创建 GitHub Release 并上传安装包。
* CircleCI 创建 GitHub Release 时需要读取 `release-notes/v<version>.md` 作为 release body。
* CircleCI 中的 GitHub Release 步骤需要显式校验 `release-notes/v<version>.md` 是否存在；缺失时应 fail-fast。
* 需要明确 CircleCI 中的实现方式与所需 token / context。

## Acceptance Criteria (evolving)

* [x] 已明确 CircleCI 迁移后的目标范围，是 full parity、MVP，还是混合方案。
* [ ] 已明确 Windows 打包链路在 CircleCI 中的落地方式。
* [x] 已明确 macOS 架构策略，以及为什么该策略与当前仓库约束相容。
* [x] 已明确最终产物如何从 CircleCI jobs 汇总并对外发布。
* [ ] 已明确需要新增的 CircleCI 配置、上下文变量和可能的仓库调整点。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Research Notes

### What similar tools / platforms do

* CircleCI 官方配置模型以 `jobs` + `workflows` 为核心，支持用 `filters: pipeline.git.tag starts-with "v"` 这类表达式做 tag 触发。
* CircleCI 官方支持：
  * Windows machine image，例如 `windows-server-2022-gui:current`
  * macOS executor，当前官方文档主展示 Apple Silicon 资源类 `m4pro.medium` / `m4pro.large`
* CircleCI 官方配置支持：
  * `persist_to_workspace` 在 workflow 内跨 job 共享文件
  * `store_artifacts` 保存构建产物
* GitHub 官方 REST API 支持：
  * Create Release
  * 使用返回的 `upload_url` 上传 release assets
* Tauri 官方文档支持：
  * `tauri build --target universal-apple-darwin` 生成同时支持 Apple Silicon 和 Intel 的 universal app
  * 如果只支持 Apple Silicon，可把 `minimumSystemVersion` 提高到 `12.0`

### Constraints from our repo/project

* 当前 macOS 发布不是单一产物，而是分别构建 `x86_64-apple-darwin` 和 `aarch64-apple-darwin` 两套 DMG。
* 由于 GitHub Actions 配额已耗尽，不能把“Intel 产物仍交给 GitHub Actions”当作迁移方案的一部分。
* `scripts/build-pinterest-sidecar.mjs` 并不是真跨架构构建脚本；它本质上依赖当前机器架构运行 PyInstaller。也就是说：
  * 在 Apple Silicon 机器上给它传 `--target x86_64-apple-darwin`，最多只是把文件名命名成 x86_64，不代表真的得到 Intel sidecar。
* Tauri 官方 sidecar 文档也明确指出，示例脚本不适用于“在与当前运行架构不同的目标上编译”，只能作为起点。
* 当前项目运行时会根据平台/架构解析不同名字的 bundled 二进制（`yt-dlp-*`、`pinterest-dl-*`），所以 macOS 多架构支持不是“只改 CI 标签”就能解决，必须保证对应架构的实际二进制存在。
* CircleCI 当前官方 macOS 文档只列出 Apple Silicon 资源类；结合仓库当前 sidecar 构建方式，这意味着“完全复刻现有 Intel + ARM 双 runner 工作流”存在实际阻塞。
* Windows portable 打包脚本是 PowerShell，且依赖 Windows 产物目录结构；这部分更适合直接迁移到 CircleCI Windows machine job，而不是改造成 Linux job。

### Feasible approaches here

**Approach A: 混合迁移，先保发布 parity** (Recommended)

* How it works:
  * CircleCI 接管 Windows 全量打包，以及 macOS ARM 打包。
  * macOS Intel 构建先保留为外部步骤，例如：
    * 现有/新增自托管 Intel Mac runner
    * 手工补构建
    * 另一个仍可用的平台
  * 最终发布阶段统一汇总所有产物后再创建 GitHub Release。
* Pros:
  * 最接近当前发布面，不会立即丢 Intel 用户。
  * 不需要马上重写 Pinterest sidecar 构建链。
  * CircleCI 已经能立刻承接最重的 Windows 打包压力。
* Cons:
  * 不是“纯 CircleCI 单平台闭环”。
  * 发布流程会在过渡期内更复杂。
  * 不能再把 GitHub Actions 当成过渡承载方，只能是 CircleCI + 其他非 GitHub Actions 手段。

**Approach B: CircleCI-only MVP，改为 Windows + macOS ARM**

* How it works:
  * CircleCI 完整接管 Windows 和 macOS ARM 构建。
  * release 只发布：
    * Windows MSI / NSIS / portable
    * macOS ARM DMG
  * 若明确转为 Apple Silicon only，再评估是否把 `minimumSystemVersion` 提升到 `12.0`。
* Pros:
  * 实施最快，CircleCI 配置也最直接。
  * 能尽快摆脱 GitHub Actions 配额限制。
  * 与当前 CircleCI Apple Silicon executor 能力直接对齐。
* Cons:
  * 会改变现有 macOS 支持范围。
  * Intel Mac 用户要么失去支持，要么只能停留在旧版本。

**Selected for current phase**

* 用户已确认当前阶段接受 CircleCI 先只产出 `Windows + macOS ARM`，不要求继续支持 `Intel macOS`。

**Approach C: 为 full parity 重构 macOS 构建链**

* How it works:
  * 目标仍是 CircleCI 内实现 Windows + macOS Intel + macOS ARM 全覆盖。
  * 但为实现这一点，需要至少补上一项：
    * Intel Mac 自托管 CircleCI runner
    * 改造 Pinterest sidecar 打包方案，使其能真实地产出多架构 binary
    * 或改成 universal/mac-specific 新打包路径
* Pros:
  * 最终形态最完整。
  * 迁移完成后平台职责最统一。
* Cons:
  * 不是低成本替代方案。
  * 风险和实现时间都显著高于前两种。

### GitHub Release creation approaches

**Approach R1: 在 CircleCI 中使用 GitHub CLI `gh release create`** (Recommended)

* How it works:
  * 在最终发布 job 中安装 `gh`
  * 使用 `GH_TOKEN` 或 `GITHUB_TOKEN`
  * 执行 `gh release create <tag> <assets...> --verify-tag --notes-file release-notes/v<version>.md`
* Pros:
  * 命令短，维护成本低
  * 原生支持从文件读取 release notes
  * 原生支持同时上传多个 assets
* Cons:
  * 依赖 job 中安装 `gh`

**Selected for current phase**

* 用户已确认接受 `gh release create` 方案。
* release notes 来源固定为 `release-notes/v<version>.md`。

**Approach R2: 在 CircleCI 中直接调用 GitHub REST API**

* How it works:
  * 先调用 Create Release API
  * 再逐个调用 Upload Release Asset API 上传文件
  * release notes 文件内容由脚本读出后传给 API
* Pros:
  * 依赖更少，不需要额外安装 `gh`
  * 行为完全可控
* Cons:
  * 脚本更长
  * 需要自己处理 upload URL、prerelease、重复资产等细节

## Future / Related / Edge Sweep

### Future evolution

* 如果以后加入代码签名、notarization、自动更新元数据生成，CircleCI 配置最好一开始就按 job 拆层，而不是把所有逻辑塞进一个大 job。
* 如果以后要支持 Linux 发布，Windows/macOS 的二进制准备逻辑应尽量抽成可复用 command / script。

### Related scenarios

* 当前 `release.yml` 直接调用 `node ./scripts/update-version.mjs`，迁移 CircleCI 时顺手统一到 `npm run version:set -- <version>`，可以避免发布脚本再次偏离项目约定。
* `release-notes/v<version>.md` 是当前 release gate 的一部分，CircleCI 方案也应保留这个约束，否则会和现有发版纪律脱节。

### Failure & edge cases

* tag 触发时，如果 release notes 缺失，应尽早 fail，而不是等所有构建完成后才失败。
* GitHub Release 发布若遇到同名 asset 已存在、重复发布同一个 tag，需决定是 fail-fast、覆盖，还是改成人工介入。
* macOS Intel 产物缺失时，full parity 发布流程不能静默成功；需要明确是“允许缺一部分发布”还是“必须阻断”。

## Technical Approach

当前更合理的方向是先基于现有 GitHub Actions `release.yml` 做 job 级映射，而不是推翻重写。Windows job 基本可以直接迁到 CircleCI Windows machine。由于 GitHub Actions 不能再参与打包，真正需要先决策的是 macOS 架构策略：如果必须保留 Intel 支持，就需要 CircleCI 之外的非 GitHub Actions 方案或重构 sidecar/runner 策略；如果接受 ARM-first，则可以更快完成 CircleCI MVP。

当前用户已接受 ARM-first，因此 MVP 技术方向收敛为：

* CircleCI Windows job 产出 MSI / NSIS / portable ZIP
* CircleCI macOS Apple Silicon job 产出 ARM DMG
* 不在本轮实现 Intel macOS 产物
* CircleCI 最终发布 job 自动创建 GitHub Release，并把 `release-notes/v<version>.md` 作为 release body

## Decision (ADR-lite)

**Context**: GitHub Actions 配额已耗尽，当前需要让 CircleCI 独立承担打包；同时保留 GitHub Release 作为对外分发渠道，并继续使用仓库中的版本化 release notes 文件。

**Decision**: 当前阶段采用 CircleCI MVP：

* Windows 打包保留现有三类产物：MSI / NSIS / portable ZIP
* macOS 仅产出 Apple Silicon (`aarch64-apple-darwin`) DMG
* `pin-dl` 继续按现有发布流单独 build + smoke test，再随 Tauri 打包
* 最终发布 job 使用 `gh release create` 自动创建 GitHub Release
* release body 直接读取 `release-notes/v<version>.md`

**Consequences**:

* CircleCI 可以独立完成当前阶段所需的打包和发布，不再依赖 GitHub Actions
* Intel macOS 用户在这一阶段不会拿到新产物
* 需要在 CircleCI 中配置 GitHub token，并安装 `gh`
* 需要在 CircleCI 配置中保留 release notes 缺失即失败的 gate

## Out of Scope (explicit)

* 本轮不讨论更换打包框架或放弃 Tauri。
* 本轮不直接引入代码签名、notarization 或 auto-update 发布链。
* 本轮不重新设计 release notes 模板。
* 本轮不处理与发布无关的普通 CI 校验流程。

## Technical Notes

* Inspected files:
  * `.github/workflows/release.yml`
  * `package.json`
  * `scripts/update-version.mjs`
  * `scripts/build-pinterest-sidecar.mjs`
  * `scripts/smoke-pinterest-sidecar.mjs`
  * `scripts/package-portable.ps1`
  * `src-tauri/tauri.conf.json`
* Key local findings:
  * `.circleci/` 不存在，需要新建
  * macOS 现有 Intel 构建依赖真实 Intel 宿主机语义，不能仅靠改 target 参数伪造
  * Windows portable 逻辑已完整封装在 PowerShell 脚本中，适合原样迁移到 CircleCI Windows job
* External references:
  * CircleCI config reference: https://circleci.com/docs/reference/configuration-reference/
  * CircleCI Windows execution environment: https://circleci.com/docs/guides/execution-managed/using-windows/
  * CircleCI macOS execution environment: https://circleci.com/docs/guides/execution-managed/using-macos/
  * Tauri distribute / App Store docs (`universal-apple-darwin`): https://v2.tauri.app/zh-cn/distribute/app-store/
  * Tauri sidecar docs: https://v2.tauri.app/develop/sidecar/
  * GitHub releases API: https://docs.github.com/en/rest/releases/releases
  * GitHub release assets API: https://docs.github.com/en/rest/releases/assets
