# 上下文整理规则

Ameow（Rust / GPUI）是当前开发上下文。GitHub Issue 管理当前授权与交接；旧 Linear、Electron 和归档指令仅作历史证据。

- 只记录确认的边界与可复用发现；区分用户验收、实际测试、推断与未知。
- 按 Spec 索引、主题摘要、原始证据逐级读取；不按日期自动删除证据。
- 两份 Rust 契约保留来源、替代关系和未测限制，不机械按长度拆分。
- 原始报告不批量改写；旧路径见 [历史兼容边界](legacy-path-compatibility.md)。
- 当前主线保留必要报告，完整旧资料由 Git 历史、保全包与原工作树恢复。Git 中的文件与忽略的 EXE/缓存/媒体覆盖范围不同，不能据此删除原工作树。
- mini-trellis 管理知识，不驱动任务；不执行 `mini-trellis migrate`，不迁移旧 `.trellis/tasks/`。
- 更新实际主题并读回后再写 journal 链接；不把 journal 成功当作主题已经更新。

Cindy 的 Codex 会话可使用独立 CODEX_HOME。mini-trellis 的空/不完整结果不能证明会话不存在；确需历史且证据不足时，再使用 Cindy 会话检索，保留来源和覆盖限制。
