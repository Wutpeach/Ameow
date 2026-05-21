# 下载器统一 Python Runtime 实现草案

## 目标

为 `yt-dlp`、`gallery-dl`、`douyin-dl` 建立统一的应用自管 Python runtime 部署模型，在不依赖用户预装 Python 的前提下，让稳定版下载器更新策略在 macOS / Windows 上都成立。

## 目标架构

### 统一原则

- 统一的是 **Ameow 自管的 Python 解释器 runtime**。
- 不统一为单个共享虚拟环境。
- 每个下载器保留独立虚拟环境与独立 pinned 依赖。

### 目录结构

```text
<configDir>/
  runtimes/
    yt-dlp/
      <target>/
        venv/
        metadata.json
    gallery-dl/
      <target>/
        venv/
        metadata.json
    douyin-dl/
      <target>/
        venv/
        metadata.json
    ffmpeg/
      <target>/
    deno/
      <target>/
```

```text
<app resources>/
  binaries/
    python-<target>/
      ...
```

说明：

- bundled Python 本体驻留在应用资源目录中，直接从该位置使用。
- 不再复制整套 CPython 到 `<configDir>/runtimes/python/...`。
- `<configDir>/runtimes/` 只承载每个 downloader 的 venv、metadata 与可重建状态。

### 组件分层

- `python`: 新增 shared bundled prerequisite runtime。
- `yt-dlp` / `gallery-dl` / `douyin-dl`: 基于 shared Python 创建独立 venv，并安装各自 pinned 包版本。
- `ffmpeg` / `deno`: 继续沿用现有 managed binary/bootstrap 模式。

## 版本策略

### 统一 Python 主版本

- 建议统一到 `Python 3.11.x`。
- 原因：
  - 满足当前 `yt-dlp` 的 Python `3.10+` 约束。
  - 满足当前 `gallery-dl` / `douyin-dl` 的 `3.8+` 约束。
  - 版本成熟，兼容余量足，比追最新主版本风险更低。

### 下载器版本策略

- `yt-dlp`: 优先 stable Python package。
- `gallery-dl`: 优先 stable Python package。
- `douyin-dl`: 继续 pinned Git source，直到上游形成清晰稳定发布节奏。

## 平台方案

### macOS

- 目标：完全切到 app-managed Python runtime。
- 不再依赖系统 Python 作为 steady-state。
- 安装路径：
  - app resources 内 bundled `binaries/python-<target>`
  - 使用该 Python 创建各 downloader venv
- 好处：
  - 去掉“用户机器 Python 版本差异”变量
  - 更契合 stable-first 目标
  - 与 Windows 形成统一部署模型

### Windows

- 目标：同样切到 app-managed Python runtime。
- 不建议长期依赖用户本机 Python。
- 不建议把官方 embeddable ZIP 直接作为长期 pip 安装基座。
- 更适合的 steady-state 是：
  - Ameow 管理一个可运行、可建 venv、可装 pip 包的私有 Python runtime
  - 再在其上创建每个 downloader 的 venv
- 该 Python 同样直接从 app resources 使用，而不是先镜像到 configDir。

## Runtime Gate 集成

### 原则

- 不在 app bootstart 阶段在线安装 Python runtime。
- Python runtime 随包分发，gate 负责校验 bundled Python 是否存在且可执行。
- 仍然通过现有 runtime dependency gate 进行缺失检测和延迟 bootstrap。
- 只在主窗口可见后、且确实缺 downloader 依赖时才开始初始化 downloader venv 与安装包。
- 启动后自动预热的目标，是让第一次真实下载不再等待 Python runtime 的部署。

### Gate 顺序建议

```text
bundled python validation
  -> yt-dlp
  -> gallery-dl
  -> douyin-dl
  -> ffmpeg
  -> deno
```

说明：

- `python` 是 bundled prerequisite，不进入 downloadable managed bootstrap 顺序。
- `yt-dlp` / `gallery-dl` / `douyin-dl` 的 managed 初始化依赖 bundled Python 已通过校验。
- `ffmpeg` / `deno` 仍属于后续能力依赖，不强绑定于 Python bootstrap。

### 预热边界

- 启动后自动预热的范围是：
  - 校验 bundled Python
  - 为**当前用户配置中已启用的 downloader**创建/校验各自 venv
  - 为这些已启用 downloader 安装各自 pinned package
- 启动后自动预热不包括：
  - `douyin-dl` 的 Playwright / Chromium browser support 下载
- `douyin-dl` 浏览器能力继续保持按需补装，否则启动期预热会被放大成浏览器资产下载。
- 未启用的 downloader 不在启动期预热，而是在首次真正启用/使用时走同一套 per-tool ensure 路径。
- 如果默认设置里 3 个 downloader 都启用，则首次安装时会表现为全量预热；这是配置驱动结果，而不是硬编码策略。

## 代码改造草案

### 1. 类型与 gate 状态

涉及文件：

- `src/types/runtimeDependencies.ts`
- `src/electron-runtime/runtimeDependencyGate.ts`
- `electron/runtimeDependencyGate.mts`

改动：

- 扩展 status snapshot:
  - `python: RuntimeDependencyStatusEntry`
- `python.expectedSource = "bundled"`
- gate 失败判定增加 `python`
- 不将 `python` 加入 `RuntimeDependencyManagedComponent`
- 不将 `python` 放入 managed bootstrap 顺序

### 2. 运行时路径解析

涉及文件：

- `src/electron-runtime/runtimePaths.ts`
- `src/electron-runtime/contracts.ts`

改动：

- 新增 `managedPythonPathFor(...)`
- 为 Python downloader 保留：
  - shared python root
  - downloader-specific venv python
  - downloader-specific entrypoint
- `gallery-dl` / `douyin-dl` / `yt-dlp` 的 runtime path 不再混用二进制与 venv 语义
- bundled Python 路径解析沿用 `repoRoot/resourceDir/executableDir` 多候选策略
- Python 本体始终从 bundled 目录直接解析，不再以 configDir 镜像为主来源

### 3. Python runtime 集成

建议新增文件：

- `electron/managedPythonRuntime.mts`

职责：

- 解析当前 target
- 定位 bundled `Python 3.11.x`
- 校验 bundled Python 可执行性
- 必要时提供 lightweight metadata / marker，记录当前 bundled Python 版本与 target
- 暴露：
  - `resolveBundledPythonRuntime(...)`
  - `validateBundledPythonRuntime(...)`
  - `getManagedPythonRuntimeInfo(...)`
  - `managedPythonMinimumVersion()`
  - `managedPythonPaths(...)`

### 4. 通用 Python package 安装器

涉及文件：

- `electron/managedRuntimeBootstrap.mts`

改动方向：

- 将现有 `ensureManagedPythonPackageReady(...)` 从 `douyin-dl` 专用逻辑抽象成通用安装器
- 支持参数化：
  - component id
  - package source / pinned version
  - entrypoint name
  - minimum python version
  - metadata schema
  - `venv` 创建模式（macOS 使用默认 symlink venv，避免 `--copies` 破坏 python-build-standalone 的 bundled runtime layout）
- downloader 安装逻辑改为：
  - 先校验 bundled Python ready
  - 再基于 shared Python 创建该 downloader 的 venv
  - 再安装 pinned package

### 4.1 并发控制

- 每个 downloader runtime 需要独立的 bootstrap promise / lock。
- 目标是避免：
  - 启动期自动预热
  - 用户手动触发第一次下载
  - 设置页主动刷新状态
  在同一组件上并发执行 `venv` 创建或 `pip install`。
- gate 级 promise 只能保证“整轮 bootstrap”不重入，不能代替 per-component lock。
- 真实下载触发的 lazy ensure 与启动期 prewarm 必须汇聚到同一把 per-tool lock 上。
- 这样用户若在预热未完成时立即发起下载，请求会 join in-flight 初始化，而不是并发创建第二份 venv。

### 5. yt-dlp / gallery-dl 迁移

#### yt-dlp

- mac 当前 `managedYtDlpRuntime.mts` 的逻辑可以折叠到通用 Python package 安装器
- Windows 从当前 `managed_release` 迁到 `managed_python_package`

#### gallery-dl

- 从当前 `managed_release` 迁到 `managed_python_package`
- 版本先定 stable `1.32.1`

#### douyin-dl

- 继续 Python package 安装
- 改为依赖 bundled shared Python，而不是“各自探测系统 Python”
- 浏览器支持能力继续拆开，保持懒加载

### 6. 版本信息与设置页状态

涉及文件：

- `electron/downloaderVersionInfo.mts`

改动：

- `gallery-dl` 支持 `managed_python_package`
- `yt-dlp` Windows 也支持 `managed_python_package`
- 新增 Python runtime 状态与错误原因暴露：
  - Python bundled runtime 缺失
  - Python bundled runtime 不可执行
  - downloader venv install failed
  - stale runtime layout cleaned / rebuild triggered（如需内部诊断）

## 迁移阶段

### Phase 1

- 新增 `python` bundled prerequisite runtime 组件
- 先打通 bundled Python 的 direct-use 模型
- 定义 per-tool lock、stale runtime cleanup 与 metadata 版本标记

### Phase 2

- 将 `gallery-dl` 迁到 stable-first Python package
- Windows / macOS 都走 shared Python + venv

### Phase 3

- 将 `yt-dlp` Windows 迁到 shared Python + venv
- 合并 mac `yt-dlp` 旧逻辑到统一通用安装器

### Phase 4

- 将 `douyin-dl` 切到 shared Python
- 移除它对系统 Python 的直接探测依赖

### Phase 5

- 清理旧 downloader binary/bootstrap 旧路径
- 清理旧 runtime 目录布局
- 删除长期 fallback 路线

## 风险

### 高风险

- Windows 私有 Python runtime 的来源与布局选择
- 安装包体积 / 首次 bootstrap 时间增加
- Python runtime 供应链与 checksum 管理复杂度提高
- app 更新后 venv 是否需要自动重建的判定逻辑
- downloader 启动期预热与真实下载请求的并发竞争

### 中风险

- 现有 `yt-dlp` / `gallery-dl` 版本信息面板需要重构
- gate 活动状态需要区分“校验 bundled Python”和“安装 downloader”
- 旧 runtime 目录自动清理/重建的策略需要谨慎设计

### 低风险

- downloader-specific venv 隔离能降低相互污染
- 现有 `ffmpeg` / `deno` 路线可基本不动

## 推荐落地顺序

1. 先做 `python` bundled prerequisite + direct-use 组件抽象。
2. 再做通用 Python package 安装器与 per-tool lock。
3. 再统一 `gallery-dl`、`yt-dlp`、`douyin-dl` 的 venv bootstrap。
4. 最后再收口旧路径清理与 fallback 删除。
