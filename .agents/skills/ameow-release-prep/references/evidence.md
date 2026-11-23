# 只读入口的证据

从仓库根目录运行本 Skill 的 `scripts/check_release_readiness.py`，需要 Python 3.11+ 与 Git；先核实际 Python 版本，Windows 选择已确认的启动器，Mac 默认 python3 过旧时选现有 3.11+ 的路径，不自行安装。--repo、--evidence、--version、--commit 均参数化。默认 --phase source：核当前 main 对应远端、实际版本和功能证据，不接收/要求 ASSETS.json，不查询发行 CI，不构建或宣称发行资产齐备；输出 releaseAssetsStatus=NOT_PREPARED。只有实际安装/打包/发行检查才用 --phase release --assets <ASSETS.json>，此时在线 CI 另需现有 gh 登录，只读 GET；不可访问则 PENDING。JSON 写到 stdout，可重定向至独立交接目录。

~~~powershell
python .agents/skills/ameow-release-prep/scripts/check_release_readiness.py --phase source --version <版本> --commit <远端main完整commit> --evidence <功能证据.json>
~~~

发行阶段追加 `--phase release --assets <ASSETS.json>`（替换 source）。入口只读 Git/远端 main 和指定文件，发行阶段再查询准确 CI；不 build、push、签名、发 Tag、上传或驱动桌面。退出码 0=该阶段所列证据齐全，1=不一致/失败，2=待补证或人工；均不授予发布权限。仅验证工具本身时运行同目录的 `test_release_readiness.py`，它使用临时合成仓库与模拟 GitHub，不是产品/原生/生产签名测试。

源码阶段 evidence 只需 schema=1、phase=source、identity={version,commit,tree} 和 records。功能 PASS 的 source 写 kind=development、version、实际源码 commit/tree、buildInputsMatch=true、app={path,sha256}；涉及 CLI/host 时同样写实际 cli/host。执行者在实际构建/运行时确认输入对应该 commit 并记录，不从一个合法 commit 或事后 exe 哈希推导 buildInputsMatch。存在无关 dirty 时列出 dirty=true 与 dirtyPaths；实际开发输入 dirty/不一致拒绝，未知路径待核。原始报告相反字段不被索引覆盖。开发输入比较覆盖 Cargo/源码/资源/host/扩展与开发构建配置；纯打包/安装器/发行 CI 变化仍归独立发行自检，不强迫重复源码功能验收。源码手验不与 release exe 强行同哈希，也不要求为共享 target 留副本。Windows 默认 cargo run；Mac 依原生机制复用固定 main 开发 App。

只有已由负责者实际清理后，旧专用候选索引才标 status=RETIRED，附清理回执路径/hash。工具在读取旧资产前返回 PENDING/RETIRED，不要求补造包。当前源码索引独立保留旧索引及退役回执出处，不把旧包的 PASS 搬成主线来源不明的功能 PASS。用户验收始终须明确记录。

开发来源通常从 windows.* / mac.* 记录名确定平台；user-acceptance 可用 source.platform 声明本人实际平台。Mac 固定开发 App 的 package_macos.sh 与 logo 图标仍是其实际输入，不能当普通站点文档忽略；它们不改变 Windows cargo run 的证据身份。未指定平台的共同记录按双平台输入处理。原生 bundle/安装流程仍按实际改动追加验证。

发行阶段 ASSETS.json 复用现有格式：顶层 version/commit/tree、assets 数组，每项 name/relativePath/bytes/sha256/target，以及 ci.rust、ci.docs 的准确 run URL。relativePath 相对 ASSETS.json，忽略历史绝对 path。只有该阶段检查本版 Windows installer/portable/update ZIP/feed 与 Mac App ZIP/feed 六项；源码功能阶段不以它们为前置。

Rust 完整 CI 在用户说准备发 Tag 后、实际打 Tag 前，从最终 main 手动运行一次，不随日常 push/PR 或 Tag 自动触发。`ci.rust` 接受本仓库 `.github/workflows/rust.yml` 的 `workflow_dispatch` 回执，也兼容既有 `push` 回执；两者都必须来自本仓库 main，`head_sha` 精确等于产品 commit，状态 completed 且 conclusion=success。`ci.docs` 仍要求 `.github/workflows/deploy-docs.yml` 的 main push，SHA 对应 docs.commit；站点自动部署不变。URL、返回仓库及 head_repository 身份均须匹配 origin，其他分支/事件、旧 SHA、未完成或失败不能算 PASS。修订期间只按影响补验，最终完整回执仍须绑定最终候选，不把每个修订变成完整验证循环。

evidence.json 是轻量索引，不签发新权威。文件路径相对索引目录或显式绝对路径。以下是发行阶段示例，源码阶段省略 assetsSha256 与 windows/mac 打包回执：

~~~json
{
  "schema": 1,
  "phase": "release",
  "identity": {"version": "<版本>", "commit": "<产品commit>", "tree": "<tree>", "assetsSha256": "<ASSETS.json的SHA256>"},
  "windows": {"build": "<release-build.json>", "inputs": "<input-manifest.json>", "delivery": "<delivery.json>", "verified": "<verify-signed JSON回执>"},
  "mac": {"inputs": "<完整input-manifest.json或现有摘要>", "verified": "<signature-and-package-verified JSON回执>"},
  "records": [
    {"id": "docs", "status": "PASS", "commit": "<文档commit>", "note": "中英README/手册/演示/未发布Changelog已核；逐项写变更或无需更新理由", "files": [{"path": "<文档检查报告>", "sha256": "<报告SHA256>"}]},
    {"id": "windows.paste", "status": "PENDING", "note": "用户本人待验"},
    {"id": "user-acceptance", "status": "PENDING", "note": "候选交付后等待用户验收"}
  ]
}
~~~

两阶段功能记录 id：docs、user-acceptance；每个平台 windows/mac 的 startup、paste、download、cancel、extension、exit；Mac 另有 focus、full-compact、background、menu-bar。按改动可增加 id。状态 PASS/FAIL/PENDING，未知/缺项不算 PASS。PASS 附说明及报告哈希；源码功能 PASS 还须实际 development 来源，docs 提供当前 main 历史中的文档 commit。发行阶段未声明 source 的旧包记录维持原含义，显式 kind=package 须绑定产品身份。原始报告已有相反身份时不能靠改索引覆盖；未含身份时执行者在 note 写明绑定。工具不能判读报告是否充分证明 GUI 或批准，用户验收须原话或原生会话出处。

Windows inputs 应是现有 schema 2 回执，build 是 schema 3。检查其 sourceAndResources/packagingInputs 与产品 commit；保留 Windows CRLF 与 Git LF 差异的可解释匹配，不强求两个平台的字节清单哈希相同。Mac 支持分列回执，也直接支持既有 commit/tree/dirty/source/sourceInventorySha256 合并格式：按原数组核摘要与 Git 字节，并要求其中含 Mac 打包脚本、许可输入及图标。两平台按各自实际输入范围核对，不要求 Mac 的清单含 Windows vendor/notices。原件不改名、不拆写成另一格式。只有摘要、没有文件数组时仍列 PENDING。

后续 main 提交按实际构建输入判断。源码、资源、依赖、打包脚本/安装器及 Mac 图标输入变化返回 FAIL；纯文档与本 Skill/检查工具变化允许复用候选。未知路径返回 PENDING 等待判定，不静默当成文档。未提交输入变化同样列出；AGENTS 和已退役 Docs Sync 的历史状态不属于产品构建输入，外部修改不改写候选身份。状态文件保留历史审阅/失败事实，不能据旧 pending 恢复自动化或修补 PR53。docs.commit 后又改动发布相关文档/演示时，旧文档记录返回 PENDING，需补核最新文档及准确 Docs CI，产品候选不因此重打。

原始 JSON 报告已有的顶层 commit/head_sha、tree、语义版本、源码 SHA 与 app_sha256 会再次交叉核对，旧报告不能靠改索引标签变成新候选证据。嵌套或无结构报告仍需执行者审读其覆盖，不能仅凭文件哈希宣称交互/验收通过。

签名与成员校验仍由原工具负责，本入口只核既有验签回执与实际六项资产的绑定；不会重新验签、解包或执行候选。回执 PASS 只说明该回执记录了成功，不扩大其覆盖。线上发布检查和明确发布授权是后续独立步骤。

`docs` 的版本/链接/Docs CI 核对通过，不等于用户已经审阅最终发行说明或重要文档。另保留用户所审稿件/运行版本、资产用途与反馈；伙伴核事实及自动检查不能代替用户对体验的验收，也不把内部覆盖记录粘进公开日志。已有对应版本的用户通过记录可复用，不重复索取同一批准。公开前还需读取不可变设置并核 Draft 的最终内容，既有只读脚本不会代替这些操作。

更新验证记录实际运行的旧生产版本、EXE/App身份、目标feed和已观察阶段。仅旧公钥静态验签、当前源码fixture或新版NoUpdate，各自只证明其实际范围；不能据此写旧版Available/Ready/安装/重启PASS。此处只细化已有报告的解释，不新增证据JSON schema或要求重造历史报告。
