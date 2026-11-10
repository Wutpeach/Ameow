# Windows 安装版与便携版

当前发行路径：确定源码 → 构建 → 所有者离线签名 → 验证 → Inno 安装版与便携 ZIP → 用户决定公开上传。构建和打包没有 Gate A/B 审批状态；生产可信根、真实签名和完整性检查继续强制执行。完整命令见 [首次 Rust 发行](../docs/first-rust-release.md)。

一次调用 scripts/package_portable.ps1 构建 App、Launcher、离线工具和未签名输入。正式候选来自独立干净 Commit，不要求先创建 Tag，也不必清理带有其它任务改动的主开发目录。离线 sign 之后，verify-signed 必须使用独立可信公钥副本。

~~~powershell
./scripts/package_windows.ps1 -SignedDirectory D:/AmeowRelease/0.5.0/signed -ReleaseTool D:/AmeowRelease/0.5.0/build/ameow-release.exe -TrustedPublicRoots X:/AmeowSigning/public-roots.json -OutputDirectory D:/AmeowRelease/0.5.0/delivery
~~~

此入口默认制作正式资产；不接受审批文件或 PackageMode。空生产公钥、fixture 根冒充、编入的版本/根不匹配、脏或伪造的正式源码身份、错误签名与成员哈希均拒绝。许可清单在签名核心内验证，不要求它等于当前开发工作区中的另一个副本。

四类资产由同一已验签核心产生：

| 文件 | 用途 |
| --- | --- |
| Ameow_<version>_windows_x64_installer.exe | Inno 默认浅色安装向导，稳定入口为 Launcher |
| Ameow_<version>_windows_x64_portable.zip | 完整解压后运行 AmeowLauncher.exe |
| Ameow-<version>-windows-x64.zip | 自动更新，严格只有 Ameow.exe |
| ameow-update-windows-x64.json | Ed25519 签名更新清单，无 expires |

安装器和便携包使用相同的已验签 App、Launcher、声明及初始状态；首次启动保持 pending，真实 Ready 后才确认。安装后的 state 不被覆盖，版本文件按既有规则保留；回滚、防降级和重放保护沿用。Inno 编译后再次核对核心、声明、清单和更新 ZIP 的哈希。delivery.json / verified-release.json / SHA256SUMS.txt 供本地核对，上传时仅列出四个实际资产，不递归上传工作目录。

-Fixture 只用于明确的调试演练：必须使用已知 RFC 根和合成源码身份，文件名带 FIXTURE-NOT-FOR-DISTRIBUTION，安装应用名/AppId 与正式版分开。默认正式入口拒绝该根，不能重命名 fixture 来发布。既有 C5 安装/卸载验证可复用，界面未改变时无需重做。

正式上传前再核对 v<version> 精确指向签名构建 Commit；历史 Tag 永不移动/覆盖。私钥不进 Git/CI，本脚本不签名、不上传。生产根目前仍为空；本轮没有启用密钥或制作正式包。
