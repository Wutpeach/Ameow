---
name: ameow-release-prep
description: Ameow 发布前主线功能验收、版本与文档同步、发行准备和证据核对。默认已同步 main 与共享 target，按实际安装或发行需求准备 Windows/Mac 资产；不用于普通日常调试。
---

# Ameow 发布准备

发布前本人功能验收默认在已同步远端的根 main，复用共享 target。先准备好源码、版本、中英文档、配套 host/dist，再给启动入口：Windows 使用 cargo run；Mac 按系统原生机制需要复用固定 main 开发 App。无需为此额外制作 ZIP、专用验收包或专用入口。先读项目 AGENTS、CONTRIBUTING、distribution/packaging.md 与 OpenSpec 的 release-integrity；按改动再读相关能力。沿用现有 GitHub 任务和 Cindy 会话。

## 验证节奏

日常按风险只做必要局部检查，需要实际运行时才增量 build；功能/性能修复保留少量能证明正确与收益的定向检查。围绕稳定功能块集中验证，不随每次修改全量编译、跑整套测试或 CI。本人继续在根 main、共享 target 验收，不为验收造专用包。

只有用户明确说准备发 Tag 后，才把耗时完整验证集中到实际打 Tag 之前：稳定并同步最终 main，记录完整候选 SHA，手动执行 `gh workflow run rust.yml --ref main`，核同仓库 main、准确 head_sha、workflow_dispatch、completed/success 与 run URL。现有完整 job 和断言全部保留，日常 push/PR 及 Tag 不再自动触发 Rust 全套；Deploy Docs 保持原来的站点自动部署。修复期间按影响补验，候选稳定后再集中必要的完整复跑；打 Tag 前完整 CI 回执必须对应最终候选 SHA。未跑、失败或旧 commit 成功不能记作当前 PASS；Windows CI 不替代 Mac、原生或本人验收，完整验证通过也不自动授权发行。

## 准备与交付

1. 核对实际版本：Cargo 包与锁文件、扩展 manifest/package/lock、生成的 Windows 版本资源/安装器及 Mac plist。更新受影响的中英 README、手册、演示与未发布 Changelog。历史记录保留原版本；真实资源发布前，公开下载链接继续指向现有资源。
2. 将批准的产品及配套文档同步 main，确定远端对应的完整 commit/tree。本人先在该主线验收功能，保留实际 exe/App、源码身份及覆盖。只有实际安装、打包或正式发行需要时，才从同一确定源码的干净检出准备 Win x64/MSVC 与 Mac arm64 发行资产，记录输入、工具链、二进制及签名/包回执；不把专用包列为本人验收前置。纯文档/工具提交不自动要求重打，比较实际构建输入，未知先核清。
3. 复用 scripts/package_portable.ps1、package_windows.ps1、package_macos.sh、ameow-release 和现有 CI。构建、离线签名、包成员校验由它们负责，不在此重复实现或生成新密钥。遵守既有密钥/sequence、独立可信根和新输出目录规则。test_release_preparation.ps1 仅有三项工具测试，不能据此宣称发行就绪。
4. 每版两平台最小回归：启动、粘贴、普通下载、取消、扩展连接、退出；按本版改动追加必要流程。记录候选/可执行文件哈希、方法、结果与限制。真实故障先修；环境受限或待人工逐项列出，未知不能算 PASS。复用仍适用证据，不追加无关全产品矩阵。
5. 给本人准备好的主线启动命令/固定 App 和短功能验收清单。发行包构建与完整性自检由执行方按实际发行需求完成；两者分别记来源、实际 exe/哈希及覆盖。来源匹配的源码手验可用于功能验收，不能冒称已运行正式包，也不能声称尚未制作的发行资产已齐。用户验收通过且有明确发布授权后，才进行准确产品 commit 的 Tag/Release 与指定资产发布。工具 PASS 不授予发布权限。
6. 真正发布后再核公网 HTTPS 清单/资产/应用更新结果，随后切换公开下载链接。保留源码身份、原失败证据和验收记录；资产按当前保留/清理授权处理。

## 原生交互证据

Mac 通过 Mac 本机 Cindy 的 computer use 验证真实粘贴/焦点、Full ↔ Compact、后台与菜单栏交互。先发现当前目标电脑的实际能力，分别核对 Cindy 工具、driver 权限、SSH 进程权限及锁屏状态。SSH 的 AX=false 不能证明 Cindy/driver 无权限；不以 shell 模拟键鼠替代真实输入。锁屏或权限阻塞时写明具体缺项和恢复条件。

Windows 按用户选择使用自动检查加本人手验，不打开 computer use。两平台的自动、原生、本人验收各保留实际覆盖范围，不互相充当通过证明。

## 只读检查

在项目根目录运行。先核 Python 至少 3.11；Windows 使用已确认的启动器，Mac 默认 python3 不满足时，选择已安装的 3.11+ 实际路径，不自行安装环境：

~~~powershell
python scripts/check_release_readiness.py --phase source --version <版本> --commit <远端main完整commit> --evidence <功能证据.json>
~~~

源码阶段不要求六项资产，明确输出发行资产尚未准备/未检查。实际发行准备时使用 --phase release 并提供 --assets <ASSETS.json>，复用完整性回执。入口只读 Git/远端 main 和指定文件；发行阶段再查询准确 CI。不会 build、push、签名、发 Tag、上传或驱动桌面。缺少证据列 PENDING；已清理专用候选的旧索引标 RETIRED，不为检查补造包。格式见 [references/evidence.md](references/evidence.md)。退出码：0=该阶段所列证据齐全，1=不一致/失败，2=待补证或人工；均不授予发布权限。
