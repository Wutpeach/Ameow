---
name: ameow-release-prep
description: Ameow 专属执行入口：仓库研究与开发、代码健康与架构审查、用户文档、体验与原生验收、双平台发行准备和只读就绪检查。与共享 Ship 协作使用；仅处理 Ameow 项目。
---

# Ameow 执行与交付

本 Skill 维护 Ameow 的项目执行约定，保留原名作为唯一专属入口。先读项目 AGENTS 和当前请求，只加载本次任务需要的 reference；不因进入此 Skill 自动开始构建、全量测试或发行。

## 按当前任务读取

- 接手项目上下文、研究仓库、开发或修复：读 [development.md](references/development.md)，含 GitHub 发现、记忆范围、主线入口和日常验证节奏。
- 用户要求梳理架构、清理冗余、评估双端共用或检查补丁累积：读 [code-health.md](references/code-health.md)；先按所选范围审查，再按授权实施。
- README、手册、演示、Release / Changelog 等公开内容：读 [documentation.md](references/documentation.md)。
- 用户试用、UI/文案/动效或原生交互验收：读 [acceptance.md](references/acceptance.md)。
- 实际安装/打包、准备发 Tag 或正式发行：读 [release.md](references/release.md)。
- 汇总源码/发行就绪、核资产或复用证据：读 [evidence.md](references/evidence.md)，使用本 Skill 的既有只读脚本。

可以跨模式，不要求依次执行。查进度只读当前任务及已有证据；日常修复不加载整套发行流程。
需要 GitHub、来源历史或记忆上下文时，先读 development reference 的“上下文与工具”。

## 项目方法的维护

共享 Ship 维护项目专属入口如何生成、证明和更新；本 Skill 沿用 Ameow 已有规范、工程文档和脚本，方法索引见 development reference。运行方式、操作入口或平台边界变化时同步受影响说明，按本轮目标核验。具体源码、产物身份和一次性验证结果留任务证据，不写成所有版本永久成立的结论。

## 职责与边界

| 位置 | 维护什么 |
| --- | --- |
| 共享 Ship | 通用需求讨论、派发与协作、授权边界、任务记录及回传方式。 |
| 本 Skill | Ameow 的执行、写作、体验验收和发行方法，以及相应脚本路由。 |
| DESIGN.md / .impeccable/design.json | 设计参考、视觉 token 与组件；实际值查关联 Rust，更新时同步。 |
| OpenSpec | 唯一正式行为要求与批准后的变更；本 Skill 不定义或批准产品行为。 |

用户是第一位实际使用者：重要公开文案和 UX 交用户最终审阅，技术检查不替代体验判断；已接受的同版内容不重复批准。日常按影响做必要定向检查，完整验证集中在用户准备发 Tag 后、实际打 Tag 前。
