# Rust / GPUI Spec 导航

正式应用位于仓库根目录。历史名称 Ameow Next 与历史路径 `ameow-next/` 指整理前版本，不要求重新执行旧轮次。

- [下载、运行时与安全交付](../backend/next-rust-download-contract.md)。
- [队列、GPUI 与原生窗口](../backend/next-rust-queue-contract.md)。
- [Cargo 清单](../../../Cargo.toml)、[下载内核](../../../src/download/mod.rs)、[原生入口](../../../src/main.rs)。
- [下载契约测试](../../../tests/download_contracts.rs)、[Windows 进程测试](../../../tests/windows_process_supervisor.rs)。

两份完整契约保留历史轮次、替代关系和未验收边界；只读适用章节。旧命令应先按[路径说明](../legacy-path-compatibility.md)定位当前入口，不能把历史测试结果当作新路径/新命名的验证。

[Rust/设置/T04 历史报告](../../research/index.md)及 GitHub Issue 保存原始验收范围。macOS、混合 DPI、公开发行等未验证事项不会因主线整理自动获得 PASS。
