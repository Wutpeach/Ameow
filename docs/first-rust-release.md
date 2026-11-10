# 首次 Rust 正式发行：最短操作路径

按 [#33 最新简化要求](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6767912509)，发行工具已取消 Gate A/B 人工审批与构建前强制 Tag。#32 的 GPUI Kit 已进入 main=5e2eb3a4，工具链为 Rust 1.98.1；后续从包含已验收发行修改的确定 Commit 构建。历史阶段证据保留，不重复全套原生验收。

当前生产公钥仍为空。本说明不授权本轮生产密钥、Tag/Release 或上传操作；fixture 不能改名当作正式包。

## 已确认版本与四类资产

2026-11-10 实时核对：历史 `v0.1.0` 指向 `a6b2b262c2c185f85557a274b6e2060c053fbe9a`；
旧 Electron 最后正式版本为 `v0.3.1`，Tag 指向 `07ff76991d91a85f8910376dce80a3b98e83b904`。
用户已确认首次 Rust 正式版使用 **0.5.0 / v0.5.0**；2026-11-10 查询该 Tag 未占用。
Cargo.toml/Cargo.lock 中 Ameow 自身版本已同步为 0.5.0。发布前再次检查远端，永不移动历史 Tag。

同一次 GitHub Release 只需四类应用资产：

| 文件 | 用途 |
| --- | --- |
| `Ameow_0.5.0_windows_x64_installer.exe` | Inno 默认浅色安装向导，稳定入口为 Launcher |
| `Ameow_0.5.0_windows_x64_portable.zip` | 整包解压后运行 `AmeowLauncher.exe` |
| `Ameow-0.5.0-windows-x64.zip` | 自动更新专用，严格只有 `Ameow.exe` |
| `ameow-update-windows-x64.json` | 既有 Ed25519 签名更新清单 |

`delivery.json`、`verified-release.json` 与 `SHA256SUMS.txt` 用于本地核对，禁止递归上传
构建目录、payload、离线签名目录或工具。安装版与便携版使用同一已验签核心和声明；
更新 ZIP 不重压缩、不加入 Launcher 或许可文件，版本对应的声明已经内嵌在 EXE 中。

## 必要准备

1. 所有者决定发行主体并履行实际第三方许可、声明/源代码和工具分发义务；库存记录实际材料、字节哈希及来源缺口，不设置 approved/blocked 字段。
2. 所有者在离线环境保管 Ed25519 私钥，留存可恢复的加密备份；私钥不进入 Git、CI、Issue、日志或产物。仅编入独立核对过的公开可信根，App、Launcher 和离线工具使用同一份源码和公钥配置。
3. 将最终源码固定为一个 Commit，在独立干净检出中构建；无需先创建版本 Tag，也无需清理带有其它任务修改的主工作区。Tag 留到候选验证后、正式上传前建立并核对，禁止覆盖历史 Tag。

Ed25519 用于应用更新和发行身份，不等于 Windows Authenticode。首发不要求购买 Authenticode 证书；无该签名时 Windows 可能显示未知发布者或 SmartScreen 提示。

## 每次发行：构建一次，离线签名，再制作双资产

以下命令只供未来获批的发行会话使用。本轮没有运行生产 keygen/sign 或公钥导入。
使用新的输出目录；先将锁定依赖准备到离线 Cargo 缓存，并确认 Rust 1.98.1、MSVC、
Windows SDK 和 Inno Setup 6 可用。

```powershell
# 在独立、干净、精确位于发行 Commit 的检出中；此时可以没有 Tag：
./scripts/package_portable.ps1 `
  -TargetDirectory D:/AmeowRelease/target -OutputDirectory D:/AmeowRelease/0.5.0/build
```

构建默认一次生成 App、Launcher、离线工具及未签名准备目录，不读取人工审核文件。材料字节必须与清单哈希一致。开发工作区的脏输入可生成未签名开发候选，真实 dirty 状态会被记录，正式签名拒绝它。确定的干净 Commit 即可成为正式候选，无需已有 Tag。

把公开构建材料和经独立校验的工具移到离线所有者环境。独立可信公钥副本不能取自待验产物。

```powershell
$tool = 'D:/AmeowRelease/0.5.0/build/ameow-release.exe'
$prepared = 'D:/AmeowRelease/0.5.0/build/prepared'
$signed = 'D:/AmeowRelease/0.5.0/signed'
$roots = 'X:/AmeowSigning/public-roots.json'
$issued = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
# sequence 必须由所有者选取从未使用过的、全局递增的值；此处不提供默认值。
& $tool verify $prepared
if ($LASTEXITCODE -ne 0) { throw 'Prepared input rejected' }
& $tool sign $prepared X:/AmeowSigning/ameow-primary.pk8 $signed $sequence $issued
if ($LASTEXITCODE -ne 0) { throw 'Signing rejected' }
& $tool verify-signed $signed $roots
if ($LASTEXITCODE -ne 0) { throw 'Signed input rejected' }
./scripts/package_windows.ps1 -SignedDirectory $signed `
  -ReleaseTool $tool -TrustedPublicRoots $roots -OutputDirectory D:/AmeowRelease/0.5.0/delivery
```

双资产入口验证真实签名、编入可信根、签名核心中的材料及哈希，复用 Inno 生成四项资产。正式入口拒绝空可信根、fixture/test key、伪造身份和篡改。fixture 演练始终使用明确文件名和测试身份，不作为正式资产。

安装版、便携版、签名清单与对应更新 ZIP 永久有效。清单不含 `expires`，sign 命令也没有
到期参数；`issued` 只记录签发时间，保留明显未来时间的合理性检查。安装登记、更新检查、
更新准备和离线启动复用同一无到期语义，不要求定期重签或上传。不以大日期代替永久。
防重放/防降级依赖已签名版本、全局递增 sequence 和本地状态；签名、哈希、来源身份、
运行保护、Ready 与回滚仍强制校验。8 天、30 天、5 年仅为测试样本，不是运行期限。
未公开 Rust 草稿中的 `expires` 由严格字段解析拒绝，须用新工具重建演练材料；
不为旧 Electron 或旧草稿新增兼容协议，历史证据保留原样。

## 用户批准发布后：一次 GitHub Release 上传

先实际启动最终生产根包中的 Launcher，完成一次安装/启动/退出，以及便携启动和更新
清单 HTTPS 获取核验；复用 C5 未受影响的卸载与安全证据，不再跑全套安装器设计验收。
核对最终文件、Commit、签名时间及发布说明，由用户决定是否公开上传。此时才为该 Commit 创建版本 Tag；先检查远端同名 Tag，已有时核对且绝不覆盖。创建/推送 Tag 与上传仍是用户明确选择的发布操作。

```powershell
$delivery = 'D:/AmeowRelease/0.5.0/delivery'
$receipt = Get-Content -LiteralPath (Join-Path $delivery 'delivery.json') -Raw | ConvertFrom-Json
$tag = 'v' + $receipt.build.version
if ($receipt.mode -cne 'PUBLIC' -or $receipt.fixture -or $receipt.build.dirty) { throw 'Not a production candidate' }
git fetch origin "refs/tags/${tag}:refs/tags/${tag}"
if ($LASTEXITCODE -ne 0) { throw 'Remote tag verification failed' }
if ((git rev-parse "${tag}^{commit}") -cne $receipt.build.commit) { throw 'Remote tag differs from signed build' }
$names = @("Ameow_$($receipt.build.version)_windows_x64_installer.exe",
  "Ameow_$($receipt.build.version)_windows_x64_portable.zip",
  "Ameow-$($receipt.build.version)-windows-x64.zip", 'ameow-update-windows-x64.json')
$files = @($names | ForEach-Object {
  $name = $_
  $record = @($receipt.assets | Where-Object path -CEQ $name)
  $path = Join-Path $delivery $name
  if ($record.Count -ne 1 -or (Get-Item -LiteralPath $path).Length -ne $record[0].bytes -or
      (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $record[0].sha256) { throw "Changed release asset: $name" }
  $path
})
gh release create $tag @files --repo Wutpeach/Ameow --verify-tag --latest `
  --title "Ameow $tag (Rust)" --notes-file D:/AmeowRelease/0.5.0/release-notes.md
if ($LASTEXITCODE -ne 0) { throw 'Release publication failed; inspect GitHub before retrying' }
```

这一步有意让首次 Rust 正式版成为 latest；本轮没有执行它。不要使用覆盖上传、递归通配符
或旧 `latest.json`。完成后重新下载四项资产核对哈希，确认正式更新清单 URL 可获取。

## 自定义发行门槛审查

| 项目 | 处理与理由 |
| --- | --- |
| Gate B 的状态、scope、批准清单和双重审批字段 | 已移除；它们不提供签名或完整性保证 |
| Gate A 审核人/时间/证据文件与独立私有 ZIP 路径 | 已移除；复用同一未签名准备和已签名打包路径 |
| 构建前必须有版本 Tag | 已移除；最终上传时用 --verify-tag 核对版本和同一 Commit |
| BuildOnly + ReleasePreparation + PackageMode 及永久失败 public-release 命令 | 已移除；一个构建入口，不新增发布平台 |
| 干净 Commit、版本/平台、编入可信根、签名和材料哈希 | 保留；分别保证来源身份、真实性和完整性 |
| 私钥离线、不进 Git/CI，Ready/防降级/重放/回滚 | 保留；保护密钥和已安装应用 |
| Authenticode 证书 | 不作为首发门槛 |
| 第三方许可/源代码/署名、品牌权属、Visual Studio 资格 | 真实外部义务；由发行主体履行，不做打包审批变量 |

仍需实际完成：所有者准备并保管真实 Ed25519 密钥、编入公钥后固定源码 Commit；从独立干净检出构建、离线签名并核验最终安装/便携包及 HTTPS 更新来源；决定是否创建 Tag 和公开上传四项资产。

材料沿用 450 个第三方包的实际库存。9 项精确原文来源缺口（accesskit、accesskit_consumer、mac、rust-i18n-macro、rust-i18n-support、seahash、taffy、zune-core、zune-jpeg）及历史图标 tag、按需工具义务继续在既有材料中披露；这不代表权属已确认，也不重新启动全量许可审计。

## 现有依赖告警的有界判断

2026-11-10 的 8 项 open Dependabot 均属于当前 Cargo.lock，并非 Electron 历史告警。
zip 2.4.2 的 critical/high 分别涉及流式/中央目录跨解析器差异与 extract 的 symlink 路径，
另一个涉及 AES 密码解密。现有代码使用已校验哈希的归档、固定成员和固定新建目标，
未调用 ZipStreamReader、extract 或密码解密 API；未发现所述完整攻击链。
rustls 0.23.45 的四项告警涉及 Brotli、定制 session Debug、预测缓存与 ECH 条件；
当前未启用 Brotli/ECH、没有定制敏感 session Debug，实现未证实满足完整触发条件。
grid 0.18.0 的 expand_rows 溢出路径在当前 taffy/应用中未发现调用。

这是针对实际分发路径的有限判断，不是依赖无漏洞的证明。当前不为清空告警盲升 zip/grid
主版本；rustls 0.23.46 是可独立验证的后续小版本更新。告警与后续更新风险仍保留：
[zip #223](https://github.com/Wutpeach/Ameow/security/dependabot/223)、
[#224](https://github.com/Wutpeach/Ameow/security/dependabot/224)、
[#225](https://github.com/Wutpeach/Ameow/security/dependabot/225)、
[rustls #219–222](https://github.com/Wutpeach/Ameow/security/dependabot/220)、
[grid #218](https://github.com/Wutpeach/Ameow/security/dependabot/218)。
