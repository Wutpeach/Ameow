# 验证记录

2026-11-19，#46 开发便利优先的有限执行与工具整合，PR #61 保持 Draft。完整入口、参数与工具映射见 [developer-cli.md](../../../docs/developer-cli.md)。本记录只报告实际检查，不代替来源复审或用户验收。

## 源码与构建身份

- 基线：a7ba5b436ae2a11fb00e306d23990b6bcc7dc5f4；独立复审候选：45163116378e7bfe508bfffbb748aef406a760f3。
- 复审增量：仅 dev 循环的 Gallery 同 ID 重试完成判断、对应 test-only collection fixture/回归，以及规范、开发说明与本报告。修复后的 src tree 为 a5f9612e51e8bf8a4866cc8e039686c78871ff0a；提交完整 SHA 与 CI 以 PR 和交接 receipt 为准。
- Windows 451 的真实三并发执行：source_sha256=193a6661164bec425653b5002b7928279fb8dd46d6a25e94743be192f0c77a06；EXE SHA256=CD34E6CB27FA57DD7D774BF1335ABA9D6721906BB7DF9D4A25745C2E1C6C03A3。209 个编译输入的独立重算与嵌入摘要一致。
- Mac 451 的真实重试：source_sha256=4aebcce29e488087193b995a9bcf415d520fd0e52e3f6d6ce781d1b520fe9993；EXE SHA256=4B15C449FF38B993C20B51BF31881671F625267223960F55521382118FE940D8，arm64/macOS 26.3。两端摘要反映各自实际检出字节，不要求跨端相同。
- Gallery 修复的 Windows/Mac 定向测试在 451 + 精确补丁上运行；这是带新增测试的源码构建，不冒称原 451 EXE。最终补丁/源码树可与提交逐项核对。

## Windows 早期证据的身份与适用范围

real-retry、real-cancel、real-stop、real-stop-longer 均为 source_commit=a7ba5b43 + 当时未提交实现，source_sha256=54041fbbc53e5c26ff0145fb6ba6e4d529e5d871145f5426c6c6faeadb4853fb，EXE SHA256=2AC50DB514D03AB8536A636AF41311AE1484D1EE9B7A33B1BDDFB7C54CB15C6A。早期 real-success 另为摘要 b4e78046decea6f6364ca62233f3de63b8e8e8c3f0bc3651a1fb1d8ebd7c77ff、EXE 4790B6F23C9BA9B84B7F44AB10492591CA981F9DA24DD16DFF2837BECB36589C，单独保留。

source_commit 是编译时基线，不表示这些是未修改的 a7ba 构建；digest 也不能反解成历史提交。旧运行未保存整个当时工作区的源码快照，因此不声称全树字节等价，不给旧 EXE 换标。

这些结果复用于未改的执行路径，依据如下：

- 正式 composition、队列 retry/cancel/stop、Adapter、进程监督、发布及组件 manifest 从 a7ba 到交付源码保持原实现；runtime/verification 只为显式 dev fixture 开放原测试 helper，真实 run 仍选择正式 requirements/verifier。
- 54041f 到 451 的包装层变化为 identity.transport、fixture 端口参数保存/固定三 URL 校验、相同固定路由表提取、旧 bridge 提示/调用迁移、测试与行尾恢复。上述真实运行均使用原本允许的三个固定 URL，未改变其代理目的、下载器或停止规则。
- 最后 R1 修复只防止本轮刚受理 retry 后使用旧快照判断完成。旧 real-retry 是普通视频并创建新 ID，旧快照本就找不到新 ID、done=false；新 guard 同样等待下一轮。cancel/stop 和三并发命令没有启用重试，完成判断的路径保持一致。

因此保留早期任务业务/结算结果及其原身份；451 的真实三并发与 Mac 真实重试另外列出，Gallery 同 ID 的变化仅由新增定向回归支撑。没有为身份说明重跑成功矩阵。

## 已执行检查

| 检查 | 实际结果 |
| --- | --- |
| Windows cargo check --locked --all-targets | 通过，保留既有 dead_code warning |
| Windows cargo test --locked | 默认测试通过；显式外部 runtime/media ignored 项仍为 ignored |
| 普通构建 developer_cli、retired_bridge_cli | 各 1 passed；dev 被拒绝且未创建根；旧 bridge 在窗口/会话前退出并指向新入口 |
| Windows dev 单测 | 451 的 3 passed，覆盖参数/生产域/重复根、文件/身份、状态/有界日志 |
| Windows dev 独立进程测试 | 1 passed，六个场景，stdout 单 JSON、文件回读相同、普通 CLI 不能附着 |
| Windows app-update-fixture 的 control 回归 | 20 passed，保留隔离 fixture 的既有控制/签名边界 |
| release + dev-tools | 实际 cargo check --release --features dev-tools 被 compile_error 拒绝 |
| Mac 451 普通构建 / dev 单测 / dev 进程 | 退出均为 0；1 / 3 / 1 passed，实际 arm64/macOS 26.3 |
| OpenSpec | 11 项主规范及本 change 严格校验通过；change 保持 active 待复审 |

Mac 编译曾先因 SSH 的 PATH 未指向已装工具链失败，随后使用既有 1.98.1 与开发 Cargo cache。另有 rust-objcopy 缺少 libLLVM 的非致命 warning；二进制构建与上述实际运行成功。fixture 首次编码因 Mac 组件无 libx264 失败，保留原日志，随后复用 Windows 生成的同一受控小媒体；没有修改组件或安装编码器。

## 离线核心场景

六场景均为 synthetic-adapter-core：真实协调器、Runner、Data verifier/发布，不执行原生下载器。

| 场景 | 父退出 / 权威结果 |
| --- | --- |
| success、retry | 0；Success、真实文件 hash 匹配、stopped=true、slot0 |
| cancel、stop | 5；Cancelled、resources_released=true、stopped=true、slot0 |
| held | 6；取消受理仍为 Held、stopped=false、slot1；owner panic 注入，保留工作区 |
| timeout | 6 / E_RUN_TIMEOUT；正式 Stop 后已结算，stopped=true、slot0 |

Windows 还保存六次可审运行的 identity/events/result 和父退出摘要。Held 的取消受理事件与最终状态分别记录，不把该合成 owner panic 当作原生 fork/Job 清理验收。

## 正式下载器与受控本地媒体

各次真实 run 使用正式组件、AutomaticAdapter、验证/交付和固定三 URL 的本地路由；不请求公网成功矩阵，不启动 GUI。

| 实例/运行 | 结果与限制 |
| --- | --- |
| Windows 50f04a3817eebe7ba55e850489b9500c / real-retry | 服务端 503 直到已结算 Failure 被观察，再恢复并正式 retry；新 Job2 Success，1675987 字节/hash 验证，父退出0，stopped/slot0 |
| Windows f4266eba978f915d8f1378aba4d5265d / real-cancel | 已观察 Downloading 后 cancel；Cancelled/已释放，父退出5，stopped/slot0 |
| Windows f21bed34f875c3b3285252271401773b / real-stop，默认10秒 | Stop 宽限期结束仍 Downloading、slot1、stopped=false；父退出6 / E_STOP_TIMEOUT，owner_settled=false。原日志/结果与 harness 断言失败保留 |
| Windows c4f8eb013a3304f09b0072d543928817 / real-stop-longer，显式30秒 | 另一独立运行，下载中 Stop 后 Cancelled/已释放；父退出5，stopped=true/slot0；总耗时19767ms。不能覆盖前一轮未确认结果 |
| Windows 4fc2a09741486e245d16d692da256508 / 451 三并发 | 三任务全部 Success，各1675987字节、三个磁盘hash匹配，重复提交拒绝，父退出0、stopped/slot0 |
| Mac c91ec1832c7581a37ce6e6919584f58f / 451 实媒体重试 | 先 Failure/资源释放，再原冻结意图创建 Job2 Success；12420字节，SHA256=0DFF1B572B1E12A273CDDCD633CE9129D8A4822F6DF90E2D8A750A727296148D，磁盘核对成功；父退出0、stopped/slot0，67363ms |

Windows 本地 server 最后收到本轮 stop 文件正常结束；Mac driver 同样正常结束 server。未清理 runtime/证据缓存，未强杀后宣称资源结算。

## R1 增量修复与红绿回归

独立复审指出 Gallery 的 retry 返回原 ID。原 dev 循环拿重试前的 Failure/Partial 快照计算 done，立即发 Stop。新增已识别 Gallery 的离线 collection fixture，让第二次执行保持可观察并可取消，覆盖真实队列的同 ID 分支。

- 修复前：新增同名测试实际失败，gallery-failure 最终为 Cancelled、attempt1、退出5（期望0）。该构建摘要 f4e84d5e09aecdb52d7c657eb33f7d9fe73928386525fe92dd977f0cce383f27，属于 451 加测试的 dirty 构建，不是原 451 EXE 原样复跑。
- 修复：受理 retry 后设置本轮标志，跳过旧快照的完成停止判断；下一轮读取权威状态。一次重试上限、Gallery 原 ID、正式队列及超时守卫均保留。
- 修复后：Windows 和 Mac 同一条 gallery_same_id_retry_waits_for_new_attempt_after_failure_or_partial 各 1 passed。每次都覆盖 Failure 与 Partial 两条路径，同一 Job、attempt2、Success、两文件 hash 核对与资源释放；未重跑其余成功矩阵。

本项只表示作者实现和回归完成，待来源对准确新 head 增量复审后关闭 R1。

## 工具退役与边界

已删除 examples/download_job.rs、download_queue.rs、macos_live_download_probe.rs，迁移全部活跃调用、旧 bridge 提示/测试、开发导航与 CI。保留 Gallery/原生截图与焦点/DPI、组件更新、公共签名/Ready fixture、发行/许可与文档同步工具；其独有能力不由 dev run 覆盖。

未新增 GUI 行为或手势验收。Mac 窗口焦点、粘贴、实际点击，macOS13、跨 UID、真实公网 Partial 与生产签发/安装更新全链均不由本轮补证；第一阶段 a4d653 的取消→Held 和 ccf558 的后续成功/正常 stopped 保持原含义。

保护的 finish.flag 仍为原8字节/SHA256 05343e9845302eb730fa9d18ac7b28d5e509893daf1eb76ede8d6e82d47b2da9；根 .ameow-docs-reviewed-state.json 原修改保留。未删除旧树/缓存、原始失败、密钥或生产包；未写 Issue/Project，未 Ready、合并、Tag 或发行。

本机/跨端证据索引位于交接目录 issue46-developer-cli-20261119 的 README、manifest 与 receipt；保留原源码身份和失败前驱。精确 CI 状态从 PR 对应 head 回执读取，运行中不记通过。
