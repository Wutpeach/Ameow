# Windows x64 安装版与便携版

#33 C5 复用 C1 的同一份签名 Launcher/versioned portable 布局。当前只生成受控候选，
不生成生产密钥，不解除 Gate B，也不上传或发布任何 EXE/ZIP。

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
`-PackageMode public-release` 始终拒绝；不存在 publish 命令或 CI signing secret。

当前输出：

- `Ameow_<version>_windows_x64_installer-CONTROLLED.exe`：Inno 默认浅色向导。
- `Ameow_<version>_windows_x64_portable-CONTROLLED.zip`：已验证便携 ZIP 的原始字节，
  仅重命名，不重新压缩；入口是 `AmeowLauncher.exe`。
- `Ameow-<version>-windows-x64.zip`：保持现有 URL 和协议，仅包含 `Ameow.exe`，供更新器使用。
- `delivery.json` / `verified-release.json`：相同构建身份、核心文件、许可材料和资产哈希。
  `payload/` 和 `payload.iss` 是可检查的安装器输入，不是额外发行产品。

`-Fixture` 只接受显式 debug-only RFC 测试根和 synthetic 构建身份，输出文件带
`FIXTURE-NOT-FOR-DISTRIBUTION`，安装名称/独立 AppId 为 `Ameow C5 Validation` /
`Ameow.C5.Validation`。它不启用或替代生产根。

## 安装、覆盖安装与卸载

安装默认当前用户、无需管理员权限，目录为 `%LOCALAPPDATA%\Programs\Ameow`，
创建开始菜单入口、可选桌面快捷方式和 Windows 卸载登记。快捷方式始终指向
稳定 Launcher；不创建服务、不自动启用开机启动，不引入 Electron 迁移。

运行中的 Ameow 会阻止安装/卸载，不通过强行结束进程释放文件。版本目录不可变：
重装同一版本只接受相同 EXE/manifest，不覆盖不同字节；`state.json` 仅在不存在时复制。
安装后 Launcher 的 `--register-installed-version <version>` 再验证签名、有效期、
版本身份和 EXE，复用现有序号/降级/失败记录检查，将新版设为 pending。重复安装相同
current/pending 不重写状态。只有后续真实启动的 Ready 才提交 current，原回滚机制不变。
若注册失败，安装器报错，旧 current/previous 不被重置；保留的新目录可供排障/重试，
不可声称完成升级。新 Launcher 的正常启动协议不变，旧 Launcher 须随本次安装器替换。

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

另行完成生产公钥批准及重编、离线签名、许可 Gate B、普通用户/真实 Shell 与签名
HTTPS 更新验收，再取得明确的提交/推送/Tag/Release 授权。由同一构建生成安装版和
便携版，核对 delivery 哈希及单 EXE 更新包；签名清单按既有公开资产名
`ameow-update-windows-x64.json` 上传。保持 `Ameow-<version>-windows-x64.zip` 更新 URL。
当前所有候选都标为 CONTROLLED，不可直接改名后当作正式发行。
Electron v0.3.1 仅是停止支持的历史记录，不维护旧 `latest.json` 或迁移通道。
