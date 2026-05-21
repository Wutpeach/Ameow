# Bundled Python Runtime 构建接入草案

## 目标

在不改动最终架构目标的前提下，定义 **bundled Python runtime 如何接入当前 Ameow 的 Electron 构建、打包、资源布局和运行时路径解析体系**。

这份草案只回答两个问题：

1. Python runtime 在仓库和打包产物里应该放在哪。
2. 应用运行时应该如何在开发环境 / 安装包 / 便携包 / mac zip 中解析它。

## 当前构建现实

### electron-builder

当前配置：

- `asar: false`
- `files` 是显式白名单
- `packagedBinaryPatterns()` 目前为空

相关文件：

- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:45)
- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:49)

这意味着：

- 任何新的 Python runtime 文件都不能“自动进包”
- 必须显式加入 `files` 白名单

### Windows portable

当前 portable 是从 `win-unpacked` 目录复制后压缩得到：

- [package-portable.ps1](/D:/Ameow/scripts/package-portable.ps1:73)

这意味着：

- 只要 Python runtime 进入 `win-unpacked`
- 它就会自动进入 portable zip

### macOS

当前 mac 打包目标是 `zip`：

- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:76)

这意味着：

- Python runtime 同样可以作为普通资源进入 `.app`
- 不需要额外的在线安装机制

## 推荐资源布局

### 仓库内布局

推荐在仓库内使用：

```text
desktop-assets/
  binaries/
    python-x86_64-pc-windows-msvc/
    python-aarch64-apple-darwin/
    python-x86_64-apple-darwin/
```

原因：

- 与现有 `desktop-assets/binaries` 约定一致
- 更容易通过 `packagedBinaryPatterns()` 统一进包
- 也方便 dev / package / portable 共用同一套资产准备脚本

### 包内布局

推荐保持和仓库相同的相对语义：

```text
binaries/python-<target>/**
```

不要单独放在奇怪的根目录，例如：

- `resources/python/`
- `resources/runtime-python/`

保持和现有 binaries 体系一致更利于路径解析与调试。

## 推荐构建步骤

### 新增脚本

建议新增：

```text
scripts/ensure-python-runtime.mjs
```

职责：

- 根据目标平台/架构解析 `target`
- 检查本地是否已存在 `desktop-assets/binaries/python-<target>/`
- 若不存在或版本不匹配：
  - 下载 `python-build-standalone`
  - 解压到目标目录
  - 写入 manifest / metadata
- 对 Python runtime 做最小 smoke check

### 建议配套脚本

可选新增：

```text
scripts/smoke-python-runtime.mjs
```

用于：

- 本地验证 Python runtime 可执行
- 验证 `venv` / `ensurepip` / `pip --version`

## build pipeline 接入点

### 方案

将 Python runtime 准备接入与现有 downloader ensure 流程相同的阶段：

- dev 前置
- build 前置
- package 前置

### 推荐接法

#### 1. 新增 npm scripts

例如：

```json
"runtime:ensure:python": "node ./scripts/ensure-python-runtime.mjs",
"runtime:smoke:python": "node ./scripts/smoke-python-runtime.mjs"
```

#### 2. 在 preflight / package 流程中调用

优先考虑接入：

- `scripts/dev-preflight.mjs`
- `package`
- `package:win`
- `package:mac:zip`
- `package:win:dir`

目标是：

- 所有可能产出可运行桌面包的路径，都确保 Python runtime 已准备好

#### 3. 使用 `packagedBinaryPatterns()` 进包

将当前空实现：

- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:27)

改为返回 Python runtime 对应路径模式，例如：

```text
desktop-assets/binaries/python-<target>/**/*
```

这样：

- Windows installer 会带上它
- `win-unpacked` 会带上它
- portable zip 会自然继承它
- mac zip 会带上它

## 运行时路径解析草案

### 设计原则

Python runtime 与当前 downloader binaries 不完全一样：

- downloader binary 是单个入口文件
- Python runtime 是一个目录树

所以路径解析要从“文件候选”改成“目录候选 + 入口文件”。

并且这里采用 **direct-use model**：

- 运行时直接解析 app resources 内的 bundled Python 目录
- 不先复制整套 Python 到 configDir
- configDir 只负责 downloader venv 与 metadata

### 建议新增 helper

建议新增文件：

```text
src/electron-runtime/pythonRuntimePaths.ts
```

或直接在 `runtimePaths.ts` 中新增 helper：

- `resolveBundledPythonRootCandidates(...)`
- `resolveBundledPythonRoot(...)`
- `resolveBundledPythonExecutable(...)`

### 候选路径顺序

建议和现有 binaries 思路保持一致：

#### 开发环境

```text
<repoRoot>/desktop-assets/binaries/python-<target>/
```

#### 打包资源目录

```text
<resourceDir>/binaries/python-<target>/
```

#### 便携/可执行目录 fallback

```text
<executableDir>/binaries/python-<target>/
```

### 可执行入口解析

建议不要把入口名硬编码在多个位置，而是集中封装：

- Windows:
  - `python.exe`
- macOS:
  - `bin/python3`
  - 或 runtime 所定义的统一入口

这部分要根据最终选用的 `python-build-standalone` 目录结构做一次实测后定稿。

### venv 创建模式

建议将 venv 创建模式也封装在 Python runtime helper 中：

- Windows: 默认 `python -m venv`
- macOS: 默认 `python -m venv`

注意：

- 早期草案曾考虑 macOS 使用 `--copies` 来规避 app relocation 后的 symlink 失效。
- GitHub Actions macOS arm64/x64 实测显示，python-build-standalone 的 macOS runtime 被复制出原 bundled tree 后会在 venv 内部 `ensurepip` 阶段 `SIGABRT`。
- 最终策略改为 macOS 使用默认 symlink venv，并在 downloader venv metadata 中记录 `bundledPythonPath`；app 移动或升级后路径变化会触发 venv 重建。

## 推荐 manifest 机制

### 为什么需要 manifest

当前 downloader binaries 已经有：

- `.official-downloader-binaries.json`

Python runtime 同样建议有独立 manifest，例如：

```text
desktop-assets/binaries/.official-python-runtimes.json
```

记录内容建议包括：

- `target`
- Python version
- source URL
- source type
- extracted root path
- downloadedAt
- checksum

### 作用

- dev / CI / package 可校验 provenance
- 避免手动塞一个同名目录就被误判为 ready
- 后续便于版本升级与排错

## smoke check 建议

### 最低检查项

必须验证：

- `python --version`
- `python -m venv <tmp>`
- `<tmp>/python -m pip --version`
- `python -c "import sqlite3; import ssl; print('ok')"`

如果连这三步都过不了，这个 Python runtime 就不能作为 3 个 downloader 的基础设施。

### 可选检查项

可加：

- `python -c "import sys; print(sys.executable)"`
- `python -m ensurepip --version`（若需要）

## 对 runtime gate 的直接影响

如果 Python runtime 随包发放，则 gate 对 `python` 的职责应重新定义为：

- 检查 bundled Python 是否存在
- 检查 Python 是否可执行
- 检查其版本是否符合当前 pinned 要求

而不是在线下载 Python。

这意味着：

- `python` component 会更像 “bundled prerequisite”
- 而 `yt-dlp` / `gallery-dl` / `douyin-dl` 仍然是 “managed installed packages”

这是一个很重要的语义区别，后续状态文案和错误提示需要和它一致。

## 推荐的责任分层

### 打包期负责

- 下载 Python runtime
- 校验与解压
- 放入 `desktop-assets/binaries/python-<target>`
- 通过 `electron-builder` 带入产物

### 运行期负责

- 定位 bundled Python runtime
- 基于它创建 downloader-specific venv
- 安装 / 校验各 downloader package

这个边界清晰，且与“用户第一次下载时不应再等待 Python runtime 下载”的目标一致。

## 不推荐的接法

### 不推荐：把 Python runtime 放进用户数据目录再作为主来源

原因：

- 这会把“随包发放”的优势抹掉
- 首次运行仍需要复制大体积 runtime
- 路径和来源语义会变混乱

### 不推荐：在运行期直接解压线上 Python 压缩包

原因：

- 会把 build-time complexity 转嫁到 run-time
- 破坏用户首次使用体验

### 不推荐：为 Windows installer / portable / mac 各做不同路径约定

原因：

- 长期维护成本过高
- 不符合本次重构的统一目标

## 最终建议

推荐的 build integration 方案是：

1. 在 `desktop-assets/binaries/python-<target>/` 维护 Python runtime 目录树。
2. 新增 `scripts/ensure-python-runtime.mjs` 负责准备它。
3. 用 `packagedBinaryPatterns()` 将 Python runtime 纳入 Electron 产物。
4. 运行期从 `repoRoot/resources/executableDir` 的统一候选路径解析 bundled Python。
5. 运行期不再负责下载 Python，只负责基于 bundled Python 初始化各 downloader venv。

## 运行期补充要求

### per-tool 并发锁

需要为每个 downloader 的 bootstrap 建立独立 promise/lock，避免以下竞态：

- 启动后自动预热正在创建 venv
- 用户同时发起第一次下载
- 设置页或版本面板同时触发 runtime 检查

如果没有 per-tool 锁，仅靠 `existsSync()` 判断会出现并发 `pip install` 与目录状态冲突。

### 旧 runtime 布局清理

重构落地后，需要识别并处理旧布局残留，例如：

- `yt-dlp/<target>/real/...`
- `gallery-dl/<target>/real/...`
- 基于系统 Python 构建的旧 `douyin-dl` venv

推荐策略：

- 识别为 stale layout
- 自动清理后按新布局重建

原因是这些 runtime 都是可重建状态，不值得做复杂迁移。

## 下一步需要单独确定的实现细节

- `python-build-standalone` 的具体 target 资产命名与目录结构
- Python runtime metadata / manifest 的格式
- `runtimePaths.ts` 是否拆出独立 `pythonRuntimePaths.ts`
