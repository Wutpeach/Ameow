# Design

## Context

见 proposal.md。原生失败已经通过带数值退出码的本地 envelope 分类，但 Failure 只保留稳定代码；copy_with_versions 再以 known 重建，额外信息无法抵达最终复制。Runner 仍持有实际 runtime lease，且 attempt-error 与 settlement 已有有界归档。

## Goals / Non-Goals

**Goals:** 在现有 Failure 中增加可选 typed 引擎事实与执行关联，认证和匿名共用，旧数据兼容。

**Non-Goals:** 不保留原始错误字符串，不建立日志服务、自动重试或新 UI；不修改既有失败和停止权威，不重现旧 B 站失败。

## Decisions

- Adapter 仅从实际引擎 ERROR 观察提取闭合错误枚举与 HTTP 数字；代理连接上下文优先，不把隧道状态当目标状态。保留实际数值退出码与观察时间，stderr 截断保持未分类。
- 每次已返回的原生调用保留 typed 阶段/退出观察；引擎退出 0 后发生 metadata/媒体验证失败时，也能复制最后一次真实调用的阶段及 0，不把本地验证错误归为引擎非零退出。
- Runner 在 lease 释放前补充 Job/attempt、实际 runtime digest/版本与当前 EXE SHA-256；可得的开发源码身份只使用已编入构建的信息。平台用编译目标，缺失标 unknown。
- 既有 settlement 补数值退出码与时间；attempt-error 持久保存同一个安全 Failure JSON。原始认证输出继续受原归档白名单约束。
- 队列转换保留 typed 字段；最终复制仍重建稳定文案，对枚举、数值和哈希执行输出边界。旧 fallback 历史缺事实时明确 unknown，不补造数值。

## Risks / Trade-offs

- 自由输出可回显秘密 → 仅提取闭合枚举/数字，未知不引用原文；用带认证秘密与签名 URL 的样本检查整个链。
- 原生输出形态不能穷尽 → 不匹配时显示未分类和已有事实，不承诺全站原因覆盖。
- 构建指纹和租约可在较早失败缺失 → 标 unknown；不拿声明组件版本冒充实际执行租约。
