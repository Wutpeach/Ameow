# Ameow 规范入口

OpenSpec 是本仓库正式行为要求的记录与更新体系。当前工程为根目录 Rust/GPUI，当前分发目标为 Windows x64/MSVC 和 Apple Silicon Mac。平台实测范围见 [CONTRIBUTING](../CONTRIBUTING.md)。

| 能力 | 内容 |
| --- | --- |
| [download-execution](specs/download-execution/spec.md) | 请求/身份、Adapter 与下载器责任、可选音轨、有界记录、静态路由 |
| [process-ownership](specs/process-ownership/spec.md) | Windows 进程树/线程/文件结算、Held、owner lost、停止/发布仲裁 |
| [artifact-delivery](specs/artifact-delivery/spec.md) | 同对象无覆盖发布、命名、集合 Partial 续作与取消保留 |
| [runtime-management](specs/runtime-management/spec.md) | 可信租约、共享准备、缓存、安全历史、T04 显式更新/离线认证 |
| [queue-lifecycle](specs/queue-lifecycle/spec.md) | 设置顺序、冻结意图、FIFO3、重试例外、诊断与停止 |
| [progress-presentation](specs/progress-presentation/spec.md) | primary 进度、观察限额、前台/队列时钟、固定布局、隔离 preview |
| [desktop-interaction](specs/desktop-interaction/spec.md) | 图标/反馈、键盘/tooltip、静默启动、设置/窗口/退出、动效 |
| [desktop-control](specs/desktop-control/spec.md) | CLI 共用队列、本机访问、实例身份、机器结果与等待边界 |
| [page-video-tools](specs/page-video-tools/spec.md) | 作品绑定、片段草稿、Peek/Marker 与真实受理反馈 |
| [developer-execution](specs/developer-execution/spec.md) | 开发构建的隔离有限执行、场景性质、证据和退出边界 |
| [release-integrity](specs/release-integrity/spec.md) | 当前构建/签名/四资产、明确发行授权、身份兼容与证据保全 |
| [macos-native](specs/macos-native/spec.md) | Apple Silicon 原生窗口、菜单栏、组件与应用更新适配 |

按改动读取相关能力。GitHub Issue/PR 记录目标、决定与交付，OpenSpec changes 记录正式行为变更；已归档 change 保留需求与设计沿革。

维护方法见 [规范维护](../docs/spec-maintenance.md)。[DESIGN.md](../DESIGN.md) 与 sidecar 是设计 token/组件参考，实际值以关联 Rust 实现为准；正式行为边界在上述能力维护。

[迁移映射与来源说明](../docs/spec-migration/README.md)保留旧章节去向、替代依据及迁移时点的验证范围，供查询规范来源。
