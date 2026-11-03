# #18 Rust 正式主线接管：候选交付

授权：[GitHub #18](https://github.com/Wutpeach/Ameow/issues/18)。已完成独立候选整理，供网页 GPT 集中验收；不合并 main、不公开发布、不删除历史分支/工作树。完整结构与恢复限制见 [仓库交接](../../docs/repository-handoff.md)，机器收据见 [validation-receipt.json](../../docs/validation-receipt.json)。

## 2026-11-04 验收 Repair

修复提交 `fd009274045a3e5e21278fc5b861353ab9669ee6`。Windows CI 初次 `cargo test --locked` 的 3 个失败已定位为签名夹具检出换行转换：原 blob 1595 bytes / 19 LF，`core.autocrlf=true` 检出变成 1614 bytes / 19 CRLF；在独立检出复现同名 3 个签名失败。新增 `.gitattributes` 的签名夹具 `-text`，并补充 CRLF 改写必须验签失败的断言。生产验签、信任/缓存逻辑、官方签名和 key 未改；没有跳过测试或降低安全边界。Rust CI 路径同时覆盖 `.gitattributes`。

全新 `core.autocrlf=true` 检出在修复后保留 1595 bytes，SHA256 `0d7ec4303a02bcbe66154d478852cdf2e07688d39dc4597316e4424ac4e74356` 与 blob 相同，按相同 Git 配置检查工作区干净；签名 2 + 信任 6 项定向 release 测试全部通过。已有检出仅切换 commit/restore 可能沿用旧工作区字节，不能据此代替新的 Windows 检出验证。最终 GitHub CI 的精确 head/run/result 以 #18 Repair 回写为准。

复用产品输入未变的已构建 EXE（哈希同原报告），新生产进程 PID 99224 使用独立测试设置，经原生 `T` 按键深色/浅色往返，两次 `save-settings` / `settings-saved` 与落盘值匹配；实际画面见 [紧凑证据](../../docs/evidence/issue18-repair-native.png)。真实用户设置和 Run/StartupApproved 核对未变，退出时无进行中任务。前台 `Alt+F4` 的窗口消失后置条件稳定满足，父进程等到候选正常返回 **exit 0**，没有强杀。原先保留的 PID 60672 也已通过相同正常关闭操作退出。

本节补齐设置偏好保存与空闲正常退出，取代下文早期这两项 NOT VERIFIED；主表面菜单和完整设置窗口点击本轮仍未重新验收，复用 #15 原范围。本机日志以 `repair-` 前缀保存，结构化结果见 [Repair 收据](../../docs/issue18-repair-receipt.json)。其余构建、Pages、保全与历史产品验收复用，未重新跑媒体矩阵，未 merge/main 清理或发行。

## 提交与改动

实现提交 `41150f7c311a6c1ac8be31e69a328d6c83c0f95c`，父提交为已接受的 Rust `7f8d3b36`。分支 `takeover/rust-official-18`，候选工作树 `D:/Ameow-worktrees/rust-official-18`，干净验证检出 `D:/Ameow-worktrees/rust-official-18-verify`。后续仅有交接资料提交，不改变已构建产品输入。

- 根级 Rust Cargo/src/tests/assets/distribution；旧 Electron/React/Vite/根 Node 应用及旧自动发行流程退役。
- 包/bin 为 ameow，内部 lib 为 ameow_next；EXE/窗口/安全诊断/Windows 产品元数据使用 Ameow，实际版本 0.1.0。
- 保留 AmeowNext 用户数据目录、Run 值、mutex/event。不自动注册/移动用户数据；旧启动项和快捷方式按 README 修复。
- Pages 独立使用 site 依赖；PR 仅构建，main 才部署到原地址。旧 Electron v0.3.1 公开包仍保留，Rust 无公开包；关键站点入口明确范围，全文更新留 #19。

迁移前 187 项 Rust 包文件中，130 项原 blob 相同、38 项历史实验脚本退役、19 项有必要命名/入口/文档改动。55 项资源、9 项测试、3 个示例完全相同；51 项 Rust 源码只有 6 项命名或兼容注释差异。依赖和 Rust 自有许可证保持相同；Cargo.lock 仅改根包名。见 [迁移映射](../../docs/rust-migration-proof.json) 与 [精简源码差异](../../docs/rust-identity.diff)。

## 保全验证

本机 `D:/Ameow-preservation/issue-18-20261103/`：

- Electron dirty 快照：`07fcdf0c0f1ffbe8eb0ae23f70a9db0c46c1eaca`，`preservation/issue18-electron-20261103`。
- 扩展 dirty 快照：`4163b63074618c4abe515a191300865ff91b7ee3`，`preservation/issue18-extension-20261103`。
- 全 refs bundle：2,043,835,395 bytes；SHA256 `39f079c92c1890598b0e892f65d2085400bb7b83b47c12f485bb11a97c7d7803`。独立镜像 clone/fsck 与两快照完整 tree 对比均 PASS。包含旧发布 Tags、runner 14819d1d、原 main、扩展与 Rust 历史引用。仅本机，不上传 bundle/私有快照。
- 4 个非临时嵌套 fixture 的 254 个文件原样 ZIP 保存，逐文件 SHA 和 ZIP 完整性核对通过。首次广泛 git add 因嵌套无提交仓库失败，未改原暂存区；随后明确排除并单独归档成功。
- 候选移出的 99 个路径保存于 candidate-retired/，有 moves.json；旧原工作树未删。临时 .trellis/tmp scratch 及忽略的 EXE/缓存/媒体没有纳入本次 Git 快照，仍留在原位；不据此认证旧工作树可删。

## 实际验证

干净检出最初无 tracked/untracked 状态；最终产品在 `41150f7c` 上通过。

- `scripts/package_portable.ps1 -BuildOnly`，锁文件/离线 Cargo/release/x86_64-pc-windows-msvc/static CRT：PASS。首次全依赖构建 5m10s；修正格式与元数据后的相同 target 增量构建 16.63s。未生成私有 ZIP 或公开包。
- `Ameow.exe`：19,344,384 bytes；SHA256 `C44C757C17D7296413961A2FA27F798542395C318FAA00EB8CAC12DA9A517850`。Windows ProductName/FileDescription=Ameow、OriginalFilename=Ameow.exe、ProductVersion=0.1.0。原图标验证工具 PASS，55 项品牌/其他资源不变。
- 定向 release 测试 **27 passed / 0 failed / 3 ignored**：设置兼容 4、启动/单实例 3、下载契约 9（另 3 genuine-runtime ignored）、通用边界 2、Windows supervisor 9。未把 ignored 当通过，未重新跑 T04 全量或真实公网媒体矩阵。
- 实际 Windows 原生生产启动：标题 Ameow，复用默认用户缓存，约 2350ms Ready；yt-dlp 2026.08.19、Deno 2.9.7、FFmpeg N-127264-gf5d4fd186c-20261009 真实验证。当前 attempt 无 Downloading/Acquire。第二实例 exit 0，保留原实例。用户原设置字节与真实启动项/批准状态核对未变。
- 远程驱动对菜单/拖动/Alt+F4 返回 unknown，观察未证明动作结果；这些交互和正常退出 **NOT VERIFIED**。未绕过驱动或强杀，候选进程 60672 空闲保留供人工验收。必要启动、版本/图标、缓存 Ready 与单实例有独立实际证据；原 #15–#17 已接受交互范围复用。
- Pages：干净检出用 Node 22.19.0、独立 npm ci/build，**63 pages / 6 required routes PASS**。站点 tree `d41017bd4cfe9b65a063128935f78f211e0a47b6` 与最终实现完全相同，未重复构建相同站点。早期不支持的 banner 配置与旧根 PostCSS 干扰已修复/随旧工程退役，最终构建不依赖根 Node。
- 包装入口拒绝 public-release、缺失私有 review 和缺少模式：3/3 PASS，均未创建输出目录。Git diff whitespace 检查通过。

实际日志、manifest、紧凑窗口截图和原始 telemetry 位于 `D:/Ameow-artifacts/issue18-20261103/`。这些路径不是公开下载附件。Windows 开发机运行不是干净非管理员 Portable 或完整产品回归验收。

## 复用与风险

复用 #14 已完成收敛、#15 设置、#16 图标、#17 签名与离线恢复的原始审查/测试/人工验收，不重复已完成工作，也不将其未测项抹去。

- 实际登录启动、旧固定项/Windows 默认 AppID 分组、干净非管理员 Portable、混合 DPI/macOS/完整公网媒体等本轮未重测。旧快捷方式与自启动完整路径需要显式修复。
- 文档依赖安装报告现有 11 项漏洞：2 moderate / 8 high / 1 critical。锁文件未升级，未执行 audit fix --force；保留为独立维护风险。
- 公开许可/产品 Gate B 仍阻断；旧 hash-bound 私有 review 不适用于新输入。
- 旧原工作树与私有恢复包继续保留；未认证 tmp/忽略内容可删。最终验收后再正常 PR merge，并单独收尾已确认的历史目录/分支。

GitHub main 与本机冻结 main 均不在本轮切换。等待网页 GPT 集中验收，不自动启动下一项功能或主线合并。
