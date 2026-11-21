# Tasks

## 1. 组合与共享接口

- [x] 1.1 在当前 main 整合 PR64/63 与 PR61，保留 merge 来源，检查冲突取舍。
- [x] 1.2 定义 Adapter inspect 的 typed 摘要及不支持默认值，通过编译确认既有 Adapter 兼容。

## 2. 原生只解析

- [x] 2.1 实现 yt-dlp inspect、Automatic 路由及安全测量投影，以 fixture/单测证明无 transfer、未知字段和脱敏边界。
- [x] 2.2 复用正式队列准备、认证快照和清理，增加 Inspected 与摘要；用合成认证、取消/失败和外层 join 回归证明不发布成品。

## 3. 控制与使用

- [x] 3.1 增加 debug inspect 协商和显式实例绑定，复用 show/wait/cancel；测试旧 owner 拒绝与普通/区间兼容。
- [x] 3.2 在既有机器输出投影 owner 身份/能力，测试未知与启动状态，维护 docs/cli.md 和 docs/developer-cli.md。

## 4. 组合验证与交付

- [x] 4.1 编译普通与 dev-tools 构建，运行相关资源/会话/CLI 回归和规范校验，通过独立只读审查并处理有效问题。
## Workflow follow-up

- 候选交付 Draft PR；本轮不合 main、不删除既有分支或工作树、不发行。后续按具体候选验收决定整合与归档。
