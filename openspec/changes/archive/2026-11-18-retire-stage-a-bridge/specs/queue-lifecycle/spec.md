## ADDED Requirements

### Requirement: 单任务探针共用正式队列

单任务下载探针 SHALL 使用正式队列的设置确认、冻结意图、Submit、Cancel 和 Stop；返回前 SHALL 等待真实 stopped 回执。探针设置 SHALL 隔离于用户配置。应用 MUST NOT 再打开 Stage A 独立 bridge 窗口；旧 --download-test-bridge 参数 SHALL 明确报错并指向现行 headless 探针，不能静默启动普通应用。

#### Scenario: 调用旧 bridge 参数

- **WHEN** 应用收到 --download-test-bridge
- **THEN** 非零退出，给出迁移入口且不创建窗口、队列或启动更新会话。

#### Scenario: 单任务完成或取消

- **WHEN** headless 探针提交的任务完成、失败或取消
- **THEN** 输出正式队列快照，保留唯一终态和外层 owner join 要求，并在真实停止后退出；共享准备失败也应给出失败并完成停止。
