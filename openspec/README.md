# Ameow 规范入口

OpenSpec 是本仓库唯一活跃的正式 Spec 记录与更新体系。这里是现有行为的整理基线，不是新增功能或整体验收 PASS。当前工程为根目录 Rust/GPUI，Windows x64/MSVC 是已验证目标。

| 能力 | 内容 |
| --- | --- |
| [download-execution](specs/download-execution/spec.md) | 请求/身份、Adapter 与下载器责任、可选音轨、有界记录、静态路由 |
| [process-ownership](specs/process-ownership/spec.md) | Windows 进程树/线程/文件结算、Held、owner lost、停止/发布仲裁 |
| [artifact-delivery](specs/artifact-delivery/spec.md) | 同对象无覆盖发布、命名、集合 Partial 续作与取消保留 |
| [runtime-management](specs/runtime-management/spec.md) | 可信租约、共享准备、缓存、安全历史、T04 显式更新/离线认证 |
| [queue-lifecycle](specs/queue-lifecycle/spec.md) | 设置顺序、冻结意图、FIFO3、重试例外、诊断与停止 |
| [progress-presentation](specs/progress-presentation/spec.md) | primary 进度、观察限额、前台/队列时钟、固定布局、隔离 preview |
| [desktop-interaction](specs/desktop-interaction/spec.md) | 图标/反馈、键盘/tooltip、静默启动、设置/窗口/退出、动效 |
| [release-integrity](specs/release-integrity/spec.md) | 当前构建/签名/四资产、明确发行授权、身份兼容与证据保全 |
| [macos-native](specs/macos-native/spec.md) | Apple Silicon 原生窗口、菜单栏、组件与应用更新适配 |

按任务只读相关能力，不能按历史轮次、修改日期或最后一条评论推导授权。GitHub Issues/Projects/PR 管理范围与交付；Cindy 原生历史负责会话检索。OpenSpec changes 只承载实际获授权的变更，不重建旧 Linear/Trellis 任务或把历史研发伪装成新 change。

维护方法见 [规范维护](../docs/spec-maintenance.md)。[DESIGN.md](../DESIGN.md) 与 sidecar 保留为设计 token/组件参考，实际值与实现以其关联 Rust owner 为证据；正式行为边界在上述能力维护，不另建平行 Spec。用户后续明确决定优先，出现冲突应据来源修正规范，不能擅自修改产品来迎合文档。

[迁移映射与来源说明](../docs/spec-migration/README.md)记录旧章节去向、明确替代依据和未决事项。外部迁移与 docs 备份已按用户要求移入 Windows 回收站，不再作为恢复入口。已提交历史可从 Git 读取；本记录不保证未跟踪或忽略资料仍有可用副本。
