# 规范维护

从 [OpenSpec](../openspec/README.md)按能力读取正式行为要求。Issue/PR 记录改动目标、决定与交付；规范保存长期要求，设计参考与工程指南解释实现和维护方法。

## 更新规范

现有行为的文档修正可直接更新适用主规范并记录来源。需求或行为变更使用项目的 OpenSpec 工作流与 `.agents/skills/openspec-*`，遵循 propose、update、apply、sync、archive 的边界。先用 `openspec context --json` 核对当前检出和 `openspec/config.yaml`，避免改到其他工作树或发行快照。

- 正文使用中文，保留 Purpose/Requirements/Requirement/Scenario 与 SHALL/MUST 结构。
- 以实际实现、测试及已确认决定描述边界，保留来源与未知项；重复规则合入原能力。
- 更新后读回要求、禁止项、兼容例外和场景，运行 `openspec validate --specs --strict` 与 `openspec list --specs`。
- 行为变化还需相关测试和受影响的原生工作流验证；纯文档整理无需启动产品或重复全量测试。
- `DESIGN.md` 与 `.impeccable/design.json` 是设计参考。更新视觉 token 和组件示例时同步维护，正式行为要求仍放在 OpenSpec。

## 验证范围

构建、fixture、窗口消息模拟、真实键鼠输入、真实网络、GPU 呈现和用户验收各有范围。被忽略的测试不算通过；单屏、单一 DPI、管理员环境或一个平台的结果不能推导为所有环境均已验证。Windows x64 和 Apple Silicon Mac 是当前分发目标；Mac 实测为 macOS 26.3，最低 macOS 13 的声明不等于旧系统均已验证。

复用未受改动影响的证据时保留可执行文件哈希、源码身份、失败前驱与未测限制。预览使用真实布局和合成状态，只证明隔离展示，不能替代设置持久化、真实保存目录、系统窗口交互或下载验收。截图应裁到可审查的窗口或元素范围。具体工具见[预览指南](preview.md)和 [UI_REGRESSION.md](../scripts/UI_REGRESSION.md)。

进程测试默认输出到 Git 忽略的 `evidence/windows-process/`，可用 `AMEOW_PROCESS_EVIDENCE_ROOT` 指定独立目录；保留 PID/module 隔离。真实工具测试的缓存要求以测试源码为准，包括 `AMEOW_RUNTIME_TEST_ROOT`。

真实设置和目录验证使用独立的运行目录、设置及输出。普通启动可能准备组件并联网；无网络验证需预先准备匹配的 warm cache，并仅在测试进程范围限制回退。不要为验证清空用户缓存或修改全局代理。

## 来源与记录

[迁移映射](spec-migration/README.md)保存旧规范章节的来源与去向；它是历史参考，当前要求以主规范为准。旧路径可从 Git 历史查询，已提交历史不包含未跟踪或忽略的本机产物。不要把旧报告中的命令、平台结论或候选状态当作当前实现。

阶段交接留在相关 Issue/PR 或任务会话，临时截图与回执使用独立任务目录或 Git 忽略的 `evidence/`；`docs/` 只保留持续维护的开发指南。
