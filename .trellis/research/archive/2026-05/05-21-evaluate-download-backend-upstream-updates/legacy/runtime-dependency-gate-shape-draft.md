# Runtime Dependency 类型与 Gate 形态草案

## 目标

将当前关于 `python` 的架构结论收敛为可实现的接口设计：

- `python` 是一级 runtime dependency
- `python` 的来源语义是 `bundled`
- `python` 不是 downloadable managed component
- `yt-dlp` / `gallery-dl` / `douyin-dl` 仍然是基于 bundled Python 初始化的 managed downloader runtime

这份草案聚焦：

1. `RuntimeDependencyStatusSnapshot` 应该长什么样
2. `RuntimeDependencyManagedComponent` 应该保留什么
3. gate 的缺失判定和失败判定应该怎么分层
4. bootstrap 顺序和 activity 语义应该如何调整

## 当前代码现实

当前类型定义：

- [runtimeDependencies.ts](/D:/Ameow/src/types/runtimeDependencies.ts:1)

当前 gate 逻辑：

- [runtimeDependencyGate.ts](/D:/Ameow/src/electron-runtime/runtimeDependencyGate.ts:1)
- [runtimeDependencyGate.mts](/D:/Ameow/electron/runtimeDependencyGate.mts:1)

当前结构特点：

- `RuntimeDependencyStatusSnapshot` 只包含：
  - `ytDlp`
  - `galleryDl`
  - `douyinDl`
  - `ffmpeg`
  - `deno`
- `RuntimeDependencyManagedComponent` 当前也只包含这 5 个
- gate 缺失判定默认把 `expectedSource === "managed"` 的项视为 bootstrap 目标
- bundled 依赖缺失则直接 fail

## 设计结论

### 1. `python` 应新增到状态快照，但不新增到 managed component

推荐：

```ts
type RuntimeDependencyStatusSnapshot = {
  python: RuntimeDependencyStatusEntry;
  ytDlp: RuntimeDependencyStatusEntry;
  galleryDl: RuntimeDependencyStatusEntry;
  douyinDl: RuntimeDependencyStatusEntry;
  ffmpeg: RuntimeDependencyStatusEntry;
  deno: RuntimeDependencyStatusEntry;
};
```

但：

```ts
type RuntimeDependencyManagedComponent =
  | "ytDlp"
  | "galleryDl"
  | "douyinDl"
  | "ffmpeg"
  | "deno";
```

即：

- `python` 是一级依赖
- 但不是可下载 managed component

### 原因

- `source: "bundled" | "managed"` 已经足够表达来源语义
- 如果 Python 随包发放，则它天然是 `bundled`
- 把它强行塞进 `RuntimeDependencyManagedComponent` 会破坏“managed = 可 bootstrap 安装”的语义一致性

## 推荐状态语义

### `python`

推荐状态：

- `expectedSource: "bundled"`
- `source: "bundled"` 当 bundled Python 可解析且可执行
- `state: "missing"` 当 bundled Python 目录不存在、入口文件不存在或执行失败

错误语义：

- 缺 Python 不是“去下载”
- 而是“当前应用安装不完整或损坏”
- 错误文案应偏向：
  - 重新安装应用
  - 安装包损坏
  - 缺失运行时资源

### `yt-dlp` / `gallery-dl` / `douyin-dl`

推荐状态：

- `expectedSource: "managed"`
- `source: "managed"` 当对应 venv entrypoint ready
- `state: "missing"` 当 venv 尚未创建、包未安装或 entrypoint 不存在

它们的 `missing` 仍然是 bootstrap 目标。

## 推荐 gate 分层

### 第一层：bundled prerequisite 校验

先检查所有 bundled prerequisite：

- `python`
- 未来若有其它 bundled-only prerequisite，也同理

若失败：

- gate 直接进入 `failed`
- 不进入 managed bootstrap 流程

### 第二层：managed runtime 缺失收集

只有 bundled prerequisite 全部通过后，才开始收集：

- `ytDlp`
- `galleryDl`
- `douyinDl`
- `ffmpeg`
- `deno`

并进入：

- `idle`
- `downloading`
- `ready`

等 managed 语义阶段

## 建议修改点

### `src/types/runtimeDependencies.ts`

建议：

- 为 `RuntimeDependencyStatusSnapshot` 新增 `python`
- 保持 `RuntimeDependencyManagedComponent` 不含 `python`
- `RuntimeDependencyGateStatePayload.currentComponent / nextComponent` 继续只接受 managed component

### 设计含义

这会让 UI / 日志上的含义更准确：

- `python` 会出现在状态里
- 但不会出现在“当前正在下载哪个 managed component”的字段里

这是合理的，因为 bundled Python 不应被建模为下载中组件。

## `missingComponents` 的建议语义

当前 `missingComponents` 更像“待 bootstrap 的 managed 组件列表”。

因此建议保持这个语义，不要把 `python` 塞进去。

也就是说：

- `missingComponents` = downloader / ffmpeg / deno 等 managed 缺项
- `python` 若失败，体现在：
  - `phase: "failed"`
  - `lastError`
  - `statusSnapshot.python`

而不是出现在 `missingComponents`

## `bundledFailureErrorFrom(...)` / `syncRuntimeDependencyGateStateFromSnapshot(...)`

当前本地 resolver 已有一条 bundled failure 分支：

- [runtimeDependencyGate.ts](/D:/Ameow/src/electron-runtime/runtimeDependencyGate.ts:43)

建议扩展为：

1. 先检查 `python`
2. 再检查其它 bundled-only 依赖
3. 若存在 bundled failure：
   - `phase = "failed"`
   - `lastError = python.error ?? "Missing bundled Python runtime"`

这样在 Python 缺失时，gate 不会误导为“准备安装 yt-dlp”

## `collectMissingManagedRuntimeComponents(...)`

建议：

- 保持只收集 managed 缺项
- 不收集 `python`

这样：

- bootstrap 顺序仍只围绕真正需要安装的组件
- 不会出现一个“不可下载但被当作待下载项”的异常类型

## `MANAGED_RUNTIME_BOOTSTRAP_ORDER`

建议保持：

```ts
[
  "ytDlp",
  "galleryDl",
  "douyinDl",
  "ffmpeg",
  "deno",
]
```

不要加入 `python`

原因：

- Python 不是 managed download target
- Python 的检查应发生在 bootstrap 序列之前

## `ManagedRuntimeBootstrapOptions` 的变化建议

目前 bootstrap options 只表达 managed runtime 初始化需要的环境。

在新模型里，建议新增：

```ts
bundledPythonPath?: string;
bundledPythonRoot?: string;
```

用途：

- `ensureManagedYtDlpRuntimeReady(...)`
- `ensureManagedGalleryDlRuntimeReady(...)`
- `ensureManagedDouyinDlRuntimeReady(...)`

都不再自己探测系统 Python，而是统一使用 gate/paths 层已解析好的 bundled Python。

### 原则

- bundled Python 路径应在 status/path 层只解析一次
- managed downloader 安装器不要再次各自实现一套 Python 探测逻辑
- 该路径指向 app resources 内的 direct-use Python runtime，而不是 configDir 内复制品

## `RuntimeDependencyStatusEntry` 是否需要扩展

当前字段：

- `state`
- `source`
- `expectedSource`
- `fallbackSource`
- `path`
- `fallbackPath`
- `error`

对 Python 来说已经基本够用。

如果未来需要更强表达，可以考虑扩展可选字段，例如：

- `kind?: "bundled_prerequisite" | "managed_runtime"`

但当前阶段不建议先加。

原因：

- 现有 `source + expectedSource` 已足够表达
- 过早引入更多判别字段只会增加迁移复杂度

## UI / 状态文案建议

### Python ready

- `Bundled Python runtime is ready`

### Python missing / invalid

- `Bundled Python runtime is missing or invalid`
- `Please reinstall Ameow`

### Downloader missing

- `Preparing yt-dlp runtime`
- `Preparing gallery-dl runtime`
- `Preparing douyin-dl runtime`

这三类文案应该明显区分：

- bundled prerequisite failure
- managed downloader bootstrap

## 启动后自动预热的 gate 语义

推荐增加一个明确约束：

- 启动后自动预热只负责 managed downloader runtime
- 预热集合由“当前用户配置里已启用的 downloader”决定
- 不把 `douyin-dl` 的 Playwright / Chromium browser support 纳入 gate 的默认 bootstrap 范围

原因：

- Python downloader package runtime 与浏览器资产不是同一层依赖
- 如果把浏览器资产也塞进 gate，启动后预热会变成不可控的大下载
- 由配置驱动预热集合，比硬编码“永远 3 个全装”或“只装常用两个”更干净，也更可扩展

## 并发模型建议

- gate 仍然可以保留“整轮 bootstrap promise”
- 但 downloader 级 bootstrap 必须再有 per-component promise/lock

因为可能同时发生：

- gate 自动预热
- 用户手动下载触发该 downloader ensure
- 版本面板/状态刷新触发 ensure 或 verify

如果没有 per-component lock，单靠 gate 层 promise 不足以阻止同一路径上的并发 `venv` 创建和 `pip install`。

## 推荐的长期边界

推荐长期采用：

- 启动后预热当前已启用 downloader
- 未启用 downloader 维持 lazy-init
- 一旦用户在会话中启用某个此前未启用 downloader，由首次真实使用触发 ensure

这样能同时满足：

- 第一次真实下载尽量不等待 Python 环境部署
- 不为明显不会使用的 downloader 支付启动期成本
- 避免把“常用 downloader 子集”硬编码进架构

## 推荐实现顺序

1. 先改 `RuntimeDependencyStatusSnapshot`
2. 再改 `inspectRuntimeDependencyStatus()` 增加 `python`
3. 再改 bundled failure 分支
4. 再把 bundled Python 路径注入 `ManagedRuntimeBootstrapOptions`
5. 最后再迁移 `yt-dlp` / `gallery-dl` / `douyin-dl` 到 shared bundled Python

## 最终建议

推荐的 gate 形态是：

- `python`：
  - 一级 runtime dependency
  - `source = bundled`
  - 不属于 `RuntimeDependencyManagedComponent`
  - 不进入 managed bootstrap 列表
- `yt-dlp` / `gallery-dl` / `douyin-dl`：
  - `source = managed`
  - 依赖 bundled Python
  - 进入 managed bootstrap 列表

这是当前类型系统下最干净、最少特殊分支、也最符合真实来源语义的方案。
