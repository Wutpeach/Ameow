# 工程文档与历史说明

这里保留仍需使用和维护的工程指南。当前正式行为要求统一在 [OpenSpec](../openspec/README.md) 维护，设计参考见 [DESIGN.md](../DESIGN.md)。

| 入口 | 用途 |
| --- | --- |
| [预览指南](preview.md) | Gallery、原生场景、截图与验证边界 |
| [首次 Rust 发行](first-rust-release.md) | 当前签名、构建、打包与发行交接方法 |
| [规范维护](spec-maintenance.md) | OpenSpec 更新、来源与验证边界 |
| [规范迁移索引](spec-migration/README.md) | 旧规范映射、迁移时点回执和未决限制 |

## 历史资料

2026-11-15，用户先要求清理旧阶段交接报告与验收资料，随后明确选择删除两份外部备份，包含 docs 历史归档。原 20261115-openspec-migration 和 20261115-docs-cleanup 目录均已移入 Windows 回收站，不再作为外部归档或恢复入口。本次未清空回收站，也未创建替代备份。

清理范围包含 mini-trellis 的 Journal、Spec、Research、Tasks、原集成配置及恢复验证副本，以及旧 docs 阶段报告、机器回执和验收证据。移出或删除不改变任务状态、历史验收结论和未测限制；[未决边界](spec-migration/unresolved.md)继续保留。

已提交内容可从 Git 历史读取，例如 git show eb61f7b3:docs/application-update-stage-c2.md。未跟踪或忽略资料不能假定仍有独立恢复副本，不自动从回收站恢复用户已删除的内容。迁移映射中的旧路径和哈希只用于追溯，不承诺原始文件仍存在。其他历史保全目录、工作树和发行快照不属于这次清理范围，也未重新核验。

后续阶段交接使用对应 GitHub Issue/PR 与 Cindy 原生历史；临时截图和验证输出放入独立任务目录或根级 ignored evidence/。只有持续使用的工程说明留在这里，不再将普通阶段报告累积到 docs/。
