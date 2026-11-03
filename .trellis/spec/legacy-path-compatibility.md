# 历史路径与恢复边界

#18 将 Rust 工程提升到仓库根目录。历史报告中的 `ameow-next/` 是整理前路径；当前源码、测试、资源和脚本直接位于根级 `src/`、`tests/`、`assets/`、`scripts/`。不批量重写历史报告或重新执行旧指令。

整理前的完整 Rust 工作树由提交 `7f8d3b36` 保留；旧 Research 及其原始相对引用可从该提交读取。旧 `.trellis/tasks/` 引用的迁移关系见 `git show 7f8d3b36:.trellis/research/migration-reference-map.md`，不能猜测或再次迁移旧路径。

Electron、扩展及未提交成果的恢复入口、保全证据和清理限制由 #18 交接记录管理。Git 历史中的已跟踪文件与本机忽略的 EXE、缓存、媒体不是同一保全范围；没有独立原始材料校验时不得删除旧工作树。

本文件不授权 merge、历史改写、删除旧分支/worktree 或公开发行。
