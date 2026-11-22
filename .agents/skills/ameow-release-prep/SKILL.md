---
name: ameow-release-prep
description: 准备 Ameow 发布候选，统一版本与文档，从确定源码构建 Windows/Mac 完整包，核对证据并交用户验收。用于发布准备和候选就绪检查，不用于日常 cargo run 调试。
---

# Ameow 发布准备

目标是交付用户可以直接启动的双平台完整候选、准确身份和一份短验收清单。先读项目 AGENTS、CONTRIBUTING、distribution/packaging.md 与 OpenSpec 的 release-integrity；按改动再读相关能力。沿用现有 GitHub 任务和 Cindy 会话，不另建发行系统。

## 准备与交付

1. 核对实际版本：Cargo 包与锁文件、扩展 manifest/package/lock、生成的 Windows 版本资源/安装器及 Mac plist。更新受影响的中英 README、手册、演示与未发布 Changelog。历史记录保留原版本；真实资源发布前，公开下载链接继续指向现有资源。
2. 将批准的产品及配套文档同步 main，确定完整 commit/tree。从同一确定源码的干净检出构建 Win x64/MSVC 与 Mac arm64；保留各平台实际输入、工具链、二进制、签名与包回执。构建不要求预先打 Tag。后续纯文档/工具提交不自动使候选失效；比较实际构建/打包输入，变化时修复并重建受影响候选，未知输入先核清。
3. 复用 scripts/package_portable.ps1、package_windows.ps1、package_macos.sh、ameow-release 和现有 CI。构建、离线签名、包成员校验由它们负责，不在此重复实现或生成新密钥。遵守既有密钥/sequence、独立可信根和新输出目录规则。test_release_preparation.ps1 仅有三项工具测试，不能据此宣称发行就绪。
4. 每版两平台最小回归：启动、粘贴、普通下载、取消、扩展连接、退出；按本版改动追加必要流程。记录候选/可执行文件哈希、方法、结果与限制。真实故障先修；环境受限或待人工逐项列出，未知不能算 PASS。复用仍适用证据，不追加无关全产品矩阵。
5. 交付真实安装/完整便携包与完整 Mac App ZIP、可直接启动的路径，以及短验收清单；用户无需自行构建。用下方只读入口核对身份和证据。用户验收通过且有明确发布授权后，才进行准确产品 commit 的 Tag/Release 与指定资产发布。工具 PASS 不授予发布权限。
6. 真正发布后再核公网 HTTPS 清单/资产/应用更新结果，随后切换公开下载链接。保留候选、原失败证据和用户验收记录。

## 原生交互证据

Mac 通过 Mac 本机 Cindy 的 computer use 验证真实粘贴/焦点、Full ↔ Compact、后台与菜单栏交互。先发现当前目标电脑的实际能力，分别核对 Cindy 工具、driver 权限、SSH 进程权限及锁屏状态。SSH 的 AX=false 不能证明 Cindy/driver 无权限；不以 shell 模拟键鼠替代真实输入。锁屏或权限阻塞时写明具体缺项和恢复条件。

Windows 按用户选择使用自动检查加本人手验，不打开 computer use。两平台的自动、原生、本人验收各保留实际覆盖范围，不互相充当通过证明。

## 只读检查

在项目根目录运行（Windows 使用已确认的 Python 3 启动器，Mac 使用 python3）：

~~~powershell
python scripts/check_release_readiness.py --version <版本> --commit <完整产品commit> --assets <ASSETS.json> --evidence <evidence.json>
~~~

入口只读 Git/远端 main、准确源码的 CI 和指定文件，向 stdout 输出 JSON。不会 build、push、签名、发 Tag、上传或驱动桌面。缺少 evidence 也可检查候选，证据缺项会明确返回 PENDING。回执参数与证据格式见 [references/evidence.md](references/evidence.md)。退出码：0=所列证据齐全，1=不一致/失败，2=待补证或人工；三者都不是发布授权。
