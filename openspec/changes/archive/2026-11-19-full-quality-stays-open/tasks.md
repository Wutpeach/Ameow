# Tasks

## 1. 保存后保留菜单

- [x] 1.1 移除画质保存成功后的关闭与锁释放调用，补充连续回执、失败、旧会话和 Esc 回归并在 Windows 与 Mac 运行。

## 2. 规范与原生覆盖

- [x] 2.1 同步 Full 画质保留场景到主规范，运行 OpenSpec strict 检查，并记录 Windows 实际交互、Mac 隔离检查及锁屏导致的真实手势覆盖限制。

## Workflow follow-up

- PR #58 对应 Refs #56、Refs #57；来源已转交用户在精确隔离实例上“两项都正常”的验收反馈，本 change 随 PR 收尾归档，按授权普通合入。Issue/Project 状态仍交原唯一记录任务。
