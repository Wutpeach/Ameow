# Tasks

## 1. 迁移探针及故障回归

- [x] 1.1 两个 example 改用正式队列、隔离设置及停止回执；cargo check --examples，并验证本机可执行的成功/取消或失败入口；交付 Mac 原生命令和断言。
- [x] 1.2 Held、owner unwind、stage cleanup 迁到现有 queue probe，视频合同迁到队列；验证定向资源与合同回归、FIFO3、settings freeze 和外层 join。

## 2. 退出旧外壳

- [x] 2.1 删除独立窗口、command owner、standalone 受理和可选准备旁路；保留 start_prepared，并以编译及全树消费者检查验证。
- [x] 2.2 旧 bridge 参数在初始化前明确非零退出，补对应入口回归；核对 preview catalog 无对应旧场景。

## Workflow follow-up

- 整合者安排 Mac probe 实机检查，接入独立后续分支/PR；本任务不操作 PR39 或发行。
