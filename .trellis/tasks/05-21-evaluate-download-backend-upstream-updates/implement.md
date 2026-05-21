# 下载器统一 Python Runtime 实施清单

## 目标

产出一条可分阶段落地的迁移路线，把 Python 型下载器逐步统一到 shared bundled Python runtime + per-tool venv。

## 阶段 0：研究与前置决策

- [x] 确认 shared Python runtime 的分发来源与 target 列表
- [x] 确认 `Python 3.11.x` 作为统一版本
- [x] 确认 `gallery-dl` 第一阶段目标版本为 `1.32.1`
- [x] 确认 bundled Python 采用 direct-use model，而不是 copy-to-config model
- [x] 确认旧 downloader fallback 只作为短期验证工具，而不是长期架构

## 阶段 1：引入 Python bundled prerequisite 组件

涉及文件：

- `src/types/runtimeDependencies.ts`
- `src/electron-runtime/runtimePaths.ts`
- `src/electron-runtime/runtimeDependencyGate.ts`
- `electron/runtimeDependencyGate.mts`
- `electron/managedRuntimeBootstrap.mts`

步骤：

- [x] 在 runtime dependency 类型中新增 `python`
- [x] 将 `python.expectedSource` 定义为 `bundled`
- [x] 新增 bundled Python 路径解析
- [x] 新增 bundled Python 校验与 metadata
- [x] smoke check 覆盖 `venv`、`pip`、`sqlite3`、`ssl`
- [x] 在 gate 的 bundled failure 分支纳入 `python`
- [x] 保持 managed bootstrap 顺序不包含 `python`
- [x] 将 bundled Python 路径注入 bootstrap options
- [x] 打包入口在 build 前断言目标 bundled Python runtime manifest 与 executable 存在
- [x] 修复 `--mac zip` / `--mac zip --arm64` 这类 electron-builder 参数下 Python runtime target 解析错误

## 阶段 2：gallery-dl stable-first

涉及文件：

- `electron/managedRuntimeBootstrap.mts`
- `electron/downloaderVersionInfo.mts`
- `src/electron-runtime/runtimePaths.ts`
- 相关测试文件

步骤：

- [x] 抽象 downloader Python package 安装器
- [x] 抽象 per-tool bootstrap promise / lock
- [x] 为 `gallery-dl` 增加 stable Python package 安装逻辑
- [x] 首版版本固定为 `gallery-dl==1.32.1`
- [x] 版本面板支持 `managed_python_package`
- [x] downloader 安装前统一依赖 bundled Python 校验
- [x] downloader 安装前校验 bundled Python 版本满足该工具 `minPython`
- [x] 识别并清理旧 `gallery-dl/<target>/real` 布局

## 阶段 3：yt-dlp Windows 统一

涉及文件：

- `electron/managedRuntimeBootstrap.mts`
- `electron/downloaderVersionInfo.mts`
- 相关测试文件

步骤：

- [x] 将 Windows `yt-dlp` 迁到 shared Python + venv
- [x] 统一 yt-dlp metadata 格式
- [x] 清理 mac / win 逻辑分叉
- [x] 识别并清理旧 `yt-dlp/<target>/real` 布局

## 阶段 4：douyin-dl 切到 shared Python

涉及文件：

- `electron/managedRuntimeBootstrap.mts`
- `src/electron-runtime/runtimePaths.ts`
- `electron/downloaderVersionInfo.mts`（如需）

步骤：

- [x] `douyin-dl` 不再直接探测系统 Python
- [x] 统一使用 bundled shared Python 创建自己的 venv
- [x] 保持 Playwright browser support 补装逻辑
- [x] 启动期自动预热不触发 Playwright / Chromium 下载
- [x] 识别并重建基于系统 Python 的旧 venv

## 阶段 5：统一收口

- [x] 移除旧 downloader binary/bootstrap 旧路径
- [x] 更新相关 spec / docs / settings copy
- [x] 将 Python downloader package pin 收敛到 Electron manifest 单一来源
- [x] 为 `ffmpeg` / `deno` managed bootstrap 增加 component+target 级 in-flight join

## 测试矩阵

### 单元/集成

- [x] `npm run type-check`
- [x] `npm run lint`
- [x] `npm test`

### 平台手测

- [x] Windows x64 fresh config，无系统 Python
- [x] Windows x64 NSIS 打包与 installer payload 静态检查
- [x] Windows x64 NSIS 覆盖安装升级
- [x] Windows x64 portable 换目录后继续可用
- [x] macOS arm64 packaged fresh config downloader bootstrap，无依赖缓存
- [x] macOS x64 / Intel packaged fresh config downloader bootstrap，无依赖缓存
- [ ] macOS 升级安装后旧 venv 自动重建或继续可用
- [x] Unicode 用户目录 / configDir

### 下载器链路

- [x] `yt-dlp` generic local fixture download
- [x] `gallery-dl` direct local image fixture download
- [x] `yt-dlp` generic external download
- [x] `gallery-dl` Weibo path
- [x] `gallery-dl` Pinterest path
- [x] `douyin-dl` single post execution path without browser fallback
- [ ] `douyin-dl` single post successful media download with valid Douyin session
- [x] 首次下载执行路径会等待 `ensureEngineRuntimeReady` 完成后才 dispatch engine
- [x] 首次真实外站下载不再等待 Python runtime 下载

### Gate 行为

- [x] 首次启动只在窗口可见后开始 bootstrap
- [x] 启动期只预热当前用户配置中已启用的 downloader
- [x] 启动期自动预热与用户首次下载不发生并发冲突
- [x] 缺 bundled Python 时直接失败并给出明确重新安装提示
- [x] bundled Python 校验通过后继续 downstream downloader 安装
- [x] 状态与版本信息不再依赖旧 fallback 语义
- [x] `python` 不进入 `missingComponents`
- [x] `douyin-dl` 浏览器支持不进入默认 gate bootstrap
- [x] 未启用 downloader 在首次启用/首次使用时仍能走同一套 ensure 路径

### 并发与首次下载

- [x] fresh install 下，启动后立即触发第一次下载时不会重复创建 venv
- [x] download path 会 join 对应 downloader 的 in-flight prewarm，而不是并发执行第二次 bootstrap

## 收口条件

- [x] 3 个 downloader 都已切到 bundled Python + per-tool venv
- [ ] 所有平台验证矩阵通过
- [x] 旧 binary fallback 路线已删除
- [x] 旧 runtime 布局清理逻辑已完成

## 当前审计备注

- 已完成并验证：
  - `npm run type-check`
  - `npm run lint`
  - `npm test`（102 个测试文件，605 个用例）
  - Claude 评审后新增收口：
    - Python downloader pins 由 `electron/managedPythonPackageManifest.mts` 单一来源提供，smoke / capability 脚本读取编译后的 Electron manifest
    - `ffmpeg` / `deno` bootstrap 增加 component+target 级 in-flight promise joining，避免启动预热与首次下载并发重复下载
    - 二次 Claude 评审指出 packaged Electron resource path 传参风险；已将 `electron/main.mts` 的 packaged `resourceDir` 修正为 `process.resourcesPath`，与 `runtimePaths.ts` 的 `<resourceDir>/app/desktop-assets/binaries/python-<target>` 候选契约对齐
  - focused gate/runtime tests:
    - `npm test -- electron/downloaderVersionInfo.test.mts scripts/python-runtime.test.mjs`
    - `npm test -- electron/runtimeDependencyGate.test.mts src/electron-runtime/runtimeDependencyGate.test.ts src/utils/runtimeDependencyGate.test.ts electron/managedRuntimeBootstrap.test.mts src/electron-runtime/runtimePaths.test.ts`
    - `npm test -- scripts/python-runtime.test.mjs electron/managedRuntimeBootstrap.test.mts`
    - `npm test -- electron/managedRuntimeBootstrap.test.mts scripts/python-runtime.test.mjs`
    - `npm test -- src/electron-runtime/service.test.ts` 覆盖下载执行前必须等待 `ensureEngineRuntimeReady` 完成
    - `npm test -- src/electron-runtime/runtimePaths.test.ts` 覆盖 packaged Electron app resources layout 下 bundled Python 解析
    - `npm run electron:build` 覆盖 `electron/main.mts` 编译输出
  - Windows 本机 `runtime:ensure:python`
  - bundled Python smoke
  - 外平台 bundled Python smoke 明确拒绝执行，并提示使用 `ensure-python-runtime.mjs` 做跨 target 准备
  - `npm run runtime:smoke:downloaders`
    - fresh Unicode configDir 下创建三套 downloader venv
    - 校验 pinned versions: `yt-dlp 2026.03.17`、`gallery-dl 1.32.1`、`douyin-dl 2.0.0`
    - 本地 HTTP fixture 执行验证：
      - managed `yt-dlp` 输出 `yt-dlp.mp4`
      - managed `gallery-dl` 输出 `gallery-dl.png`
  - managed `yt-dlp` 外部 generic 下载验证：
    - URL: `https://samplelib.com/lib/preview/mp4/sample-5s.mp4`
    - 输出: `build/external-download-smoke/yt-dlp-generic/generic.mp4`
    - 文件大小: `2848208`
  - managed `gallery-dl` Weibo 真实下载验证：
    - URL: `https://weibo.com/detail/4913212871149937`
    - 输出: `build/external-download-smoke/gallery-dl-weibo/weibo.mp4`
    - 文件大小: `15924401`
  - managed `gallery-dl` Pinterest 真实下载验证：
    - URL: `https://www.pinterest.com/pin/landscapes--466826317629931218/`
    - 输出: `build/external-download-smoke/gallery-dl-pinterest/pinterest.jpg`
    - 文件大小: `48336`
  - capability probe Pinterest 样本已替换为同一个实测可用 pin：
    - `npm run capabilities:probe`
    - 结果：9 个目标，`works=7`、`worksWithAuth=1`、`broken=1`
    - `pinterest-gallery-dl` 当前为 `works`
    - 唯一 `broken` 为 `xiaohongshu-ytdlp`，属于站点能力波动，不是 Python runtime 部署问题
  - `npm run capabilities:probe:review`
    - `totalCandidates=9`
    - `updateExistingCapability=8`
    - `addMissingCapability=1`
  - managed `douyin-dl` 单条执行路径验证：
    - URL: `https://www.douyin.com/video/7493088730088770870`
    - 应用等价环境变量：`PYTHONIOENCODING=utf-8`、`PYTHONUTF8=1`
    - `browser_fallback.enabled=false`，未触发 Playwright / Chromium 安装
    - CLI 可启动并执行到 Douyin API 请求；当前无登录态下返回 anti-bot 空 200，summary 为 `Success 0 / Failed 1`
    - `npm test -- src/electron-runtime/douyinDlDownload.test.ts` 覆盖 exit 0 但 summary failed 时应用层必须返回失败
  - capability probe runtime ensure
  - `npm run package:win:dir`
  - `npm run package:portable:skip-build`
  - `npm run package:win`
  - Windows NSIS 临时目录覆盖安装验证：
    - 使用 `build/nsis-upgrade-smoke/install` 作为安装目录
    - 同一 installer 静默安装两次，第一次退出码 `0`，第二次退出码 `0`
    - 安装后存在 `Ameow.exe`
    - 安装后存在 `resources/app/dist-electron/electron/managedPythonPackageManifest.mjs`
    - 安装后 `resources/app/dist-electron/electron/main.mjs` 确认使用 `resourceDir: app.isPackaged ? process.resourcesPath : null`
    - 安装后存在 `.official-python-runtimes.json` 与 `python-x86_64-pc-windows-msvc/python.exe`
    - 安装后不存在 `.official-downloader-binaries.json`、`yt-dlp-x86_64-pc-windows-msvc.exe`、`gallery-dl-x86_64-pc-windows-msvc.exe`
  - capability probe 生成链路
  - cross-target 非宿主 Python prepare 不执行外平台二进制的单元测试
  - 打包前目标 Python runtime 断言测试
  - bundled Python 最低版本兼容断言测试
  - `node ./scripts/ensure-python-runtime.mjs --mac zip` 正确解析并准备 `x86_64-apple-darwin`
  - `node ./scripts/ensure-python-runtime.mjs --mac zip --arm64` 正确解析并准备 `aarch64-apple-darwin`
  - 三个 bundled Python target manifest / executable 断言通过：
    - `x86_64-pc-windows-msvc`
    - `aarch64-apple-darwin`
    - `x86_64-apple-darwin`
  - Windows fresh Unicode configDir 真实 bootstrap：
    - `yt-dlp` venv 创建并输出 `2026.03.17`
    - `gallery-dl` venv 创建并输出 `1.32.1`
    - `douyin-dl` venv 创建并输出 `2.0.0`
  - Windows fresh Unicode configDir bootstrap 已沉淀为可复用脚本：`scripts/smoke-managed-python-downloaders.mjs`
  - portable zip 内确认包含 `.official-python-runtimes.json`、`python.exe` 与 `Lib/venv`
  - 最新 portable 包验证：
    - `npm run package:portable:skip-build`
    - `dist-release/portable/Ameow_0.3.0-rc7_windows_x64_portable.zip`
    - SHA256: `2C3F570E7B28B7B18D9CDA42AD4155D8038DCBC8430BE3892BBF9F86EFF82D71`
    - zip 内存在 `desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe`
    - zip 内存在 `.official-python-runtimes.json`
    - zip 内存在 `dist-electron/electron/managedPythonPackageManifest.mjs`
    - zip 内不存在旧 `.official-downloader-binaries.json`、旧 `yt-dlp` / `gallery-dl` standalone assets、macOS Python runtime
  - `dist-release/win-unpacked/resources/app/desktop-assets/binaries/` 只包含 `.official-python-runtimes.json` 与 `python-x86_64-pc-windows-msvc`
  - `dist-release/win-unpacked/resources/app/dist-electron/electron/main.mjs` 确认 packaged `resourceDir` 使用 `process.resourcesPath`
  - 最新 `npm run package:win:dir` 通过，静态确认：
    - packaged app 内存在 `dist-electron/electron/managedPythonPackageManifest.mjs`
    - packaged app 内存在 `desktop-assets/binaries/python-x86_64-pc-windows-msvc/python.exe`
    - packaged app 内不存在 `.official-downloader-binaries.json`
  - NSIS installer 内 `$PLUGINSDIR/app-64.7z` payload 静态确认包含 `.official-python-runtimes.json` 与 `python.exe`
  - resourceDir 修正后的最终本地质量门：
    - `npm run type-check`
    - `npm run lint`
    - `npm test`（102 个测试文件，605 个用例）
    - `npm run runtime:smoke:python`
    - `npm run runtime:smoke:downloaders`
    - `npm run package:win`
    - `npm run package:portable:skip-build`
    - `git diff --check` 退出码 `0`，仅有 Windows 行尾转换提示
  - 新增 macOS packaged runtime 验证入口：
    - `npm run runtime:verify:macos-package`
    - 检查 `.app/Contents/Resources/app/desktop-assets/binaries/python-<target>`、`.official-python-runtimes.json`、`managedPythonPackageManifest.mjs`
    - 检查 compiled `main.mjs` 使用 `resourceDir: app.isPackaged ? process.resourcesPath : null`
    - 检查旧 `.official-downloader-binaries.json` 与 standalone `yt-dlp` / `gallery-dl` assets 不存在
    - 在 macOS host target 匹配时会执行 packaged Python `--version`、`sqlite3` / `ssl` import、默认 symlink venv 与 `pip --version`
    - Windows 上已用合成 `.app` fixture 验证静态检查路径：
      - `node --check scripts/verify-macos-python-runtime-package.mjs`
      - `npm run runtime:verify:macos-package -- arm64 D:\Ameow\build\macos-package-verify-fixture\Ameow.app static-only`
      - `npm run runtime:verify:macos-package -- arm64 static-only D:\Ameow\build\macos-package-verify-fixture\Ameow.app`
      - `node ./scripts/verify-macos-python-runtime-package.mjs --arch arm64 --app D:\Ameow\build\macos-package-verify-fixture\Ameow.app --static-only`
      - `npm run runtime:verify:macos-package -- arm64 require-execution` 在 Windows 无 `.app` 时明确失败为 `No .app bundle found ...`，符合“实机打包后执行”的契约
  - 新增 Douyin 登录态成功下载验证入口：
    - `npm run runtime:smoke:douyin-session -- <cookies-file> [douyin-url]`
    - 支持 `node ./scripts/smoke-douyin-dl-session-download.mjs --site-session <path-to-douyin.json>` 直接读取 Ameow site-session JSON 中的 `cookiesNetscape`
    - 脚本先构建 Electron runtime，再确保 bundled Python 与 managed `douyin-dl` venv
    - 复用 `runDouyinDlDownload(...)` 的应用实际执行路径，保持 `browser_fallback.enabled=false`
    - 成功条件是返回非空媒体文件路径并验证文件大小大于 0
    - 脚本不会输出 cookies 内容；无 cookies 文件时明确失败
    - 已验证：
      - `node --check scripts/smoke-douyin-dl-session-download.mjs`
      - `npm run runtime:smoke:douyin-session -- help`
      - `npm run runtime:smoke:douyin-session` 无 cookies 文件时明确失败
      - 使用 fake cookies 执行 `node ./scripts/smoke-douyin-dl-session-download.mjs --cookies-file <fake-cookies> --skip-build`，确认脚本走 managed `douyin-dl` runtime，失败 JSON 不输出 cookie 值，并报告缺少有效登录态 / anti-bot
      - 使用 fake Ameow site-session JSON 执行 `node ./scripts/smoke-douyin-dl-session-download.mjs --site-session <fake-douyin.json> --skip-build`，确认脚本读取 `cookiesNetscape`、走 managed `douyin-dl` runtime，并报告缺少有效 Douyin 登录 cookie / anti-bot
      - `build/douyin-site-session-redaction-check/stdout-stderr.txt` redaction 检查确认 fake cookie secret 未出现在 stdout/stderr
  - macOS release workflow 已接入 packaged runtime 自动验证：
    - 根据 GitHub-hosted runners 官方文档，`macos-15` 覆盖 arm64，`macos-15-intel` 覆盖 Intel x64；release matrix 已扩展为 arm64 + x64
    - `Package macOS ZIP and open-source DMG` 后运行 `npm run runtime:verify:macos-package -- ${{ matrix.artifact_arch }} require-execution`
    - 通过 `tee` 生成 `build/macos-runtime-package-verification-${{ matrix.artifact_arch }}.json`
    - 上传 `macos-runtime-verification-${{ matrix.artifact_arch }}` artifact
    - release 创建阶段已下载并发布 `macos-dmg-x64` / `macos-zip-x64`，不再只发布 arm64 macOS 产物
    - 本地已验证：
      - `node --check scripts/verify-macos-python-runtime-package.mjs`
      - `node --check scripts/smoke-douyin-dl-session-download.mjs`
      - PyYAML 解析 `.github/workflows/release.yml` 与 `.github/workflows/update-capabilities-probes.yml`
      - `git diff --check` 退出码 `0`，仅有 Windows 行尾转换提示
      - `npm run runtime:smoke:downloaders` 重新通过，三套 venv 版本仍为 `yt-dlp 2026.03.17`、`gallery-dl 1.32.1`、`douyin-dl 2.0.0`
  - 新增手动触发的 macOS runtime package 验证 workflow：
    - `.github/workflows/verify-macos-runtime-package.yml`
    - `workflow_dispatch` 触发
    - matrix 覆盖 `macos-15` / arm64 与 `macos-15-intel` / x64
    - 每个 job 运行 `node ./scripts/run-electron-package.mjs --mac zip <arch>`，随后运行 `npm run runtime:verify:macos-package -- <artifact_arch> require-execution`
    - 上传 `macos-runtime-verification-<arch>` JSON artifact 与对应 macOS ZIP artifact
    - 本地已用 PyYAML 解析该 workflow，并通过 `node --check` / `git diff --check`
  - 提交前最终本地质量门：
    - `npm run type-check`
    - `npm run lint`
    - `npm test`（102 个测试文件，605 个用例）
    - `npm run runtime:smoke:python`
    - `npm run runtime:smoke:downloaders`
    - `node --check scripts/verify-macos-python-runtime-package.mjs`
    - `node --check scripts/smoke-douyin-dl-session-download.mjs`
    - PyYAML 解析 `.github/workflows/release.yml`、`.github/workflows/update-capabilities-probes.yml`、`.github/workflows/verify-macos-runtime-package.yml`
    - `git diff --check` 退出码 `0`，仅有 Windows 行尾转换提示
  - `npm run package:mac:zip` 在 Windows 上已确认先准备 `x86_64-apple-darwin` Python runtime，随后失败于 electron-builder 平台限制：`Build for macOS is supported only on macOS`
  - 旧 downloader runtime 关键词扫描 0 命中
  - GitHub Actions 手动 macOS runtime package 验证已通过：
    - workflow: `Verify macOS Runtime Package`
    - run: `26245402915`
    - URL: `https://github.com/Wutpeach/Ameow/actions/runs/26245402915`
    - arm64 job: `verify-macos-runtime-package (macos-15, --arm64, arm64)`，完成 `Build macOS ZIP`、`Verify packaged Python runtime`、packaged downloader bootstrap、上传 runtime verification 与 ZIP artifact
    - x64 job: `verify-macos-runtime-package (macos-15-intel, --x64, x64)`，完成 `Build macOS ZIP`、`Verify packaged Python runtime`、packaged downloader bootstrap、上传 runtime verification 与 ZIP artifact
    - arm64 verification JSON:
      - `state: ok`
      - `target: aarch64-apple-darwin`
      - `.app` runtime path: `Contents/Resources/app/desktop-assets/binaries/python-aarch64-apple-darwin/bin/python3`
      - manifest pinned `Python 3.11.15` / release `20260325`
      - `binaryEntries` 仅包含 `.official-python-runtimes.json` 与 `python-aarch64-apple-darwin`
      - `execution.attempted: true`
      - packaged Python reported `Python 3.11.15`
      - symlink venv + `pip --version` 成功，`pip 24.0`
      - `downloaderBootstrap.attempted: true`
      - 使用 `.app` 内 compiled `managedRuntimeBootstrap.mjs` 与 fresh temp configDir 创建三套 downloader venv
      - packaged downloader versions 匹配：`yt-dlp 2026.03.17`、`gallery-dl 1.32.1`、`douyin-dl 2.0.0`
      - bootstrap activities 覆盖 `ytDlp` / `galleryDl` / `douyinDl` 的 `checking`、`installing`、`verifying`
      - `configDirRetained: false`，验证成功后清理临时 venv
    - x64 verification JSON:
      - `state: ok`
      - `target: x86_64-apple-darwin`
      - `.app` runtime path: `Contents/Resources/app/desktop-assets/binaries/python-x86_64-apple-darwin/bin/python3`
      - manifest pinned `Python 3.11.15` / release `20260325`
      - `binaryEntries` 仅包含 `.official-python-runtimes.json` 与 `python-x86_64-apple-darwin`
      - `execution.attempted: true`
      - packaged Python reported `Python 3.11.15`
      - symlink venv + `pip --version` 成功，`pip 24.0`
      - `downloaderBootstrap.attempted: true`
      - 使用 `.app` 内 compiled `managedRuntimeBootstrap.mjs` 与 fresh temp configDir 创建三套 downloader venv
      - packaged downloader versions 匹配：`yt-dlp 2026.03.17`、`gallery-dl 1.32.1`、`douyin-dl 2.0.0`
      - bootstrap activities 覆盖 `ytDlp` / `galleryDl` / `douyinDl` 的 `checking`、`installing`、`verifying`
      - `configDirRetained: false`，验证成功后清理临时 venv
  - macOS `venv --copies` 被 GitHub Actions 实证否决：
    - 初次 run `26243802684` 在 arm64/x64 均失败于 venv 内部 `ensurepip` 子进程 `SIGABRT`
    - 与 Claude 复核后，将 macOS venv 策略修正为默认 symlink venv
    - downloader venv metadata 新增 `bundledPythonPath`，app 移动或升级导致 bundled Python 路径变化时会触发 venv 重建
- 当前环境未完成：
  - macOS 真实打包 / 真实首装链路：
    - packaged runtime 与 `.app` 内 compiled bootstrap 已在 GitHub macOS arm64/x64 runner 内创建三套 downloader venv 并校验版本；仍缺少真实启动 app UI 后通过 runtime gate 自动预热的手测证据
    - macOS 升级安装后旧 venv 自动重建或继续可用
  - `douyin-dl` single post successful media download with valid Douyin session：
    - 当前 Windows managed runtime 已证明 CLI 可启动、UTF-8 环境正确、未触发 browser fallback
    - 当前无登录态实测被 Douyin API anti-bot 拦截，summary 为 `Success 0 / Failed 1`
    - 本机 `C:\Users\Administrator\AppData\Roaming\ameow\site-sessions` 仅存在 `bilibili.json`，不存在 `douyin.json`
    - 需要带有效 Douyin site session/cookies 再验证成功产物

## macOS 实机验证命令建议

- 在 macOS arm64 打包机：
  - `npm run type-check`
  - `npm run lint`
  - `npm test`
  - `npm run runtime:smoke:python`
  - `npm run runtime:smoke:downloaders`
  - `npm run package:mac:zip -- --arm64`（如当前脚本不透传该形态，则直接 `node ./scripts/run-electron-package.mjs --mac zip --arm64`）
  - `npm run runtime:verify:macos-package -- arm64 require-execution`
  - fresh config 启动，确认 bundled Python 能在 `.app` resource layout 内创建 3 个 downloader venv
- 在 macOS x64 / Intel 打包机：
  - `node ./scripts/run-electron-package.mjs --mac zip --x64`
  - `npm run runtime:verify:macos-package -- x64 require-execution`
  - 重复 fresh config / 升级安装验证
