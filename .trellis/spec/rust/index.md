# Rust / GPUI Next Spec 导航

在确认正确的工作区和当前批准范围后，使用此入口处理 Rust / GPUI 工作。两份文档累积了多个历史轮次：只读取适用章节，同时保留其替代关系、验证范围和未验收边界；确认现状前核对代码、测试和 Linear 交接。

## 契约入口

- [下载归属、运行时、适配器和安全交付](../backend/next-rust-download-contract.md)。
- [队列、GPUI 投影与原生窗口](../backend/next-rust-queue-contract.md)。

两份契约保持完整；仅因篇幅较长不应拆分契约。所在的 backend 目录沿用历史位置，Electron 后端索引不因此成为 Rust 的默认入口。

## 证据

按需通过[本工作区 Research 索引](../../research/index.md)定位历史证据。Research 和归档指令不授权恢复任务；界面观察、历史测试报告和未完成的验收关卡不能替代当前产品验收。

## 源码和测试入口

- [Rust 包清单](../../../ameow-next/Cargo.toml)。
- [下载模块](../../../ameow-next/src/download/mod.rs)及[队列实现](../../../ameow-next/src/download/queue.rs)。
- [GPUI 入口](../../../ameow-next/src/main.rs)和[下载界面](../../../ameow-next/src/download_ui.rs)。
- [下载契约测试](../../../ameow-next/tests/download_contracts.rs)及 [Windows 进程测试](../../../ameow-next/tests/windows_process_supervisor.rs)。

按当前获准任务选择检查；单元测试不能证明未观察到的原生界面或媒体行为。

## 迁移来源

2026-11-01，两份契约从 `D:/Ameow/.trellis/spec/backend/` 逐字节复制到本工作区相同位置。复制时 Electron 工作区的队列契约含有既存未提交改动；来源是当时的工作区文件，不能将其称为某个提交的原样快照。来源与目标核对时的 SHA-256：

- 下载契约：`D82694A801581BD8EE6937A37797EB643251E5CB9FA91FF27B306C3C7EA3C6CE`。
- 队列契约：`CA94C344C0F52489E78823367D78532C491AEC5B3D67E661FFE94D4541B1274C`。

这些哈希只描述迁移时的内容，不代表未来内容或产品验收状态。
