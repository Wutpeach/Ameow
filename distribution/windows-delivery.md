# Windows 安装版与便携版

发行路径：确定源码 → 构建 → 本机签名 → 验证 → Inno 安装版与便携 ZIP → 发布。生产可信根、真实签名和完整性检查继续强制执行。构建与签名命令见[发行构建](packaging.md)。

一次调用 scripts/package_portable.ps1 构建 App、Launcher、CLI、浏览器桥接、离线工具和未签名输入。正式候选来自独立干净 Commit，不要求先创建 Tag，也不必清理带有其它任务改动的主开发目录。离线 sign 之后，verify-signed 必须使用独立可信公钥副本。

~~~powershell
./scripts/package_windows.ps1 -SignedDirectory D:/AmeowRelease/candidate/signed -ReleaseTool D:/AmeowRelease/candidate/build/ameow-release.exe -TrustedPublicRoots X:/AmeowSigning/public-roots.json -OutputDirectory D:/AmeowRelease/candidate/delivery
~~~

此入口需要 PowerShell 7（pwsh），默认制作正式资产；不接受审批文件或 PackageMode。空生产公钥、fixture 根冒充、编入的版本/根不匹配、脏或伪造的正式源码身份、错误签名与成员哈希均拒绝。许可清单在签名核心内验证，不要求它等于当前开发工作区中的另一个副本。

下述为尚未发行的 0.5.2 新布局，最终文件名及面向用户的重新安装说明交发版前审阅，现有 0.5.1 公开资产和下载链接保持原样。Windows 三类资产由同一已验签核心产生：

| 文件 | 用途 |
| --- | --- |
| Ameow_<version>_windows_x64_installer.exe | 完整 Inno 安装版，桌面与开始菜单指向根 Ameow.exe |
| Ameow-<version>-windows-x64-portable.zip | 完整便携版，同时是应用内更新载荷；完整解压后运行根 Ameow.exe |
| ameow-update-windows-x64.json | Windows schema2 Ed25519 更新清单，无 expires；自动更新使用，无需手动下载 |

加上 Mac 完整 App ZIP 和 Mac 签名 JSON，目标总计五资产。Mac 保持现有完整 App 载荷和 schema1，不增加 Mac 安装器。

根 Ameow.exe 是稳定启动器并含正式 icon/FileDescription；根 CLI/host 是稳定分发入口，主程序、CLI、host、扩展和许可材料的匹配版本位于 versions/<version>/。每槽 bundle.json 独立签名全部文件；外部更新 JSON 校验整个 portable ZIP 及该清单，因此 ZIP 不嵌入会引用自身 hash 的更新 JSON。根目录不新增 README/TXT 入口说明。开发根 cargo run 仍直接运行 ameow 主程序。

安装器和便携包使用相同的已验签整套文件及初始 pending；真实 Ready 后才确认 current。后续应用更新先校验完整版本槽，Ready 提交时成功发布固定 browser-extension 镜像后才确认当前版本；失败安全退出候选并保留旧版。根 CLI/host 按已验签活动槽执行。浏览器已经加载的扩展不会自动重载：活动 current 及镜像成功变化后，依据实际 build.json/manifest 提醒手动重载扩展和刷新网页；仅下载 Ready 不代表已活动。

0.5.2 推荐旧用户卸载旧版、清理旧程序目录后，下载完整安装版重新安装，或选择新的空程序文件夹；旧程序目录残留安装状态时，安装器会在写入前给出上述提示，不自动导入旧布局。用户设置及下载目录位于程序目录之外。不实现旧 Launcher 名、旧快捷方式或旧单 EXE 更新载荷的兼容桥接，也不宣称 0.5.1 应用内更新可完成此布局迁移。安装后的 state 不覆盖，版本槽全部成员做不可变冲突检查；回退、防降级和重放保护保留。delivery.json / verified-release.json / SHA256SUMS.txt 供本地核对，Windows 上传只列三个实际资产，不递归上传工作目录。

-Fixture 仅用于调试演练：使用公共 RFC 根和合成源码身份，完整 ZIP 内保留 FIXTURE.txt，安装 EXE 名带 FIXTURE-NOT-FOR-DISTRIBUTION，安装应用名/AppId 与正式版分开。fixture 快捷方式使用隔离 instance-root 及有界退出；正式版不包含这些参数。默认正式入口拒绝该根，不能重命名 fixture 来发布。隔离验证保留真实 LNK 目标、Shell 提取图标及启动/Ready 事件；安装器自身图标不代替快捷方式证据。

安装器按当前用户的 Windows **显示语言**默认选择 English、简体中文或繁體中文，其他语言回退 English；不使用区域格式，也不复用以前安装保存的语言。`/LANG=english`、`/LANG=chinesesimplified`、`/LANG=chinesetraditional` 可显式覆盖。内置安装/卸载文字使用 SDK English 与仓库固定中文消息，自有安全提示随所选语言；保留正常退出要求，不终止运行中的 Ameow。

向导采用 `WizardSizePercent=100` 的原生紧凑比例并随 DPI 缩放；标题栏和安装完成页复用正式应用图标，向导页首不显示大图标。`delivery.json` 的 `installerSource` 记录安装器脚本所在 Commit/tree/dirty，`build` 仍为已签名应用核心身份；两者可能不同，不得将重打安装器称为该脚本 HEAD 的完整 App 构建。`installerResources` 与 `compilerMessages` 记录新增图标、简繁消息及 SDK English 字节，并在编译后复核。

正式上传前再核对 v<version> 精确指向签名构建 Commit；历史 Tag 永不移动/覆盖。私钥不进 Git/CI，本脚本不签名、不上传。生产可信根以 `assets/app-update-trust.json` 为准，签名验证使用所有者保管的独立可信公钥副本；构建或验签成功不代表已经公开发布。
