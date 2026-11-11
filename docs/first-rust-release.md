# 首次 Rust v0.5.0：最短发行操作与所有者交接

截至 2026-11-11，main 为 21c9153e27572ffc3c528ac9b30c505d48a68754（已合并文档 PR #35）。
本轮按 [#33 指令](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6785077059) 完善交接，**没有执行下列密钥、源码提交或发布操作**。
生产根仍为 keys=[]。下一次接入公钥后，应以届时最新的最终 Commit 统一重建；不能把 ffd09460 的旧 CI 构建当作正式包。
已验收的更新系统、发行工具及 CI #14/#15（381/0/19、离线 3/3、双资产 6/6）继续复用，不重复完整矩阵。

连续操作顺序：所有者准备密钥并交付公钥 → 接入公钥并固定源码 → 干净构建 → 所有者离线签名 → 验签与双资产 → 本机验收 → Tag/公开上传 → 公网 HTTPS 核对。
**构建前不需要 Tag**，没有 Gate A/B 或批准文件。下列命令只供后续分别获得密钥接入、源码保存及公开发行授权的会话执行；这些是实际操作边界，不是新增的软件审批状态。

## 1. 所有者亲自完成：一次密钥准备，仅交付公开公钥

在安全离线环境、仓库之外的加密存储上，先准备新的 X:/AmeowSigning 目录（两个输出文件均须不存在），使用经核对的现有 ameow-release 工具一次生成 Ed25519 密钥：

~~~powershell
$ErrorActionPreference = 'Stop'
$ownerTool = 'D:/ReviewedTools/ameow-release.exe'
& $ownerTool keygen X:/AmeowSigning/ameow-primary.pk8 X:/AmeowSigning/public.hex
if ($LASTEXITCODE -ne 0) { throw 'Key generation failed; preserve existing files and inspect before retrying' }
~~~

keygen 输出的 .pk8 是**未加密的 PKCS#8 私钥文件**，工具不提供密码保护；所有者负责加密存储、离线备份和恢复核对。
私钥不进入 Git、CI、Issue、聊天、日志或任何构建/发行产物，也不交给助手。若公钥输出等步骤失败，保留已有私钥并停止核对，不自动重新生成或覆盖。
public.hex 是可公开的 64 个十六进制字符（32 字节）公钥。只将它交给开发者，并通过独立渠道核对完整公钥；不得从候选包反向选取可信根。

接入公钥另获授权后，先准备公开输出的 D:/AmeowRelease 目录，用现有命令生成新的公开根文件：

~~~powershell
& $ownerTool import-public D:/Ameow/assets/app-update-trust.json D:/AmeowRelease/public.hex D:/AmeowRelease/public-roots.json
if ($LASTEXITCODE -ne 0) { throw 'Public root import rejected' }
~~~

其中 D:/AmeowRelease/public.hex 是所有者交付并经独立核对的公开文件。核对输出 schema=1、keys 中恰好包含所有者的真实公钥，再由开发者在获授权会话中将该公开 JSON 写入 assets/app-update-trust.json，正常保存源码为确定 Commit。
只复制公钥 JSON，绝不复制 .pk8。App、Launcher 和正式签名用 release tool 必须从这一份源码/公钥统一重建；上面的旧工具只用于生成密钥和导入公开公钥，不用于替代重建后的正式签名工具。
空生产根继续拒绝正式签名/打包；RFC fixture 根不能导入为正式根，也不能凭修改文件名变成正式资产。

## 2. 开发者：从最终干净 Commit 构建一次

在独立干净检出中核对 git rev-parse HEAD、Cargo 版本 0.5.0 和已编入的公钥。保留主开发目录无关 dirty 工作；不要在它上面清理/重置。
使用 Rust 1.98.1 / Windows x64 MSVC、Windows SDK、Inno Setup 6。先准备锁定的离线依赖，再使用新输出目录：

~~~powershell
$ErrorActionPreference = 'Stop'
cargo +1.98.1 fetch --locked --target x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw 'Dependency fetch failed' }
./scripts/package_portable.ps1 -TargetDirectory D:/AmeowRelease/target -OutputDirectory D:/AmeowRelease/0.5.0/build
~~~

现有入口执行 locked/offline、static CRT 构建和材料哈希核验，生成 App、Launcher、离线工具及 prepared。
release-build.json 应为该最终 Commit/tree、dirty=false、version=0.5.0、正确平台/公钥；tag=null 完全有效。
开发 dirty 候选仍可做未签名准备，但正式 sign 拒绝它。正式根尚未接入时只能生成未签名开发材料。

## 3. 所有者离线签名，再生成四类资产

把同一构建的 prepared 和经核对的重建工具移到所有者离线环境；独立可信公钥副本取自所有者留存记录。
所有者选择正整数 sequence，必须高于此前正式签发值、从未使用，不以同一 sequence 重签不同清单；首次正式签发可从 1 起。
issued 为当前 Unix 秒，不是到期时间；明显未来时间（超过接收方时钟 300 秒）会被拒绝。所有清单均无 expires，不需定期重签。

~~~powershell
$ErrorActionPreference = 'Stop'
$tool = 'D:/AmeowRelease/0.5.0/build/ameow-release.exe'
$prepared = 'D:/AmeowRelease/0.5.0/build/prepared'
$signed = 'D:/AmeowRelease/0.5.0/signed'
$roots = 'X:/AmeowSigning/public-roots.json'
$sequence = [UInt64](Read-Host '正式 sequence：正整数，须高于此前正式签发值')
$issued = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
& $tool verify $prepared
if ($LASTEXITCODE -ne 0) { throw 'Prepared input rejected' }
& $tool sign $prepared X:/AmeowSigning/ameow-primary.pk8 $signed $sequence $issued
if ($LASTEXITCODE -ne 0) { throw 'Signing rejected; stop and retain the original inputs' }
& $tool verify-signed $signed $roots
if ($LASTEXITCODE -ne 0) { throw 'Signed input rejected' }
~~~

将公开的 signed 目录交回具有同一源码/公钥和 Inno Setup 6 的构建/打包环境；私钥留在所有者离线存储，不随目录转移。按该环境的本地路径设置 tool、signed、roots，双资产入口会再次验签：

~~~powershell
$ErrorActionPreference = 'Stop'
./scripts/package_windows.ps1 -SignedDirectory $signed -ReleaseTool $tool -TrustedPublicRoots $roots -OutputDirectory D:/AmeowRelease/0.5.0/delivery
~~~

双资产脚本复用同一已验签核心、声明和 pending/Ready 初始状态，再生成：

| 文件 | 用途 |
| --- | --- |
| Ameow_0.5.0_windows_x64_installer.exe | Inno 安装版，稳定入口为 Launcher |
| Ameow_0.5.0_windows_x64_portable.zip | 完整解压后运行 AmeowLauncher.exe |
| Ameow-0.5.0-windows-x64.zip | 自动更新，严格只含 Ameow.exe |
| ameow-update-windows-x64.json | Ed25519 签名清单，无 expires |

delivery.json、verified-release.json、SHA256SUMS.txt 为本地核对记录，不递归上传构建/签名目录。
更新 ZIP 不重压缩、不混入 Launcher 或材料。两轮旧 CI 哈希不同，不宣称逐字节可复现；只使用**唯一最终签名构建**的文件、清单、成员和哈希，不混用不同运行的产物。
任一步非零退出或校验失败就停止，保留原件，按具体错误修正；不改成 fixture、不绕过验签，也不重新运行全部已通过测试来替代定位。

## 4. 最少的外部事实核对

| 项目 | 已有证据与所有者实际动作 |
| --- | --- |
| 许可正文/署名/材料 | 已有 13 项材料及清单，317 份正文、450 包图记录；LICENSE、THIRD_PARTY_NOTICES、清单及实际字节哈希随包校验，声明可离线阅读。最终候选保留这些材料，不以 SPDX 名称代替缺失正文。 |
| 9 项精确原文缺口 | inventory 的 packageTextGaps 如实列出版本。为实际适用的分发内容取得对应版本的权威文本/许可依据；现有 normal/build 图不证明每个包都已链接，也不证明缺口已解决。不开新一轮 450 包审计，不编造版权或 approved/blocked 字段。 |
| Ameow 品牌与改编图标 | 所有者确认品牌/素材的创作或授权事实；ISC/Feather MIT 已交付，三枚历史图标的确切来源 tag 仍有记录缺口，不能宣称已经找回。 |
| MSVC/Visual Studio | 所有者按最终实际构建主体确认本地 Community 使用资格及适用的生成代码/再分发条款。旧本机 Community 记录和 GitHub Runner 的 VS 镜像只证明各自环境，不自动证明主体资格；static CRT 也不等于豁免义务。 |
| 按需工具 | 当前四类应用资产不捆绑 yt-dlp、Deno、FFmpeg/ffprobe 或 gallery-dl，不需为尚未发生的工具捆绑新增制作流程；实际按需获取、许可/源代码义务仍按现有来源记录履行，不把下载机制当作权利豁免。 |

九项是 accesskit@0.24.1、accesskit_consumer@0.38.0、mac@0.1.1、rust-i18n-macro@4.2.4、rust-i18n-support@4.2.4、seahash@4.1.0、taffy@0.15.1、zune-core@0.4.12、zune-jpeg@0.4.21。
依据见 distribution/license-inputs.json、distribution/notices/rust-dependency-inventory.json、icon-licenses.txt、msvc-build-context.md、runtime-acquisition.md。
这些既有材料中的旧 private/blocked/Gate B 描述属于历史范围记录，不是当前脚本的批准状态；取消 Gate 也不代表第三方权利已确认。
Windows Authenticode 不作为首发门槛；未有该签名时 Windows 可能显示未知发布者/SmartScreen。

## 5. 唯一最终核心的定向验收，然后才公开上传

下一轮生产根、签名和发布操作获授权后，只做一次关键路径：

- **公开上传前**：从最终核心实际安装、通过 Launcher 启动并退出；便携包解压到新可写目录、通过 Launcher 启动。观察真实 Ready 将 pending 确认为当前版本，核对 About=0.5.0、离线声明与原有用户数据。复用 C3/C5 的卸载、回滚、降级/重放证据，不重做原生矩阵。
- 用最终核心的隔离副本做一次损坏候选拒绝检查，不修改母本；预期不执行/不确认损坏 EXE、不破坏已有安装。签名、来源、哈希、运行保护和 Ready 继续由现有机制校验。
- **公开上传后**：才核验真实公网 HTTPS 清单及包；尚无公开 Release 时不能把预期 404 当成已完成的网络验收。当前版本 0.5.0 检查同版清单应显示已是最新版，不为测试另造 0.5.1 Release。直接下载同一更新 ZIP 并与 delivery 哈希核对，结合真实安装 Ready 证据闭合首发路径。

公开上传前，先确认 Ameow 仓库的 origin 为 Wutpeach/Ameow，再在同一 PowerShell 会话核对四项文件；任何变化均先停止，尚不创建 Tag：

~~~powershell
$ErrorActionPreference = 'Stop'
$delivery = 'D:/AmeowRelease/0.5.0/delivery'
$receipt = Get-Content -LiteralPath (Join-Path $delivery 'delivery.json') -Raw | ConvertFrom-Json
$tag = 'v' + $receipt.build.version
$commit = $receipt.build.commit
if ($receipt.mode -cne 'PUBLIC' -or $receipt.fixture -or $receipt.build.dirty) { throw 'Not a production candidate' }
$names = @("Ameow_$($receipt.build.version)_windows_x64_installer.exe",
  "Ameow_$($receipt.build.version)_windows_x64_portable.zip",
  "Ameow-$($receipt.build.version)-windows-x64.zip", 'ameow-update-windows-x64.json')
function Assert-Asset([string]$Directory, [string]$Name) {
  $record = @($receipt.assets | Where-Object path -CEQ $Name)
  $path = Join-Path $Directory $Name
  if ($record.Count -ne 1 -or (Get-Item -LiteralPath $path).Length -ne $record[0].bytes -or
      (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $record[0].sha256) { throw "Changed release asset: $Name" }
  return $path
}
$files = @($names | ForEach-Object { Assert-Asset $delivery $_ })
~~~

四项哈希一致、用户明确授权公开发行后，再执行首次 Tag 分支及上传。已有远端 Tag 只核对其 Commit；不 fetch/覆盖本地同名 Tag，也不移动历史 Tag。

~~~powershell
function Get-RemoteTagCommit {
  $rows = @(git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$($tag)^{}")
  if ($LASTEXITCODE -ne 0) { throw 'Remote tag query failed' }
  $refs = @{}
  foreach ($row in $rows) {
    $parts = $row -split '\s+', 2
    $refs[$parts[1]] = $parts[0]
  }
  if ($refs.ContainsKey("refs/tags/$($tag)^{}")) { return $refs["refs/tags/$($tag)^{}"] }
  if ($refs.ContainsKey("refs/tags/$tag")) { return $refs["refs/tags/$tag"] }
  return $null
}
$remoteCommit = Get-RemoteTagCommit
if ($remoteCommit -and $remoteCommit -cne $commit) { throw 'Existing remote tag differs from signed build' }
if (-not $remoteCommit) {
  git cat-file -e "$($commit)^{commit}"
  if ($LASTEXITCODE -ne 0) { throw 'Signed build Commit is not available locally' }
  $localTags = @(git tag --list $tag)
  if ($LASTEXITCODE -ne 0) { throw 'Local tag query failed' }
  if ($localTags.Count -ne 0) {
    $localCommit = git rev-parse "refs/tags/$($tag)^{commit}"
    if ($LASTEXITCODE -ne 0 -or $localCommit -cne $commit) { throw 'Existing local tag differs from signed build' }
  } else {
    git tag -a $tag $commit -m "Ameow $tag"
    if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed' }
  }
  git -c push.followTags=false push origin "refs/tags/$($tag):refs/tags/$tag"
  if ($LASTEXITCODE -ne 0) { throw 'Tag push failed; inspect remote before retrying' }
}
if ((Get-RemoteTagCommit) -cne $commit) { throw 'Remote tag differs from signed build' }
gh release create $tag @files --repo Wutpeach/Ameow --verify-tag --latest --title "Ameow $tag (Rust)" --notes-file D:/AmeowRelease/0.5.0/release-notes.md
if ($LASTEXITCODE -ne 0) { throw 'Release publication failed; inspect GitHub before retrying' }
~~~

命令不使用 force/clobber。首个 Tag 不存在时先为已签名构建对应 Commit 创建并推送；若并发产生冲突，推送失败即停，不重试覆盖。
旧 v0.1.0、v0.3.1 永不移动。v0.5.0 在 2026-11-11 只读查询时未发现，真实发布时仍必须重新查询。
这次首次 Rust Release 有意设为 latest；无论 Tag 在构建前是否存在，最终 Tag 都必须指向同一签名构建 Commit。

## 6. 公开后：以普通 HTTPS 获取四文件并核对

仍使用上一步的 receipt、names 和 Assert-Asset，新目录中逐个下载，不带鉴权、不使用通配符或覆盖上传：

~~~powershell
$downloaded = 'D:/AmeowRelease/0.5.0/downloaded'
New-Item -ItemType Directory -Path $downloaded | Out-Null
foreach ($name in $names) {
  Invoke-WebRequest -Uri "https://github.com/Wutpeach/Ameow/releases/download/$tag/$name" -OutFile (Join-Path $downloaded $name)
  $null = Assert-Asset $downloaded $name
}
~~~

再让正式 App 的检查更新流程获取并验签真实 latest 清单；四文件与离线验签后的 delivery 哈希一致，才证明公网交付的是同一个核心。
保留这一构建的源码 Commit、公钥、签名及 delivery 哈希记录。当前仍未接入生产公钥、未签生产包、未执行最终安装/便携/HTTPS 验收；CI success 不替代这些事实。

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
