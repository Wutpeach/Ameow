# 规范维护与历史引用

从 [OpenSpec 入口](../openspec/README.md)按能力读取当前正式要求。GitHub Issue/PR 和用户当前授权决定任务范围，Project 只是规划视图；规范和计划不授予执行、结案、提交或公开发行权限。

现有行为的文档修正可以直接更新适用主规范并记录来源；只有确有需求/行为变更时才使用项目生成的 OpenSpec Skills 与 changes。用户主要使用 Codex；项目仅保留 Codex 集成，由 .agents/skills/ 发现 openspec-*，不维护 .claude 链接目录。遵循已选 Skill 的 planning/apply/archive 边界，不因安装集成自动创建 change 或开始实现。执行前用 openspec context --json 核对当前 root 为 D:/Ameow，再读取 openspec/config.yaml；不要把工作指向其他 store 或发布快照。

- 编写中文正文，保留 Purpose/Requirements/Requirement/Scenario 和 SHALL/MUST 结构。
- 以实际实现、测试及必要的已批准后续决定解释现有边界，保留来源与限制。重复规则合入原能力；未确认选择和 pending Review 留在参考/未决说明，不写成通过结论。
- 更新后读回要求、否定项、安全/兼容例外和情景，运行 openspec validate --specs --strict 与 openspec list --specs。更改行为仍需项目原有最小相关测试和真实 UI 验证；纯文档整理无需启动产品或重复全量测试。
- DESIGN.md、.impeccable/design.json、工程指南及研究说明是非规范参考；视觉 token/组件示例同步维护，正式行为要求在 OpenSpec 中更新。不要因清理文档重置用户尚未提交的视觉成果。
- 跨会话摘要留在当前 GitHub 任务或 Cindy 原生历史；规范只保存有长期价值的要求。不要恢复旧 journal、add_session、mini-trellis 调用或托管 hooks。历史查询先用 Cindy 的原生会话检索，证据不足时保留未知。

## 证据与平台

用户验收、工程检查、fixture/WM/SendInput、真实网络与实际 GPU present 是不同证据。不能把构建成功、ignored 测试、Administrator 的 PATH 隔离或模糊环境的跨机反馈当作干净非管理员/跨平台/全工作流验收。复用未受影响的已接受证据，保存原 EXE、源身份、失败前驱及真实未测限制；新输出用独立目录，截图使用可审查的裁剪。

原生进程测试的新默认输出为 evidence/windows-process/（Git 忽略），仍可通过 AMEOW_PROCESS_EVIDENCE_ROOT 指定新的独立目录；PID 加 module namespace 的隔离必须保留。AMEOW_RUNTIME_TEST_ROOT 等真实工具测试参数继续按测试说明使用。修改默认路径仅退出已卸载的知识目录，不代表已重新运行原生测试。

真实设置/目录验收使用 task-owned runtime、settings、output；普通启动即使不提交媒体也会准备组件，冷缓存可能获取网络资产。无网络验收入口应预检独立复制且匹配的 warm cache，并仅在进程范围限制回退；不修改全局环境/代理，不清空用户缓存。preview 只证明隔离展示，不能替代真实设置、Explorer 目标与持久化回执。

## 历史路径与来源限制

#18 之后，旧 ameow-next/ 对应当前根级 src/、tests/、assets/、scripts/，不批量重写原始报告或重新执行旧指令。整理前完整树及原相对引用可从 7f8d3b36 读取；旧任务映射仍可用 git show 7f8d3b36:.trellis/research/migration-reference-map.md 查看，不猜测映射，不再运行旧迁移。

[迁移来源记录](spec-migration/README.md)保留旧规范映射和未决限制。[历史资料说明](README.md#历史资料)记录当前来源可用性。2026-11-15，用户明确选择删除两份外部备份；mini-trellis（含 Journal）及 docs 历史归档已移入 Windows 回收站，不再提供活跃恢复入口。已提交内容可按 Git 历史读取，未跟踪或忽略资料不能假定另有恢复副本，不自动从回收站恢复用户已删除的内容。#18 旧 Git/私有包的范围仍按当时记录理解，不能据此认定 EXE、缓存、媒体已备份或授权删除其他工作树、发布快照。

普通阶段交接和验收输出不再累积到 docs/；交接使用对应 GitHub Issue/PR 或 Cindy 原生历史，截图/回执使用独立任务目录或根级 ignored evidence/。持续使用的工程指南保留在 docs/，正式要求仍只维护 OpenSpec。
