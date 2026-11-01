# Portable app self-update

## Goal

让 Windows 便携版用户在收到应用更新提示后，可以从应用内完成便携包原地自更新，而不是被引导去运行 NSIS 安装器。

用户价值：

- 便携版继续保持免安装、目录可搬迁的使用模型。
- 更新入口根据当前运行形态选择正确更新资产。
- 更新失败时不破坏现有便携目录，并能保留可手动恢复的路径。

## Confirmed Facts

- 当前 Electron 应用更新检查只允许 `win32 + app.isPackaged`，没有区分安装版与便携版。
- 当前 `downloadAndInstall()` 只消费 manifest 的 `platforms["windows-x86_64"].url`，并下载、打开 Windows installer。
- `scripts/generate-updater-manifest.mjs` 当前只把 Windows installer exe 写入 `latest.json`。
- `scripts/package-portable.ps1` 已产出 `Ameow_<version>_windows_x64_portable.zip`，ZIP 根目录包含 `Ameow_portable/`。
- `.github/workflows/release.yml` 已上传 Windows installer、Windows portable ZIP、browser extension ZIP、macOS artifacts 和 `latest.json`。
- `.trellis/spec/backend/electron-runtime-contracts.md` 当前明确写着 portable ZIP 是 manual-distribution only，且 in-app auto-update only for installed NSIS builds；本任务若落地，需要同步更新该规范。

## Requirements

- Windows 安装版继续使用现有 installer 更新路径。
- Windows 便携版检查更新时应读取同一个 GitHub release manifest，但选择 portable ZIP 作为可安装资产。
- Release manifest 必须包含 portable ZIP 下载 URL，并包含可验证完整性的 SHA256。
- Electron 主进程必须能判断当前运行实例是否应走 portable 更新路径。
- 便携更新必须由主程序外部的 helper 执行，避免 Windows 文件锁导致覆盖自身目录失败。
- helper 必须等待当前 `Ameow.exe` 退出后再修改便携目录。
- 更新流程必须校验下载包，解压到临时目录，确认根目录结构符合预期后再替换。
- 便携包解压 staging 目录必须创建在当前便携根目录的同一磁盘/同级父目录下，保证 Windows rename 替换可行；下载文件可仍放在系统临时目录。
- 替换必须具备失败回滚策略，不能留下半更新目录。
- helper 必须兼容 Windows PowerShell 5.1，不能使用 PowerShell 7 专属语法。
- helper 启动失败时主程序不得退出，应把错误返回给 UI。
- 当前便携目录不可写、结构不符合预期、下载校验失败、解压失败或替换失败时，应用应给出可重试错误并保留手动下载路径。
- 预发布更新开关仍按现有逻辑决定读取 stable manifest 或 prerelease manifest；portable 与 installer 分流只发生在选定 manifest 之后。
- macOS 自更新仍不纳入本任务范围。

## Acceptance Criteria

- [x] `latest.json` 同时包含 Windows installer 和 Windows portable ZIP 的更新资产；旧安装版 updater 仍能读取原 `platforms["windows-x86_64"].url`。
- [x] Windows 便携版检查到新版本后，更新入口显示同一套更新信息，但安装动作下载 portable ZIP。
- [x] Windows 安装版检查和安装行为保持现状，继续下载并打开 NSIS installer。
- [x] 便携版下载完成后校验 SHA256，校验失败不会修改当前便携目录。
- [x] helper 在主程序退出后替换便携目录，并在成功后启动新版 `Ameow.exe`。
- [x] helper 对文件锁/杀毒扫描等短暂占用执行有限重试，并把失败原因写入日志。
- [x] 替换失败时 helper 尝试恢复旧目录；无法恢复时保留备份目录并写出诊断日志。
- [x] 当前目录不可写时不启动替换流程，UI 能显示可理解的失败原因或手动更新入口。
- [x] helper 启动失败不会关闭当前应用，UI 能显示失败原因。
- [x] 单元测试覆盖 manifest 解析、安装版/便携版资产选择、校验失败、helper 参数生成、同盘 staging 选择、PID 校验和危险路径拒绝。
- [x] 文档/规范更新，移除“portable 仅手动分发”的旧约束，记录 portable updater 的边界。

## Out Of Scope

- macOS 自动更新。
- 增量更新或差分 patch。
- 后台静默自动下载。
- 多版本跳过、灰度发布、强制更新。
- 私有仓库鉴权分发。
- 对安装版迁移到便携版，或便携版迁移到安装版。

## Open Questions

- 是否需要在 UI 中显式告诉便携版用户“将原地替换当前目录”，并提供“打开 release 页面手动下载”的次级动作。

推荐答案：需要，但可以作为同一更新错误/确认文案的一部分，不需要新增完整设置页。原因是 portable 自更新会修改用户当前解压目录，失败模式也比 installer 更需要透明。
