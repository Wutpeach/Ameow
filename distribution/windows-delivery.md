# Windows x64 安装版与便携版

#33 C5 复用 C1 的同一份签名 Launcher/versioned portable 布局。当前只生成受控候选，
不生成生产密钥，不解除 Gate B，也不上传或发布任何 EXE/ZIP。
首次正式发行的已确认版本 0.5.0、审批后构建/签名/四类资产与手动上传步骤见
[首次 Rust 发行](../docs/first-rust-release.md)。当前配置继续拒绝正式模式。

## 构建入口

1. 继续用 `scripts/package_portable.ps1 -BuildOnly -ReleasePreparation` 构建一次应用、
   Launcher 和 `ameow-release.exe`，按 C1 的独立授权流程准备签名材料。
2. 安装 Inno Setup 6（支持 `WizardStyle=modern light`）。用独立可信公钥副本验证
   已签名候选，再制作双资产；输出目录必须是新目录：

```powershell
./scripts/package_windows.ps1 `
  -SignedDirectory D:/review/signed `
  -ReleaseTool D:/verified-tools/ameow-release.exe `
  -TrustedPublicRoots D:/trusted-copy/approved-public-roots.json `
  -OutputDirectory D:/review/windows-delivery-01
```

生产根仍为 `keys: []` 时，入口在创建输出前拒绝生产候选。未签名 plan、无效签名、
未知根、成员内容变化、越界或 reparse 路径也不能用于生成安装器。
`-PackageMode public-release` 仅接受获批材料、非 fixture 的生产根和正式签名身份；
当前 Gate B/生产根保持关闭，因此会在创建产物前拒绝。不存在 publish 命令或 CI signing secret。

当前输出：

- `Ameow_<version>_windows_x64_installer-CONTROLLED.exe`：Inno 默认浅色向导。
- `Ameow_<version>_windows_x64_portable-CONTROLLED.zip`：已验证便携 ZIP 的原始字节，
  仅重命名，不重新压缩；入口是 `AmeowLauncher.exe`。
- `Ameow-<version>-windows-x64.zip`：保持现有 URL 和协议，仅包含 `Ameow.exe`，供更新器使用。
- `delivery.json` / `verified-release.json`：相同构建身份、核心文件、许可材料和资产哈希。
  `payload/` 和 `payload.iss` 是可检查的安装器输入，不是额外发行产品。
- `ameow-update-windows-x64.json` 与 `SHA256SUMS.txt`：同一签名清单及四类资产的实际哈希。
  正式模式移除文件名的 CONTROLLED 后缀，由正式身份直接生成，不能重命名受控包替代。

`-Fixture` 只接受显式 debug-only RFC 测试根和 synthetic 构建身份，输出文件带
`FIXTURE-NOT-FOR-DISTRIBUTION`，安装名称/独立 AppId 为 `Ameow C5 Validation` /
`Ameow.C5.Validation`。它不启用或替代生产根。

## 安装、覆盖安装与卸载

安装默认当前用户、无需管理员权限，目录为 `%LOCALAPPDATA%\Programs\Ameow`，
创建开始菜单入口、可选桌面快捷方式和 Windows 卸载登记。快捷方式始终指向
稳定 Launcher；不创建服务、不自动启用开机启动，不引入 Electron 迁移。

运行中的 Ameow 会阻止安装/卸载，不通过强行结束进程释放文件。版本目录不可变：
重装同一版本只接受相同 EXE/manifest，不覆盖不同字节；`state.json` 仅在不存在时复制。
安装后 Launcher 的 `--register-installed-version <version>` 再验证签名、签发时间合理性、
版本身份和 EXE，复用现有序号/降级/失败记录检查，将新版设为 pending。重复安装相同
current/pending 不重写状态。只有后续真实启动的 Ready 才提交 current，原回滚机制不变。
若注册失败，安装器报错，旧 current/previous 不被重置；保留的新目录可供排障/重试，
不可声称完成升级。新 Launcher 的正常启动协议不变，旧 Launcher 须随本次安装器替换。

安装版、便携版及签名清单和对应更新包永久有效。清单没有 `expires` 字段或替代期限，
`issued` 仅记录签发时间；安装登记、自动更新检查/准备与离线启动共用该语义。
签名、哈希、版本/来源身份、防重放、防降级、运行保护、Ready 和回滚继续生效。

卸载只移除 Inno 登记的程序文件、快捷方式及其卸载入口，不递归清空自选目录。
默认保留 `%LOCALAPPDATA%\Ameow`、下载文件，以及程序目录内的更新状态和未由安装器
登记的后续更新版本/其他文件，便于安全重装；因此卸载后程序目录可能非空。
仅当 Run 值严格指向本安装目录的 Launcher 时才移除该开机启动命令，不触碰其他副本。
测试 AppId 的卸载器完全不修改真实 `Ameow` Run 值。

## 定向验证与 CI

`scripts/test_windows_delivery.ps1` 验证公开模式/空生产根/损坏成员拒绝、从已签名布局
编译安装器、双资产核心字节一致和更新 ZIP 单成员约束。已有 Rust Windows CI 局部
调用 debug-only `release_fixture` 与该脚本；仅增加 JSON 证据上传，不上传程序包。
CI 编译测试不等于原生安装或干净普通用户验收。

真实 Windows 验收使用新的隔离目录、独立测试 AppId/快捷方式，执行安装、Launcher
启动 GPUI、正常退出、重装/升级、卸载，记录权限、状态和文件保全。许可/应用业务/
历史更新闭环复用未受影响的 C3/C4 证据，无需重跑所有媒体测试。

## 后续手动发行衔接（本轮不执行）

按[最短发行路径](../docs/first-rust-release.md)完成材料、公钥与发布的独立批准，
从干净且精确的版本 Tag 构建，再离线签名并生成四类正式资产。发布授权后手动调用
`gh release create --verify-tag`，只上传逐项核验的四个文件，不上传整个构建目录。
当前所有已有候选仍不可作为正式发行。
Electron v0.3.1 仅是停止支持的历史记录，不维护旧 `latest.json` 或迁移通道。
