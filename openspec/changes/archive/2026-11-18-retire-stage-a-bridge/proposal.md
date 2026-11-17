# Proposal

## Why

Stage A 独立 bridge 与正式队列同时维护受理和停止路径。2026-11-17 用户授权 C5：迁移仍使用它的探针与资源故障回归后，退出旧外壳。

## What Changes

- **BREAKING**：退出 --download-test-bridge 独立窗口及公开 standalone Coordinator 受理 API；旧参数明确失败并指向现行探针。
- 两个单任务 example 使用正式 DownloadCoordinator、隔离设置和真实停止回执。
- Held、owner unwind、exact stage 清理、无声视频交付测试使用队列或现有执行器测试入口。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `queue-lifecycle`：单任务探针统一使用正式队列，退出旧 bridge 入口。

## Impact

仅涉及独立 bridge、composition、执行器的 standalone 外壳、相关 examples/回归和入口判断。不改变 FIFO3、设置冻结、Gallery Partial、进程监督器、原生选流和发布原语；Mac 实机由整合者协调。
