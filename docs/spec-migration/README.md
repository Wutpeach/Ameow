# OpenSpec 迁移记录与来源限制

2026-11-15，D:/Ameow 已完成现有规范整理及 mini-trellis 项目级卸载。OpenSpec 是唯一活跃正式 Spec；Cindy 原生历史负责会话检索，GitHub Issues/Projects/PR 管理范围与交付。当前仅保留 Codex 集成。

从 [OpenSpec](../../openspec/README.md)读取现行要求，更新方法见 [规范维护](../spec-maintenance.md)。[章节映射](section-map.md)与 [覆盖表](coverage.json)保留旧 6 份 Spec、695 行和 105 个标题的去向及来源哈希；[未决边界](unresolved.md)不因迁移或清理而自动变成 PASS。

## 外部备份已移除

迁移和 docs 清理曾分别建立完整外部备份并核对哈希、验证恢复。用户随后明确选择删除两份外部备份，包含 Journal、整个 mini-trellis 知识及 docs 历史归档。原 20261115-openspec-migration 和 20261115-docs-cleanup 目录已移入 Windows 回收站，原路径不再存在。本次未清空回收站，也未创建替代备份。

本目录不是原始备份副本。verification.json 记录迁移完成时的工程检查，备份的当前可用性以其中后续处置字段为准；覆盖表和章节映射中的“归档”及旧路径是迁移时点的分类，不是活跃恢复入口。已提交内容可通过 Git 历史读取；不保证未跟踪或忽略原件仍可恢复，不自动从回收站恢复用户已删除的资料。其他历史保全目录、发行快照和工作树未动，也未在本次重新核验。

## 主要整理依据

- R8 明确替代应用级 retry/requeue、Rust Format ID 排序、metadata replay 与 selected-media URL 等值预检，保留完整性、身份和静态路由边界。
- 后续用户决定与真实选流/验证实现明确音轨可选；采用原标题与实际分辨率命名。
- gallery-dl Failure/Partial 同 Job 续作保留为普通 Failure 新 Job 规则的集合例外。
- 后续进度与队列规则采用 primary、56px 两行及固定 122/4/54 布局；不恢复旧 More/详情条或逐主题修补。
- 后续 DESIGN 决定替代正常启动 Ready 闪现、闲置指南、底部临时反馈、普通退出确认、旧菜单布局和空队列页面。
- 当前发行指南取消旧 Gate A/B 和私有审核文件命令，真实签名、源码身份、材料哈希及实际未测限制继续保留。

mini-trellis 使用官方项目卸载完成；未卸载全局包或修改其他项目。qiaomu 是用户主动删除，项目 Claude 集成也已按 Codex 优先方向移除，不自动重建。迁移只调整过一处测试辅助输出引用，未新增产品功能或把历史研发轮次重建为 change。
