# Design

## Context

动机见 proposal.md。失败前驱为 23c4ca22：Transfer 已观察 fork，取消直接 SIGKILL，root wait=9，reader/consumer 已 join，但没有受控正常完成证明，因此 Held 正确保留所有权。不能通过清理状态修复。旧成功媒体合同依赖 after_move，不能证明中途取消。

实际 Runtime 继续提供验证后的 Python、yt-dlp、FFmpeg/ffprobe 和 Deno 路径及执行租约。监督器仍只消费 Adapter 生成的实际调用，不维护工具 hash 或 downloader argv 配方。参考 yt-dlp 2026.11.23 的 utils/_utils.py Popen、downloader/external.py FFmpegFD、postprocessor/ffmpeg.py 及 Deno provider；上游源码阅读不代替 Mac 实际受管版本验证。

## Goals / Non-Goals

**Goals:** 在相同信任边界中增加独立取消合同；使真实 Transfer 取消后资源释放且正常 quit；缺证据继续 Held。

**Non-Goals:** 不做通用 Python 沙箱或任意后代追踪，不开放任意工具，不更新组件，不改变下载/选流能力、输出政策、Windows 控制或 UI，不把退出码/进程缺席当证明。

## Decisions

### 1. Adapter 持有嵌入式取消驱动及精确调用绑定

仅 Mac yt-dlp Transfer 经应用内嵌的 Python 驱动运行，继续使用受管 Python 的 -I/-B 和原始已验证 yt-dlp zipapp；runpy 执行同一入口与原参数。Resolve 和其他工具不变。驱动源码作为应用输入，未经认证的磁盘脚本不参与。每次调用生成随机 nonce，绑定完整 executable/argv/env/cwd/timeout，保留 Runtime 执行 guards。允许的子工具路径从本次租约取得，不新增身份根。

驱动只是可信应用代码的收尾机制，不被描述为能约束恶意原生扩展的沙箱。取消资格仍限于现有受控同步 Python/yt-dlp/FFmpeg/Deno 拓扑；未知派生不得获得证明。正常下载照旧尝试，资格判断不能成为媒体能力准入门槛。

### 2. 用内核直接子进程等待屏障，避免仅靠 Popen 注册表

驱动在 yt-dlp 栈因取消展开后封闭新进程/线程创建，保持封闭直至解释器结束。先执行标准线程退出回调和实际 join（含 daemon），再执行退出回调及检查剩余线程。只有所有可能再启动子进程、写文件或持有 Popen 的 Python worker 已结束，才调用 waitpid(-1, WNOHANG) 清算遗漏的直接子进程，直到真实 ECHILD。已被 yt-dlp/Python 正常 wait 的孩子同样体现在内核无剩余直接子进程这一屏障中。

这避免 SIGINT 落在“实际 spawn 后、Popen 对象登记前”时凭空漏计。未知/仍存活孩子、线程无法 join、wait 错误或期限耗尽均不写完成证明。driver 不与仍活动的 worker 争抢 wait 状态，不靠空注册表或 Popen.__exit__ 推断实际 wait。

Popen 构造参数检查和 Python audit hook 仅用于资格/封闭：shell、preexec_fn、独立 session/process group、非本租约工具、直接 fork/exec/posix_spawn 等使取消资格失效；活动下载时不新增下载拒绝。收尾开始后拒绝新的这类工作。封闭持续经过 atexit 与解释器终结；receipt 之后不得重新开放。实际 CPython/yt-dlp 调用路径若不兼容此合同，测试如实失败，不能扩大允许集来凑通过。

audit 的 Popen 事件发生在 exec 之前，不能把一次未成功执行的探测冒称未知程序已经运行。每次构造持有独立的待决 token；只有同一次原始 CPython 构造返回 ENOENT、filename 与该次 audit 的 executable 完全一致时，才解除这一次“未租约执行尝试”。不修改全局 taint，不增加可信工具，不接受其他 OSError、信号中断窗口或未知实际执行。shell/preexec/session/raw-spawn 等独立 taint 仍保留；成功未知执行即使已 wait，也阻止取消证明。此处修正已由实际受管平台标识探测 file/uname/file 暴露的执行前通知误判。

内核 ECHILD 只证明直接子进程，不能单独证明全部后代。后代仍依赖原有受控同步拓扑、连续观察及未 reap 根时组内仅剩根的证据；逃离组/未知工具/观察丢失不得借新路径释放。

### 3. 独立、一次性、无敏感媒体信息的取消证明

只有驱动实际观察本次 SIGINT、封闭成立、worker 全部结束且直接孩子清算完成后，才以独占创建的普通文件写入有界 JSON：schema、nonce、root PID、kind=cancelled、线程和直接孩子屏障及内核回收状态。文件不记录 URL、headers、Cookie、媒体标题或绝对输出路径。

Adapter 拒绝缺失、截断、未知字段/类型、旧 nonce、错误 root、symlink、重复内容及超限记录。仅 supervisor 自己已经发出本次取消、正常退出码 130 且实际 wait 状态一致时可检查它。媒体 after_move 与取消记录分别判断；取消记录永远不满足成功交付验证。若正常媒体完成抢先且根正常 exit0，仍可依原完整媒体完成合同证明所有权结算；exit130 的缺失取消记录不得借媒体记录补过。正常完成/取消竞争继续由原有发布权威仲裁。

驱动在正常返回路径也显式封闭新工作并运行标准线程/atexit 关闭，最终取消判断覆盖该阶段，不能在手动线程关闭之后又通过退出回调启动未等待的新 worker。关闭回调期间的首次 SIGINT 置取消标记，但不打断回调再执行一次；同一 supervisor 期限仍生效。回调真实结束后才有资格写取消证明，卡住则无证明。

### 4. 一次有界机会，所有原屏障保留

新 Transfer 合同允许 root-only SIGINT 一次，最长 15 秒，不因重复取消或 retry 重置。Resolve 原两秒不变。SIGINT 是请求；超时转原强制清理，在 root wait 前保留组身份锚。驱动内部清算只在同一总机会内进行，线程退出卡住时由监督器期限收束，不写 receipt。

即使 receipt 有效，仍须连续 fork/exit 观察、未 reap 根正常退出、同组仅根、root 实际 wait 与快照一致、两个 reader、consumer、监督驱动、外层 owner 全部 join，以及原文件清理屏障。强制/信号终止、观察丢失、未知后代、合同损坏、屏障不完整仍 Held。

部分媒体保持在该次私有工作区，由原有已 join 后清理处理；不删除已提交下载或其他任务文件。

## Risks / Trade-offs

- Python 退出回调/网络 worker 不响应取消 → 最多给予 15 秒协作机会，缺证据仍 Held；不保证未知 Runtime 拓扑可取消。
- audit hook 不是原生代码沙箱 → 只复用受认证同步工具拓扑，并保留 kernel/root/组证明；禁止把新机制推广到通用命令。
- Popen 创建中断可能留下未登记 child → 不以对象注册计数放行，真实 ECHILD 前不写证明；专门验证这个窗口。
- 调用和取消 race → nonce/完整调用/root PID/本次 supervisor interrupt 共同绑定；取消不能进入媒体成功返回。
- 新驱动改变 zipapp 入口 → 用推荐/已选实际 Runtime、普通成功和下载前普通失败回归，不改版本或额外 recipe。

## Migration Plan

先在隔离输入验证机制和负例，完善上述合同再实现及独立审查。Mac 以真实在途 Transfer（HTTP 及 FFmpeg 活动路径）取消、slot=false/resources_released=true、正常 quit 闭环，复用无关既验矩阵。失败前驱单列。新源码稳定后同步 main，双平台干净候选使用新输出/新 sequence，最终完整 CI 必须对应新 SHA。23c4ca22、seq10/11 与失败证据全部保留。公开发布和站点上线仍待最终授权。
