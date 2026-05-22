# Python Runtime 分发决策文档

## 目标

为 Ameow 的统一下载器重构确定 **Python runtime 的分发与部署模型**，使 `yt-dlp`、`gallery-dl`、`douyin-dl` 可以在 Windows / macOS 上共享同一套长期方案，而不依赖用户预装 Python。

## 结论

推荐采用：

- **将 relocatable CPython runtime 随应用产物一起分发**
- 推荐来源：`python-build-standalone`
- 两个平台统一：
  - Windows installer
  - Windows portable zip
  - macOS zip
- 将 `python` 建模为：
  - **一级 runtime dependency**
  - **bundled prerequisite**
  - 而不是 downloadable managed component
- 运行时只负责：
  - 解析 bundled Python
  - 校验 bundled Python
  - 基于该 Python 创建各 downloader 独立 venv
  - 安装各 downloader 的 pinned package
- bundled Python 直接从应用资源目录使用
- 不先复制/镜像一份 CPython 到用户配置目录

不推荐：

- 依赖用户系统 Python
- Windows 使用官方 embeddable Python 作为长期安装基座
- 首次启动或首次下载时再在线下载 Python runtime
- Windows 和 macOS 长期采用不同的 Python 分发策略

## 设计目标

本次决策优先满足以下目标：

1. 用户第一次真正发起下载时，不应再等待 Python runtime 下载。
2. Windows / macOS 的长期部署模型应尽可能统一。
3. 不依赖管理员权限，不污染系统 Python / 注册表 / PATH。
4. 能支持 `venv + pip install`，适配 `yt-dlp`、`gallery-dl`、`douyin-dl`。
5. 不留下新旧下载器分发方案长期并存的技术债。

## 当前仓库事实

### 当前打包形态

- Windows 安装包：`NSIS`
- Windows 便携版：基于 `win-unpacked` 再封装 `portable zip`
- macOS：当前产物是 `zip`

相关文件：

- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:63)
- [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:76)
- [package.json](/D:/Ameow/package.json:37)
- [package-portable.ps1](/D:/Ameow/scripts/package-portable.ps1:73)

### 当前下载器运行时形态

- Electron 路径下，`yt-dlp` / `gallery-dl` / `douyin-dl` 已经都被当作 `managed runtime`
- 只是 managed 的具体实现仍然不统一：
  - `yt-dlp`：mac 偏 Python runtime，win 偏 release binary
  - `gallery-dl`：当前偏 release/build binary
  - `douyin-dl`：当前已是 Python package

相关文件：

- [runtimePaths.ts](/D:/Ameow/src/electron-runtime/runtimePaths.ts:99)
- [managedRuntimeBootstrap.mts](/D:/Ameow/electron/managedRuntimeBootstrap.mts:1034)

## 候选方案比较

### 方案 A：随应用产物分发 relocatable Python runtime

做法：

- 打包阶段下载并整理目标平台的 Python runtime
- 将 Python runtime 放入应用资源目录
- 应用运行时直接解析 bundled Python 路径

优点：

- 用户首次下载无需再等待 Python runtime 下载
- 不依赖用户系统 Python
- 不需要管理员权限
- Win/mac 可以统一成同一种长期模型
- 有利于彻底移除旧的 downloader binary 路线

缺点：

- 安装包体积增加
- CI / 打包链路要新增 Python runtime 准备步骤
- 需要维护 Python runtime 自身版本更新

结论：

- **推荐**

### 方案 B：首次启动或首次下载时在线下载 Python runtime

做法：

- 应用产物中不包含 Python
- 启动后或首次下载前由 runtime gate 在线下载安装 Python

优点：

- 初始包体积更小
- 打包过程更简单

缺点：

- 用户首次使用下载功能时体验变差
- 网络失败会直接阻断下载器初始化
- 需要额外处理下载进度、超时、镜像、断点、错误恢复
- 会把 Python runtime 的供应链复杂度转移到运行期

结论：

- **不推荐**

### 方案 C：Windows 与 macOS 使用不同分发策略

例如：

- Windows 便携版带 Python
- Windows 安装包不带 Python
- macOS 再单独处理

优点：

- 可以对不同打包场景做局部优化

缺点：

- 会引入多条长期代码路径
- 测试矩阵翻倍
- 用户问题排查复杂度显著上升
- 不符合本次重构“走向单一长期方案”的目标

结论：

- **不推荐**

## 为什么推荐 `python-build-standalone`

我们需要的不是“某种能运行 Python 的东西”，而是一个满足以下条件的分发源：

- 可重定位
- 可随包分发
- 支持 `venv`
- 支持 `pip`
- 不依赖系统安装器
- 不需要管理员权限

基于已做的资料核对和 Claude 讨论，`python-build-standalone` 最符合这组要求。

相比之下：

- Windows 官方 embeddable Python：
  - 不适合作为常规 `venv + pip` 基座
  - 官方文档也不建议这样用
- `python.org` 完整安装器：
  - 更偏系统安装
  - 会引入管理员权限、系统副作用和卸载项等问题

因此，`python-build-standalone` 更适合作为桌面应用私有运行时。

## 推荐部署模型

### 打包阶段

为每个目标平台准备并放入应用资源目录：

```text
desktop-assets/binaries/python-<target>/**
```

目标示例：

- `x86_64-pc-windows-msvc`
- `aarch64-apple-darwin`
- `x86_64-apple-darwin`

### 运行阶段

应用解析 bundled Python runtime，例如：

```text
resources/binaries/python-<target>/...
```

然后在用户配置目录下创建 downloader 独立虚拟环境：

```text
<configDir>/runtimes/yt-dlp/<target>/venv
<configDir>/runtimes/gallery-dl/<target>/venv
<configDir>/runtimes/douyin-dl/<target>/venv
```

### 统一边界

- 共享：Python 解释器 runtime
- 隔离：每个 downloader 的 venv 与依赖
- Python 本体是 bundled asset
- venv 是 configDir 内可重建状态

这比共享一个大 venv 更稳，也比每个 downloader 都带一份 Python 更省空间。

### 为什么不复制 Python 到 configDir

不推荐先把 bundled Python 整体复制到 `<configDir>/runtimes/python/...` 再使用，原因是：

- 会增加首次启动 I/O 成本
- 会把“随包发放”的优势重新变成“首次运行部署”
- 会制造两份 Python 来源语义：
  - app resources 里的真正 bundled runtime
  - configDir 里的复制品
- 后续排障时更难判断用户当前到底在用哪一份 Python

因此推荐的长期方案是：

- Python 本体直接从 app resources 使用
- 只把每个 downloader 的 venv 与 metadata 放在 configDir

## 对现有构建链路的影响

### electron-builder

当前 [electron-builder.config.mjs](/D:/Ameow/electron-builder.config.mjs:49) 的 `files` 是显式白名单，这意味着：

- 需要把 Python runtime 目录显式纳入打包列表
- 当前空的 `packagedBinaryPatterns()` 是很合适的挂载点

### Windows portable

当前 portable 包是从 `win-unpacked` 二次压缩生成的：

- 只要 Python runtime 已进入 `win-unpacked`
- 它就会自然进入 portable zip

因此 portable 不需要单独维护第二套 Python 分发逻辑。

### macOS zip

当前 mac 也是 `zip` 打包，而不是依赖在线安装器：

- 只要将 Python runtime 放入打包资源
- 它同样可以随 `.app` 一起进入 mac zip

所以 mac 平台并不存在“只能运行时下载 Python”的前提限制。

## 对 runtime gate 的影响

### 推荐策略

- `python` 立刻成为一等 runtime dependency
- 但语义上属于 bundled prerequisite
- Python runtime 本体随包提供
- 启动后 gate 自动处理的对象，不再是“下载 Python”
- 而是：
  - 校验 bundled Python 是否存在且可执行
  - 创建 downloader venv
  - 安装 / 校验 downloader pinned package

### 用户体验

这意味着：

- 用户第一次下载不会等 Python runtime 下载
- 但第一次启动后，仍可能经历 downloader venv 初始化
- 这比“首次下载再下载 Python + 建 venv + 装包”要好得多

进一步建议：

- 在主窗口可见后自动进行 downloader venv 预热
- 预热对象由当前用户配置中已启用的 downloader 决定
- 但不要把 `douyin-dl` 的 Playwright / Chromium 浏览器支持纳入这一步
- 浏览器支持继续按需安装，否则启动期代价会过大

## 对“fallback”的决策影响

如果采用本方案，长期目标应当是：

- 不再保留旧的 downloader standalone binary 路线作为架构一部分
- `yt-dlp` / `gallery-dl` / `douyin-dl` 全部统一到 bundled Python + per-tool venv

也就是说：

- 迁移过程中允许中间状态
- 但迁移完成后，不应再保留：
  - `gdl-org/builds` 作为长期 gallery-dl 主路径
  - Windows `yt-dlp` release binary 作为长期主路径
  - 依赖系统 Python 作为长期主路径

保留 fallback 的唯一合理理由只能是：

- 在验证阶段短暂降低发布风险

而不应让 fallback 成为长期产品形态。

## 风险与代价

### 主要代价

- 应用包体积增加
- 打包流程更复杂
- Python runtime 本身也需要版本维护

### 主要收益

- 用户体验更稳定
- 运行时可预期性更强
- Win/mac 架构统一
- 更利于这次重构一次性统一 3 个下载器
- 更符合“长期方案而非补丁式兼容”的目标

## 最终建议

本次重构的 Python runtime 分发决策建议为：

1. 采用 **bundled relocatable CPython runtime**。
2. 推荐来源为 **`python-build-standalone`**。
3. Windows / macOS 两个平台统一采用“随包分发 Python runtime”。
4. `python` 立即成为一等 runtime dependency，但语义上属于 **bundled prerequisite**。
5. `yt-dlp`、`gallery-dl`、`douyin-dl` 最终统一到：

```text
bundled Python runtime + per-tool isolated venv
```

6. 不将旧 downloader binary 路线保留为长期架构。

## 后续需要单独落地的技术问题

- Python runtime 的具体版本号与更新策略
- `python-build-standalone` 各 target 的资产选择
- mac 打包资源目录的具体路径解析实现
- 旧 `managedYtDlpRuntime` metadata 的迁移策略
- 运行时状态面板如何展示 `python` 与各 downloader venv 的状态
- app 更新后如何判定既有 venv 需要重建
- 旧 runtime 目录布局的清理策略
