# Design

## Context

见 proposal.md。当前临时 stage 在失败时自动清理，并在探测后整目录 Move。工具和固定资产信任继续来自编译清单，不能把旧临时 repair 工具整体合入。

## Goals / Non-Goals

实现 #89 发布正确性、失败恢复和安全诊断。保持 RuntimeManager/RuntimeLease 的调用接口及 Mac 编译条件，不实施后续 Mac 重复校验优化，不改变更新及 UI。

## Decisions

- 立即保留新建的 runtime-digest-recovered 随机 sibling，使成功与失败目录都可重新发现；只将已刷盘的临时完成标记无覆盖发布为 complete.json。相比整目录移动，不再要求刚执行目录可被改名。
- 每次显式重试使用新 sibling，按固定清单重新验证旧候选的单文件及固定 artifact，复制可信文件、直接读取可信包，只解出缺项；不修改旧候选。候选扫描及新建受 128 个根条目上限约束，达到上限失败，不自动清理用户数据或无限积累。
- 包需同时满足精确长度与哈希；工具文件在必要 probe 前和取得发布后租约时仍验证，原 probe/锁/guard 语义保持。取消在获取、复制、解压和发布前检查，探测由已有 supervisor 结算。
- 诊断使用 enum 和 Option<i32>，旧 JSON 使用 serde defaults，文本安全重建，不解析不透明 prose 猜码。根来源由实际配置入口接入，不从目录文本推断。

## Risks / Trade-offs

- 保留失败输入占用空间 → 上限约束，不自动删除原缓存；复制复用仍有本地 I/O 成本。
- 原用户根因未知 → 仅报告新机制和真实检查，不补写杀软、句柄或安装盘结论。
- 普通进程在本机的权限上下文可能是管理员账户 → 记录实际 token，不将普通进程偷换为非管理员验收。

## Migration Plan

旧 complete.json 契约保持，旧完整目录继续可读；新 sibling 同样可由当前消费者发现。只同步本 change delta，由整合者统一合入、归档；用户明早根 main cargo run 完成最终 UX 验收。
