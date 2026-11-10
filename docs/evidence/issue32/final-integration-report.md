# #32 GPUI Kit 最终整合交接（2026-11-10）

已在迁移分支整合 main 的 Rust 0.5.0、永久有效更新与发行准备，完成工程检查和本轮可用的 Windows 原生联合验证。结果供网页侧复核；尚未合入 main，真实 Medium Shell 托盘仍 PENDING。

授权：[最终整合指令](https://github.com/Wutpeach/Ameow/issues/32#issuecomment-6760659657)。

## 提交与保全

- 分支：`feature/gpui-kit-migration`，工作树 `D:/Ameow-gpui-kit`。
- 合并提交：`45b9f3f02966bf1217a6b7f4236901f368122efc`；两个 parent 为迁移基线 `580acfc1e5acc0db9d282c90c222f983f15f5234` 与 main `acd8c7db380e5674370b70998200cf614de33a5c`。
- 后续修复：`9e93d1637dab7cb8efe6dcb13ef3180b37e8e1f4`，只将 GPL 材料清单对齐到 Git 中的原始 LF 字节。
- main 的 HEAD、暂存区及 15 条工作区状态未改变；中断前快照的 1,607 个文件哈希全部一致。迁移既有 EXE 与证据未覆盖，新结果使用独立目录。

## 最终实现

保留 `gpui-pre=0.3.11`、Base/Component `0.9.0`、AccessKit TLS 补丁、Component Select、Base 主题投影、Gallery、Windows 动效和磁吸既有实现。保留 main 的应用更新服务、About/Full/托盘入口、Ready/回滚/单实例保护、Inno/便携 ZIP/单 EXE 更新包及永久无 `expires` 签名清单。

处理 Cargo.toml、main、preview、settings_window 四处文本冲突；新 About/许可页适配 GPUI 的焦点参数和 Root 内容访问，预览保留 Full 更新场景语义。Rust 工具链、CI、发行脚本、发行验证器与 fixture 统一为 `1.98.1`；源码审计输入增加工具链文件和完整本地 AccessKit 补丁目录，Actions 路径触发条件同步覆盖。

Windows normal/build 依赖材料同步为 450 个第三方包，标准库材料来自安装的官方 Rust 1.98.1 文档。9 项精确正文来源缺口继续披露：accesskit 0.24.1、accesskit_consumer 0.38.0、mac 0.1.1、rust-i18n-macro 4.2.4、rust-i18n-support 4.2.4、seahash 4.1.0、taffy 0.15.1、zune-core 0.4.12、zune-jpeg 0.4.21。Gate B 保持 blocked。

独立干净检出发现 GPL 材料曾按旧工作树 CRLF 字节记哈希，而 Git 保存 LF。恢复 Git 原始文件并把清单对齐到 `8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903`；无需更改许可正文或已有历史证据。全部 13 项材料已在干净检出中逐项复核。

## 实际验证

| 范围 | 结果与界限 |
| --- | --- |
| Windows 编译 | 新工具链全目标 check、Debug build、静态 CRT Release build 通过。许可修复后重新生成受控 Release，未复用旧材料产物。 |
| Rust 默认并行完整测试 | 许可修复前后均为 380 passed、0 failed、19 ignored；不把忽略项列为通过。 |
| 发行命令边界 | 修复后 4/4：公开包/公开工具/CI keygen/CI sign 均拒绝且无对应输出。 |
| Inno 与双资产 | 修复后 6/6：生产空根及公开模式拒绝、篡改拒绝、Inno 编译、共享内核/材料哈希、单 EXE 更新 ZIP。未重新运行安装/卸载，沿用未受影响的既有 C5 证据。 |
| 永久清单 | 真实 fixture 清单版本为 0.5.0，无 `expires`；更新 ZIP 仅有 `Ameow.exe`。仅 RFC 测试签名，不是生产发行。 |
| 独立未来 main 检查 | 在独立 detached 干净工作树从 acd8c7db fast-forward 到整合/修复提交，无冲突；locked/offline Cargo metadata、13 项材料 SHA-256 通过。 |

最终受控 Release `Ameow.exe` SHA-256：`f4b029048de933fb9c8c62984eb18581c21743454ec7d5d3044077ecbcab9fb8`。构建身份如实记录为生成时 HEAD 加 dirty 文件哈希，不将预提交构建冒充提交后重建。修复后 172 个源码/资源、7 个发行输入、17 个验证输入均与最终构建记录匹配。

Windows 原生由用户亲自操作，助手只启动隔离实例、读取日志及截图：

- Component 的主题/语言/托盘图标下拉框与 Tab/方向键/Enter/Esc、关闭重开和 ACK，由中断前本轮人工确认；test-only 设置宿主退出码 0，无 stderr。
- About 下载完成并显示更新已就绪；用户确认 Full 更新提示检查完成。真实 Shell 托盘入口没有取得本轮 PASS。
- 用户点击重启后直接完成更新，空闲路径没有“稍后”确认框。日志顺序为 queue-drained-before-restart → 旧进程退出 → restart-requested-after-process-exit → 0.5.1 spawned → ready。current=0.5.1、previous=0.5.0、pending/trial 为空、last_error=null；新版 PID 19576 为 Medium、非提升权限。0.5.1 仅是隔离测试身份。
- 重启后使用隔离路径制造一次真实保存失败；用户确认选择/主题回退，恢复路径后确认保存成功及重新打开保留。原始失败截图保留。
- 用户确认 Gallery 关于/应用更新场景及 Light/Dark 切换正常，Gallery 退出码 0；未跑全量截图，目录现为 main 带来的 119 个场景。
- 用户正常退出更新实例，Launcher 日志记录新版 exited，测试进程均结束；中断前启动包装器未留下最终 Launcher exit-code 文件，不补写退出码。

## 未解决项与复用范围

更新前 0.5.0 与更新后 0.5.1 均记录 Shell_NotifyIcon 注册失败 `0x80070005`。本机既有 #33 记录为 High Explorer / Medium 应用，普通用户 Shell 联合验收继续 PENDING；权限差异尚未被证明是唯一根因。不得用 fixture 打开菜单、Gallery 截图或高权限样本替代真实 Shell 验收。

用户在前一设置宿主中反馈托盘菜单延迟和动画缺失。代码仍保留相同 130ms fade 与 Reduced Motion 分支，源码审查未建立整合回归；本轮更新夹具无真实托盘入口，未取得有效复现或排除证据。此项保留为未定位观察，不标已修复。

Compact↔Full、磁吸既有验收和未改的更新安全拒绝/回滚原生证据继续复用；没有重新测全套业务下载、排队更新、回滚、启动项、混合 DPI/跨屏、macOS 或 GPU Present。开始收起时磁吸约 5.7px 直接归零的已知残留保持不变。许可换行修复未改变 UI/更新逻辑，未为其重复占用桌面。

## 证据与下一步

原始证据根：`D:/Ameow-kit-final-evidence-20261110-143703-739057`。

- 最终构建/审计：`controlled-build-canonical/`；原始构建另保留在 `controlled-build/`。
- 最终测试：`canonical-tests-default.log`。
- 最终边界：`release-boundaries-canonical/result.json`。
- 最终双资产：`windows-delivery-canonical-r2/result.json` 与 `valid/delivery.json`。初次使用未启用 feature 的 fixture 工具、以及生产工具拒绝测试签名的尝试保留在原日志，不计成功样本；显式 debug fixture 重建后通过。
- 原生：`settings-native/`、`update-native/`、`gallery-native/`，保留二进制身份、截图、ACK/命令、Launcher 与状态日志。
- 保全：`before.json`、`resumed-integrity.json`；未来 main：`future-main-result.json` 及对应 ff/metadata 日志。
- [机器摘要](final-integration-validation.json)。

网页侧需复核本次提交、原生结果与明确未验证项，决定真实 Shell/菜单观察是否需要先补验；之后另行授权最终 main 整合。届时先重新核对 main SHA/dirty 保全，若仍为 acd8c7db，可 fast-forward 到迁移分支最终 HEAD；若 main 已前进，先在独立工作树重新整合和定向验证。全部迁移历史需保留，不复制或覆盖主线 dirty 文件。

本轮无 push/PR/main merge、Tag/Release、生产密钥操作、Gate B 放行、安装包公开上传、Issue 关闭或 Project 状态变更。正式 v0.5.0 继续等待 GPUI Kit 合入及后续发行授权。
