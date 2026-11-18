# Design

## Context

动机与范围见 proposal.md。现有 DownloadCoordinator 接收 QueueCommand 并发布 QueueSnapshot；桌面 download_ui 命令线程执行应用更新权限门槛。Accepted.intent 已有冻结画质/目录；delivered 与 collection 保存真实文件。内部 mpsc 不是公共 IPC。

## Goals / Non-Goals

以独立控制台程序连接普通桌面 owner，并保持既有 GUI 线程、重试回执与窗口行为。入口仅为 Windows/macOS 本机当前用户，不引入下载器、通用 RPC 框架或持久任务库。

## Decisions

- Windows 使用当前用户 DACL 的本机 named pipe；macOS 使用私有目录的 Unix socket 并验证 peer uid。根路径散列决定实例命名空间，隔离验证使用显式 instance-root；生产继续现有唯一实例仲裁。相比 TCP 无监听端口与远程接口。
- IPC 使用有界长度前缀 JSON，每次连接一请求；版本 1 envelope 固定 protocol_version/request_id/instance_id/ok/result/error。最多 8 个连接 worker 独立收发有界帧并提交有界命令信封，使半帧停滞连接不阻塞其他请求；桌面命令线程仍串行处理请求并复用同一个 coordinator 和更新权限门槛。退出时停止收发并 join 全部连接 worker，再释放监听端点。
- 任务 ID 为随机实例 nonce 与原 job_id 的组合。写请求缓存请求内容及原回执，有界且不淘汰；达到上限明确拒绝新写操作，读取仍可用。不会跨实例自动重放未确认写请求。
- SubmitWithOptions 在原 command_gate 中合并默认；JobSnapshot.accepted.intent 直接作为冻结快照。相对输出目录由 CLI 按调用者 cwd 转绝对路径，队列完成最终验证。
- CLI 重试结果也进入 GUI 现有 UiReply::Retry，使原失败行退役语义一致。终态由原 JobPhase 与 resources_released 确认，返回全部真实交付文件。
- ameow-cli 是 console binary，桌面 ameow 保持 windows subsystem。自动启动优先相邻稳定 launcher（存在时），否则相邻开发 app；--cli-launch 只抑制额外 restore/activate，保留普通窗口偏好。并发启动继续经 InstanceGuard；没有实例时只对 submit 启动，其他命令返回明确错误。
- 构建复用本新树固定 target；验证数据/设置/runtime/output 全部隔离，不连接用户现有进程。

## Risks / Trade-offs

- 会话重启不保留任务 → 明确拒绝旧实例 ID，遵守既有无持久历史边界。
- 接受后失联可能无法立刻确定结果 → 保留 request_id，允许同实例显式重查/重发并去重，不自动跨实例提交。
- Mac 代码不能由 Windows 运行证明 → 交付准确提交及独立 Mac 验证清单，保留未验结论。
- IPC 输出属于当前用户的私有任务数据 → 不写入公开诊断或公共证据；诊断继续既有安全白名单。
