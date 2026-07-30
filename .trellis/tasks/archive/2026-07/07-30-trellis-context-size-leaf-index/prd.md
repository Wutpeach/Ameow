# 约束 Trellis spec 与 research 上下文体积

## Goal

减少 Trellis 自动注入给 implement/check 子代理的无效上下文，并让过大的 spec/research 在进入执行阶段前即可被发现和阻止。

## Background

- 当前 `.trellis/spec/` 有 26 个 Markdown 文件，其中 4 个超过现有 `context_injection.max_file_bytes` 默认值 32 KiB：
  - `backend/electron-runtime-contracts.md`：176499 bytes
  - `frontend/type-safety.md`：105538 bytes
  - `backend/type-safety.md`：77733 bytes
  - `backend/sidecar-runtime-contracts.md`：35879 bytes
- 当前发现的 task research 文件均小于 24 KiB，无需立即拆分，但缺少持续约束。
- 现有未提交 Trellis 更新已经加入单文件/总注入体积上限和截断逻辑，但 `task.py validate` 对超限文件只警告，`task.py start` 也不会强制执行校验。
- JSONL 仍支持目录条目，并允许直接引用 `index.md`，这会绕过“精准选择上下文”的目标。
- 最大的应用测试文件为 83 KiB、47 KiB、41 KiB；它们不会被 Trellis 自动注入，不能仅凭体积认定必须拆分。

## Requirements

### R1. 叶文档策略

- `implement.jsonl` / `check.jsonl` 只允许引用普通 Markdown 叶文档。
- 允许范围仅为 `.trellis/spec/**` 和当前 task 的 `research/**`。
- 目录条目、索引节点、代码文件、task 根目录文件和其他文档路径均不得作为自动注入条目。

### R2. 分层索引

- spec/research 可通过多级 `index.md` 组织导航。
- 索引节点只保存范围说明和到下一层索引/叶文档的链接，不作为 JSONL 注入内容。
- 为兼容旧路径，非 `index.md` 的迁移入口可使用统一索引标记，但仍必须被识别为非叶节点。

### R3. 体积约束

- spec/research 叶文档上限使用项目现有默认值 32768 bytes。
- 索引保持紧凑，目标不超过 8192 bytes。
- 超限叶文档必须拆分后才能加入 JSONL 或启动 task。

### R4. 强制校验

- `task.py add-context` 在写入前拒绝非叶节点、越界路径和超限文件。
- `task.py validate` 将上述问题作为错误而非警告。
- `task.py start` 必须复用同一校验并在失败时保持 task 为 `planning`。
- 提供一个显式审计入口，扫描当前 spec 与非归档 task research，列出超限索引/叶文档。

### R5. 注入端防御

- Codex 子代理注入 hook 不再展开目录。
- 手工编辑 JSONL 绕过前置校验时，hook 应跳过非法索引/目录并给出清晰提示。
- 现有单文件截断和总预算降级继续作为最后一道防线。

### R6. 现有大 spec 整理

- 将 4 个超过 32 KiB 的 spec 按场景/契约拆成分层索引和叶文档。
- 每个新叶文档不得超过 32 KiB。
- 保留必要的旧路径兼容入口，但兼容入口必须是可识别的索引节点。
- 更新 backend/frontend 顶层索引及相关 Trellis 工作流说明；检查 `src/templates/markdown/spec/` 的已跟踪快照，避免语义漂移。

### R7. 测试文件审计边界

- 记录大型测试文件候选及其体积。
- 本任务不因体积单独拆分应用测试；只有发现重复 setup、职责混杂或修改成本问题时才拆分。

## Acceptance Criteria

- [ ] 显式审计命令能报告当前 spec/research 的索引与叶文档体积违规。
- [ ] `add-context` 拒绝目录、索引、非 Markdown、越界路径和大于 32768 bytes 的叶文档。
- [ ] `validate` 对同类违规返回非零退出码。
- [ ] `start` 在 context 校验失败时不改变 task 状态或活动指针。
- [ ] Codex hook 不再展开目录，并会跳过手工加入的非叶条目。
- [ ] 4 个现有超限 spec 被拆分，所有新叶文档均不超过 32768 bytes，索引均不超过 8192 bytes。
- [ ] backend/frontend 顶层索引和相关 workflow/skill 文档明确区分“导航索引”和“可注入叶文档”。
- [ ] 至少有一个可运行的 Python 测试覆盖叶节点判定、体积上限和 start 阻断路径。
- [ ] 现有未提交改动未被回退或覆盖。

## Out of Scope

- 批量改写 600 个归档 task 的历史 JSONL。
- 仅因文件大而拆分应用业务测试。
- 新增第三方依赖、独立索引服务或新的 CI 工作流。
- 修改全局 npm Trellis 安装或上游 Trellis 仓库。

## Open Questions

无阻塞问题。规划采用项目已经存在的 32 KiB 注入上限作为叶文档硬限制。
