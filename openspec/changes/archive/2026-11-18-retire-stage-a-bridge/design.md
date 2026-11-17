# Design

## Context

见 proposal.md。正式 queue 仍创建每次执行的 Coordinator 并持有 start_prepared 返回的 JoinHandle；现有 shared.probe 已能注入真实 Held、unwind 和 stage cleanup 故障。

## Goals / Non-Goals

退出第二套 admission/command owner；保留现有执行器和故障含义。不改监督器、发布原语、旧设置格式或更新恢复。

## Decisions

- examples 保留现有命令形式，使用临时 settings 路径和显式确认设置，再向正式队列 Submit；观察终态后 Stop，准备失败也走 Stop。不新增探针框架。
- 删除 Coordinator::accept 和 composition::coordinator，start_prepared 强制接收共享准备及 admission；Coordinator 成为模块内部 attempt owner。低层发布测试仍直接测试执行器状态。
- Held 与 owner unwind 迁到 queue 的现有 probe。exact stage cleanup 测试用 Stop 和 retry_cleanup；共享 runtime lease 要到队列 stopped 才允许写入，不能照搬 standalone 的释放时机。
- 旧 bridge 参数在应用会话初始化前拒绝，移除更新会话对该参数的绕过。独立窗口不属于 preview 场景，现行 preview catalog 无需新增或删除场景。

## Risks / Trade-offs

Mac 真实 probe 需整合者协调实机；本轮 Windows 使用隔离 cache 和定向资源回归，不触碰旧 Held 样本。外部直接调用 standalone API 的消费者需改用公开 DownloadCoordinator。
