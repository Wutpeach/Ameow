# 首次 Rust 正式发行：最短操作路径

本轮依据 [#33 首次发行准备指令](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6756964913)，
并按 [0.5.0 与永久有效指令](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6759540545) 更新版本和清单语义。
这是待验收的操作说明，不是执行密钥、Tag 或公开发布的授权。当前生产根仍为空，材料 Gate B
仍 blocked；现有 C5 fixture 不能改名后发布。C5 原生安装/卸载与 Windows CI 的通过结果沿用。

首次 `v0.5.0` 必须包含 #32 的 GPUI Kit 迁移。迁移分支整合验证及网页侧复核通过后，
还需另行取得合入 main 的授权；当前 main 的旧 GPUI 构建不能直接作为正式首发产物。
本次整合将实际构建工具链统一为 Rust 1.98.1，并保留 AccessKit Windows 本地补丁；
下文使用整合后的依赖材料，历史 C1/C2 的 Rust 1.93.0 证据不改写。

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

## 一次性准备：仅在后续明确批准后执行

1. 用户确认发行主体，解决下面列出的实际材料/权属问题。沿用既有声明库存；
   审核实际分发字节及其 SHA-256 后，才在同一份 `distribution/license-inputs.json` 中将
   `scope` 设为 `public-release`、`publicGateB.status` 设为 `approved`、blockers 清空。
   不得只改状态字段以跳过未决材料；本轮没有修改该文件。
2. 用户批准一套 Ed25519 生产密钥与保管方式后，由所有者在离线、加密且权限受限的存储中
   使用现有 `ameow-release keygen`。立即保留离线加密备份，验证能从备份恢复并签名，
   把解锁材料另行保管。工具本身不负责加密或备份。具体命令与权限说明见
   [C2 保管步骤](application-update-stage-c2.md#production-signing-unexecuted-owner-runbook)。
   私钥只在所有者离线签名环境中使用，不进入仓库、Issue、Actions Secret、日志或 Release。
3. 独立核对公钥指纹，用现有 `import-public` 生成公钥配置提案；仅在获批后更新
   `assets/app-update-trust.json`。将最终版本同时反映到 Cargo.toml/Cargo.lock；
   App、Launcher、release tool 必须从同一批准源码和公钥配置重新构建。
4. 取得独立的提交/推送/Tag 授权，将已验收源码固定在新的 `v0.5.0`。从干净检出构建，
   不必清理或覆盖当前带其他未提交工作的开发目录。该 Tag 必须精确指向构建 HEAD。

Ed25519 是应用更新与发布身份签名；它不会给 EXE 增加 Windows Authenticode 发布者身份。
未做 Authenticode 的安装器可能显示未知发布者/SmartScreen 提示，应在实际首发时说明。

## 每次发行：构建一次，离线签名，再制作双资产

以下命令只供未来获批的发行会话使用。本轮没有运行生产 keygen/sign 或公钥导入。
使用新的输出目录；先将锁定依赖准备到离线 Cargo 缓存，并确认 Rust 1.98.1、MSVC、
Windows SDK 和 Inno Setup 6 可用。

```powershell
# 在已经获批、干净且精确位于版本 Tag 的检出中：
./scripts/package_portable.ps1 -BuildOnly -ReleasePreparation -PackageMode public-release `
  -TargetDirectory D:/AmeowRelease/target -OutputDirectory D:/AmeowRelease/0.5.0/build
```

此入口在构建前拒绝未批准材料、空/fixture 根、脏工作区及缺失/错误 Tag；材料必须与
库存实际哈希一致。release tool 继续核对其编入的版本与根。构建结果与 prepared 中
正式身份为 `public_gate_b=approved`、`license_review=approved`，不产生 CONTROLLED 标记。

把公开构建材料和经独立校验的工具移到离线所有者环境。独立可信公钥副本不能取自待验产物。

```powershell
$tool = 'D:/AmeowRelease/0.5.0/build/ameow-release.exe'
$prepared = 'D:/AmeowRelease/0.5.0/build/prepared'
$signed = 'D:/AmeowRelease/0.5.0/signed'
$roots = 'X:/AmeowSigning/approved-public-roots.json'
$issued = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
# sequence 必须由所有者选取从未使用过的、全局递增的值；此处不提供默认值。
& $tool verify $prepared
if ($LASTEXITCODE -ne 0) { throw 'Prepared input rejected' }
& $tool sign $prepared X:/AmeowSigning/ameow-primary.pk8 $signed $sequence $issued
if ($LASTEXITCODE -ne 0) { throw 'Signing rejected' }
& $tool verify-signed $signed $roots
if ($LASTEXITCODE -ne 0) { throw 'Signed input rejected' }
./scripts/package_windows.ps1 -PackageMode public-release -SignedDirectory $signed `
  -ReleaseTool $tool -TrustedPublicRoots $roots -OutputDirectory D:/AmeowRelease/0.5.0/delivery
```

双资产入口验证签名、当前批准材料与签名内库存的一致性，复用 Inno 编译；生成四项资产
和逐项哈希。正式模式拒绝 fixture 与 CONTROLLED 身份，fixture 演练始终有不可分发标记。

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
审核最终文件、Tag/Commit、签名时间及发布说明后，再取得用户明确的公开发布授权。

```powershell
$delivery = 'D:/AmeowRelease/0.5.0/delivery'
$receipt = Get-Content -LiteralPath (Join-Path $delivery 'delivery.json') -Raw | ConvertFrom-Json
$tag = 'v' + $receipt.build.version
if ($receipt.mode -cne 'PUBLIC' -or $receipt.publicGateB -cne 'approved') { throw 'Not a public release' }
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

## 真正仍待决定的事项

- **权属**：确认品牌素材可发行、实际开发主体符合 Visual Studio
  Community 使用资格与静态生成代码条款。既有 Penpot 导出链不代替权属声明。
- **材料**：已按 Kit 的 Windows normal/build 图同步为 450 个第三方包，沿用 C3 内嵌交付。
  9 项精确原文来源缺口为 accesskit 0.24.1、accesskit_consumer 0.38.0、mac 0.1.1、
  rust-i18n-macro 4.2.4、rust-i18n-support 4.2.4、seahash 4.1.0、taffy 0.15.1、
  zune-core 0.4.12、zune-jpeg 0.4.21。实际源码/.crate 中无独立精确正文来源的项目
  仍明确披露，需要权威材料或对现有声明的合格评估。Rust 标准库声明同步至 1.98.1。
  三个旧图标 tag 缺口与按需下载工具义务基于既有披露判断，不再全量重审历史。
- **生产操作**：一套离线生产密钥与加密备份、公钥编入重建、最终包一次关键验证，
  以及提交/推送/Tag/Release/公开上传授权，均等待后续明确批准。

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
