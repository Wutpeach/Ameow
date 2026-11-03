# Ameow #17 / T04 完整开发 Report

2026-11-03 · Issue: https://github.com/Wutpeach/Ameow/issues/17

> 后续修订：本报告以下内容保留首次交付的历史事实。用户选择版离线重启限制已由官方签名缓存方案修复；最新版恢复 UI 已获用户「验收通过」，详见 [最后两项改进补充报告](./t04-offline-recovery-acceptance.md)。旧的「重启必联网」「没有签名离线信任根」「最终 Preparing 文案待验收」结论已被该补充报告替代；其他未覆盖项继续保留。

本轮已连续完成 PyPI 稳定版发现、用户确认升级、可信候选准备、安全激活、版本选择持久化、失败保留及重启恢复，并修复验收中发现的「本地恢复错误显示正在下载」。工程检查及下述真实 Windows 验证通过；**产品最终验收仍等待用户，不能据此关闭 Issue。**

## 1. 基线和交付位置

- 工作树：`D:/Ameow-worktrees/tra26-r7-stage-b`。
- 分支：`next/tra26-r7-stage-b`；开工及交付 HEAD 均为 `cb24c15888b3e8467e834fd89549017419931709`。本轮实现保持未提交。
- 开工已有 `.trellis/workspace/Mabel-WIN/index.md`、`journal-6.md` 改动；保留已有内容，收尾仅追加本轮知识记录。
- 原始证据：`D:/Ameow-artifacts/t04-20261103`，下文文件名均相对该目录。文件保留在本机，GitHub 评论中的摘录可直接审阅；本地路径不是公开下载地址。
- 独立验收 runtime-root，不改日用 `%LOCALAPPDATA%/AmeowNext/stage-a`；新旧已验证 immutable runtime 目录均保留。
- 未创建 commit、push、merge、Release，未关闭 Issue，未修改 #15 托盘视觉。

## 2. 已实现的闭环

### A：PyPI 稳定版发现

yt-dlp 手动查询使用唯一元数据入口 `https://pypi.org/pypi/yt-dlp/json`。核对项目身份、`info.version` 与发布记录一致性及未撤回文件；排除 dev、预发布和撤回版本，以数值比较规范化稳定版本。真实查询得到 `2026.10.26`。

沿用单 worker、受理反馈、冷却、超时、迟到响应和失败状态；不添加 GitHub 备用元数据查询、定时轮询或自动升级。UI 只有在新鲜成功查询（10 分钟内）且高于当前真实已验证版本时提供升级，确认及命令发送时再次检查，查询失败不会显示「已是最新」。

### B：显式升级、可信准备与安全激活

用户点击升级并确认后，才启动候选准备。PyPI 仅提供版本信息；Windows EXE 的独立信任入口是官方 `yt-dlp/yt-dlp` 对应版本 Release 的 `SHA2-256SUMS` 和 `yt-dlp.exe`。每次跳转要求 HTTPS、受限官方主机，无镜像或失败后的直连回退，逐请求使用现有 Windows 路由机制。

候选执行有界获取、官方 SHA-256 校验、完整受管组合验证和受监督的精确 `--version` 探测；不会执行未经验证的下载文件。原始内嵌 Manifest 字节保持不变，候选只替换可信 yt-dlp 字段；Deno/FFmpeg 保持应用基线并复用完整性已验证的缓存。Runtime 通用层继续不解释私有下载器文件名。

候选准备期间保留活动版本与下载；候选就绪后暂停新 attempt 启动，等待既有资源真正结算。Dispatcher 在 active slots 为零、准备 owner 已 join、没有 Held/owner-lost/未决资源且未停止时才切换；不强杀媒体下载、不强拆 lease、不覆盖活动 EXE。原已授权候选在门条件满足后自动激活，不需要第二次确认。

### C：持久选择、恢复与回滚

- 默认 `follow_ameow`：跟随当前应用内嵌的受测基线。
- `user_selected`：用户升级成功后固定所选 yt-dlp 版本，重启按所选版本重新验证，不因版本高低判断用户意图，也不静默采用另一基线。
- `runtime-selection.json` 使用同目录临时文件、文件同步和原子替换。持久提交成功后才替换实际 lease 并发布有效策略/版本；提交失败保留原有效 lease、策略和 Ready 投影。
- 支持旧验收记录中的 PascalCase 名称读取；新写入统一使用 `follow_ameow` / `user_selected`。
- 明确「恢复 Ameow 推荐版本」走同一准备、校验、安全切换和持久提交路径。健康推荐版缓存直接重验并复用；只有缺失或损坏需要重新获取，原已验证版本仍保留。
- 启动时固定版本重新认证失败进入 `RecoveryRequired`，保留选择与文件；允许显式重试该版本或恢复推荐版。损坏选择记录不冒充默认成功，未提交事务及孤立候选目录不能改变有效选择。
- 停止过程中等待候选 owner 结算，不提交候选；重复重试不能把正在恢复的固定版本错误改为推荐版本。

**当前实现限制：** 本机可写 JSON 不是信任根。`user_selected` 每次重启需在线重新取得官方校验摘要，然后可以复用本地 EXE；离线或官方入口不可达时进入 `RecoveryRequired`，不能保证离线继续运行该固定版本。确认界面已说明此限制；恢复健康的内嵌推荐版缓存不需要该上游校验摘要。此处是实现限制，不宣称已完成离线签名信任方案。

## 3. 用户发现的问题和本轮修复

用户手动恢复时，界面错误显示「正在下载」。原生记录确认该操作只有本地 Cache/Probe/Ready，没有 Acquire 或网络组件字节，最终已回到 `2026.08.19`；问题来自命令受理时直接设为 Downloading，以及推荐版进度没有同步到更新状态。

已加入 `Preparing`，统一推荐版/候选进度映射，更新 UI 穷举和 busy/retry 门；官方摘要准备及候选本地复制均显示准备，实际组件获取才显示下载。增加回归测试，最终源代码在独立 Windows runtime-root 又真实完成一次缓存恢复，全程无 Downloading/Acquire。

## 4. 工程验证

```text
cargo test --manifest-path ameow-next/Cargo.toml --all-targets
252 passed, 0 failed, 12 ignored

cargo build --manifest-path ameow-next/Cargo.toml --bin ameow-next --example runtime_update
PASS

git -c core.whitespace=cr-at-eol diff --check -- ameow-next
PASS
```

日志：`tests-delivery.log`、`build-delivery.log`。全量测试覆盖 PyPI 解析/异常、冷却与迟到响应、UI 新鲜查询门、安全激活/等待/停止、持久提交失败、固定版本重启/重试、损坏选择拒绝、未提交事务、官方资产边界、哈希、精确探测、缓存保护及现有下载边界。`neutral_download_boundary` 2/2 与 Windows supervisor 9/9 均通过，未放宽隔离测试。

使用独立的 `native-tests-runtime` 真正受管缓存副本，显式补跑原全量中忽略的 5 项 Windows 测试，均通过：

```text
AMEOW_RUNTIME_TEST_ROOT=D:/Ameow-artifacts/t04-20261103/native-tests-runtime
cargo test --manifest-path ameow-next/Cargo.toml --lib download::ownership_tests:: -- --ignored --test-threads=1
3 passed, 0 failed
cargo test --manifest-path ameow-next/Cargo.toml --lib download::queue::tests::native_ -- --ignored --test-threads=1
2 passed, 0 failed
```

日志：`tests-native-ownership.log`、`tests-native-queue.log`。覆盖真实 Windows 进程 Held、owner unwind、输出清理失败、三活动槽停止/精确 partial 与 join、冻结排队目标消失。这里使用测试注入的 owned process/cleanup 故障，**不是实际公网媒体传输**。

合计实际执行 **257 项通过**；全量默认忽略的 12 项中已有上述 5 项补跑，其余 7 项仍未执行（3 项 genuine runtime/media 集成、2 项 packaged provider、1 项固定原生进度记录、1 项原生文字系统）。不将 ignored 当作通过。

独立只读检查：后端 source safety GO；状态/serde 最后增量复核 GO，无未解决的已报告源码安全问题。检查者未独立运行测试，测试结论来自上述实际日志。

## 5. 真实 Windows / GPUI 证据

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 内嵌基线启动 | yt-dlp `2026.08.19`，Deno `2.9.7`，FFmpeg `N-127264-gf5d4fd186c-20261009` 通过哈希及受监督探测 | `baseline.jsonl` |
| PyPI 手动发现 | 正式稳定版 `2026.10.26` | `pypi-query.jsonl`、`final-discovery.png` |
| GPUI 点击检查、升级、确认 | 官方 EXE 获取/验证，随后 Activated `2026.10.26` / UserSelected；相应选择已落盘 | `gpui-final.jsonl`、`final-confirm-visible.png`、`final-upgrading.png`、`final-activated.png` |
| Windows 提交失败 | 测试 helper 持有选择文件只读共享句柄，阻止原子替换。恢复候选准备完成后提交失败，RolledBack，实际仍 `2026.10.26` / UserSelected，原选择文件不变 | `selection_lock.py`、`gpui-final.jsonl`、`rollback.png` |
| 真实重启固定版本 | 独立 `restart-runtime` 重新取得官方校验摘要并探测，Activated `2026.10.26` / UserSelected，随后 stopped | `restart-selected.jsonl` |
| 用户手动恢复推荐版 | 测试锁释放后由用户操作，最终 Activated `2026.08.19` / FollowAmeow；此次仅本地缓存/探测，无组件下载 | `gpui-final.jsonl` |
| 最终源代码缓存恢复 | 同一真实 Coordinator，从固定版启动再 Restore；Preparing/Verifying/Waiting/Activated，最终 `2026.08.19` / `follow_ameow` 并 stopped，全程无 Downloading/Acquire | `restore-local-final.jsonl` |

可直接审阅的 GPUI 关键记录摘录（elapsed_ms，相对该进程启动）：

```text
233893  Activated  UserSelected  active=2026.10.26
347775  RolledBack UserSelected  active=2026.10.26
        error=Cannot save runtime selection; previous selection retained
465335  Activated  FollowAmeow   active=2026.08.19  [用户手动恢复]
```

旧 GPUI 记录及截图来自 `ameow-next-t04.exe`，早于最后的 Preparing/serde/错误归因修复；这些证明当时真实升级、失败保留及用户恢复，不冒充最终 UI 全量重测。最终源代码全量测试与真实 Coordinator 缓存恢复另有日志。最终 GPUI 状态文字尚未由用户重新验收，保留这一未覆盖项。

EXE 文件实际 SHA-256 与目录：

```text
2026.10.26 yt-dlp.exe
F5389D3698ECDE4EF06F4E6B1CE0294FE9AC1396228C8990B8D3416D6D177A7D
runtime-9E60580C71275A91F3399665F9BF54558F8E5441B8DE08B086AC3422FA37C45E

2026.08.19 yt-dlp.exe
66674953FE251B89F4D08C5F0E35E0728679BD67AB3D7D05C0562AF101DD3E7A
runtime-EBF0CDD82B88F1D42C6E46D288FCF0396A25EA65EEF743DF129368EFC658039D
```

## 6. 源码、开发版与继续验收

改动位于 `download/upstream.rs`、`runtime.rs`、`queue.rs`，新增 `runtime_update.rs`、`runtime_update_trust.rs`；设置页面、命令桥与 fixture 已接线，新增 `examples/runtime_update.rs` 用于真实 Coordinator 证据。没有新增依赖。

`source-identity.json` 保存全部本轮变动源码及 Cargo.toml/Cargo.lock/内嵌 Manifest 哈希。其输入清单摘要：

```text
57947016E49424846EA6795EFC82D05E55A77E73744E9C1DE1B8ED4E66B50FFD
```

`t04-tracked-source.patch` 与 `source-new/` 保留对应未提交源代码证据。

| 开发二进制 | SHA-256 | 用途 |
| --- | --- | --- |
| `ameow-next-t04.exe` | `E1023E39A4F70744D3837A72A8449E9DED87ECEEB842B0EA831C8C9DBD9E1213` | 用户当前这轮验收使用的旧副本 |
| `ameow-next-t04-final.exe` | `863F1455B67403FD40121A25E2696BFD6477BF734A1B7260ADBD10E68DCD4984` | 含 Preparing 修复的最终开发副本；未替换正在运行的旧副本 |

如需查看修正后的状态，先**正常退出旧验收进程并等待退出完成**，然后以相同独立验收根启动新开发版；不要并发启动两个 owner 操作同一个 runtime-root：

```powershell
& 'D:/Ameow-artifacts/t04-20261103/ameow-next-t04-final.exe' --runtime-root 'D:/Ameow-artifacts/t04-20261103/runtime' --output 'D:/Ameow-artifacts/t04-20261103/output' --queue-evidence 'D:/Ameow-artifacts/t04-20261103/gpui-status-fixed.jsonl'
```

不需要为了本轮报告再重复完整下载流程。已释放故障注入文件锁；用户开始自行验收后，Agent 未继续操控其鼠标键盘或强退验收窗口。

## 7. 未覆盖项及停止点

- 未做真实机器断电/强制进程崩溃实验；事务、未提交记录及重启恢复有源码测试，正常进程重启有真实 Windows 证据。不能据此声称断电持久性已实测。
- 未制作并运行第二个不同内嵌基线的 Ameow 应用版本；`user_selected` 优先与较低固定版重启有 mock 测试，跨应用发版组合兼容仍缺实际双构建验证。
- 未进行「真实公网媒体下载持续运行，同时升级并等待切换」端到端实验；安全门有定向测试，原生 Held/lease/清理有上述 5 项实测，不能冒充公网并发升级证据。
- 未执行本轮升级版的新增 YouTube/Bilibili 公网媒体成功下载或包装/发布验收。
- `user_selected` 重启在线认证限制及最终 Preparing 文案尚待用户产品验收；没有签名离线信任根。

本轮完整开发 Report 回写 #17 后停止等待验收；#17 保持 Open，#15 托盘范围保持原状。
