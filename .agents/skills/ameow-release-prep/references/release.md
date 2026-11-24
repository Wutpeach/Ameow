# Ameow 发行准备与公开交付

只有实际安装/打包、准备发 Tag 或正式发行任务才读取。先读 [distribution/packaging.md](../../../../distribution/packaging.md)、相关 Windows/Mac 交付指南与 OpenSpec 的 release-integrity；按改动补读相关能力。一般源码功能验收读 [acceptance.md](acceptance.md)，不以发行资产为前置。

## 准备候选

核实际版本：Cargo 包与锁文件、扩展 manifest/package/lock、生成的 Windows 版本资源/安装器及 Mac plist。按 [documentation.md](documentation.md) 核中英 README、手册、演示及未发布 Changelog，逐项记录更新或无需更新理由。历史记录保留原版本；真实资源发布前，公开链接继续指向现有资源。

冻结产品候选、触发完整 CI 前，先按 [acceptance.md](acceptance.md) 完成两平台最小回归及受影响流程，复用仍适用的结果，并列明环境受限或待人工事项。真实缺陷先修并收敛候选，再集中完整验证，避免把平台专属失败留到已冻结输入之后处理。

在已有同步授权下将批准的产品及配套文档同步 main，确定远端完整 commit/tree。本人先在主线验功能；仅实际安装、打包或正式发行需要时，从同一确定源码的干净检出准备 Win x64/MSVC 与 Mac arm64 资产，保留输入、工具链、二进制及签名/包回执。纯文档/工具提交不自动要求重打，比较实际构建输入，未知先核清。

复用 `scripts/package_portable.ps1`、`scripts/package_windows.ps1`、`scripts/package_macos.sh`、ameow-release 和现有 CI。它们负责构建、离线签名、包成员校验；不重复实现或生成新密钥。遵守既有密钥/sequence、独立可信根、新输出目录和本地温和构建要求。`test_release_preparation.ps1` 仅有三项工具测试，不证明发行就绪。

发行资产制成后补核实际包的安装/启动与受影响流程；源码手验与发行包自检分别记录来源、实际 exe/哈希与覆盖，不能声称尚未制作的资产已齐。证据格式、五项资产（0.5.2 起）和只读检查见 [evidence.md](evidence.md)。

## 完整验证的时机

只有用户明确说准备发 Tag 后，才把耗时完整验证集中到实际打 Tag 之前：稳定并同步最终 main，记录完整候选 SHA，手动执行：

~~~sh
gh workflow run rust.yml --ref main
~~~

核同仓库 main、准确 head_sha、workflow_dispatch、completed/success 与 run URL。保留现有完整 job 和断言，日常 push/PR 及 Tag 不自动触发 Rust 全套；Deploy Docs 继续原站点自动部署。修复期间按影响补验，候选稳定后再集中必要的完整复跑，打 Tag 前完整 CI 回执须对应最终候选 SHA。未跑、失败或旧 commit 成功不能记作当前 PASS；Windows CI 不替代 Mac、原生或本人验收。完整验证和工具 PASS 均不授予发行权限。

## 用户审稿与正式公开

提前将完整正文、重要文档和实际资产清单交来源伙伴核事实，再由用户审阅，包含新用户的下载选择与已有用户的升级路径；交稿可与已授权构建并行。按 documentation reference 整理上一正式版以来的完整变化和实际包用途，不把工程证据写进公开正文。已有最终稿的用户通过记录可复用，核实际发布的是同一份；伙伴自行审稿或技术回执齐全不能替代本人验收。

发布前读取仓库不可变发行设置及目标 Release 状态，明确发布后的资产/Tag 限制。用 Draft 汇集最终正文与完整资产，核对应关系后 Publish；不直接把准备稿连包公开，也不擅自切换仓库保护设置。已发布版本的修订先区分可改正文与锁定资产，不先承诺覆盖或删除重发。

用户验收通过、有明确发布授权且必要检查通过后，继续准确产品 commit 的 Tag/Release 与指定资产发布，无需逐步骤重问。授权不因跨会话自动失效；读了 Skill、准备好 Draft 或工具 PASS 本身不授予发布权限。

真正发布后回读公网 HTTPS 正文、下载用途、清单/资产和应用更新结果，再切换公开下载链接，不只核上传文件/hash。旧生产消费者的有界更新检查遵循 acceptance reference，静态契约/验签与真实升级分别下结论，缺入口保留未知。保留源码身份、原失败证据与验收记录，资产按当前保留/清理授权处理。
