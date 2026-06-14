# Goal Command Playbook

## What This Skill Produces

This skill produces a Codex `/goal` command.

For Chinese users, the body of the goal can be fully Chinese, but the slash command should still start with `/goal`. Do not use `/目标` as the executable command unless the current Codex client explicitly supports that alias.

A normal prompt tells the agent what to do now. A goal defines a durable operating contract: what outcome matters, how completion is proven, what must not change, where work may happen, how to iterate, when to stop, and when to pause.

Default stance: give the best copy-ready goal first. If the user is vague and the missing details are low-risk, choose conservative defaults and include one short reason instead of making the user fill out a form.

Use `/goal` for work that benefits from persistence:

- coding, debugging, refactoring, release, or deployment work
- UI or product changes that need verification
- multi-step research or document production
- repo cleanup, migration, or packaging
- any task where "done" must be proven with commands, artifacts, screenshots, logs, or external state

Do not force `/goal` for:

- one-line answers
- simple rewrites or translations
- quick shell outputs
- tasks whose success is obvious without agent persistence

## Plan-To-Goal Interview Template

Use this when the user has a vague task and wants the agent to help write the goal:

```text
/plan Help me turn this vague task into a strong Codex goal.
Interview me for missing success criteria, verification commands, constraints, boundaries, iteration policy, and blocked stop conditions.
Then draft a final `/goal ...` command.
```

## Canonical Goal Template

```text
/goal [Outcome].
Verification: [commands/artifacts/evidence].
Constraints: [what must not change].
Boundaries: [allowed writes / forbidden paths].
Iteration policy: [one focused change, rerun checks, log progress].
Stop when: [evidence proves completion].
Pause if: [blocked conditions / human decisions / budget cap].
```

## 中文友好模板

给中文用户时，推荐默认输出这一版。注意：开头仍然是 `/goal`，不是 `/目标`。

```text
/goal [目标结果]。
验证：[命令 / 产物 / 截图 / 日志 / 外部证据]。
约束：[不能改变的行为、接口、数据、风格或分支规则]。
边界：[允许写入的位置 / 禁止触碰的路径或系统]。
迭代策略：[一次只做一个聚焦改动，重跑检查，基于日志调整]。
完成条件：[哪些证据证明可以停止]。
暂停条件：[需要人工决定、凭证、外部权限、预算或破坏性操作的情况]。
```

也可以使用双语字段，适合要兼顾中文可读性和英文模板兼容性的场景：

```text
/goal [目标结果]。
Verification（验证）：[命令 / 产物 / 截图 / 日志 / 外部证据]。
Constraints（约束）：[不能改变的行为、接口、数据、风格或分支规则]。
Boundaries（边界）：[允许写入的位置 / 禁止触碰的路径或系统]。
Iteration policy（迭代策略）：[一次只做一个聚焦改动，重跑检查，基于日志调整]。
Stop when（完成条件）：[哪些证据证明可以停止]。
Pause if（暂停条件）：[需要人工决定、凭证、外部权限、预算或破坏性操作的情况]。
```

## 双语草案策略

当用户使用中文、任务还在收敛中，默认先给可直接复制的推荐版，再给英文兼容镜像：

1. `推荐执行版（中文，可直接复制）`：给用户直接复制，字段名用中文。
2. `Goal Draft (English-compatible)`：给 Codex、团队文档或偏英文工具链复制使用，字段名用英文。

两份草案必须语义一致，不能一份扩大范围、一份缩小范围。英文版是兼容镜像，不是重新发挥。

如果用户明确说“只要中文版”或“只要英文版”，遵从用户要求。

```text
推荐执行版（中文，可直接复制）
/goal 基于用户需求创建第一版本地 MVP，先读取项目已有命令和约束，实现核心用户可见流程，并避免改动无关系统。
验证：运行项目提供的最小相关检查，启动本地应用或对应运行环境，完整走通一次核心流程，并用日志、截图或命令输出作为证据。
约束：不加入账号、付费服务、生产变更、破坏性操作或无关功能，除非用户明确要求。
边界：只写入新项目目录，或只修改现有项目中与该功能直接相关的文件。
迭代策略：一次实现一个聚焦工作流，每次有意义改动后重跑检查，重试前先读日志，最多做 3 轮聚焦改进后报告剩余风险。
完成条件：核心流程有运行证据证明可用，检查通过或明确说明缺少配置。
暂停条件：需要凭证、付费、生产数据、破坏性操作、法律/医疗/金融判断、版权素材或所有权不清时暂停。

默认选择理由：先做本地 MVP，因为它能最快验证核心体验，同时避免账号、后端和发布流程拖慢第一版。

可选调整
1. 项目形态：A 新建本地 MVP（默认） / B 改现有项目 / C 先做原型
2. 范围：A 核心流程（默认） / B 加常见增强 / C 做完整产品
3. 验证：A 本地运行检查（默认） / B 真机或线上检查 / C 发布前检查

你可以直接回复：按默认，或回复类似 1B 2A 3C。

Goal Draft (English-compatible)
/goal Create a first-version local MVP for the requested task, inspect project-provided commands before changing code, implement the core user-visible workflow, and keep unrelated systems unchanged.
Verification: run the smallest project-provided checks, start the local app or relevant runtime, complete the core workflow once, and capture logs/screenshots or command output as evidence.
Constraints: do not add accounts, paid services, production changes, destructive operations, or unrelated features unless requested.
Boundaries: write only inside the new project directory or the directly related existing project files.
Iteration policy: implement one focused workflow at a time, rerun checks after meaningful changes, inspect logs before retrying, and make at most 3 focused improvement rounds before reporting remaining risks.
Stop when: the core workflow is proven by runtime evidence and checks pass or missing checks are explicitly reported.
Pause if: credentials, payments, production data, destructive changes, legal/medical/financial decisions, copyrighted assets, or unclear ownership is required.
```

The six practical elements are:

| Element | Question it answers | Good content |
|---|---|---|
| Outcome | What should be true at the end? | A user-visible or repo-visible result |
| Verification | How do we prove it? | Commands, tests, builds, screenshots, logs, API checks, files |
| Constraints | What must not change? | Behavior, public API, data shape, style, secrets, branch rules |
| Boundaries | Where may the agent write? | Allowed directories, forbidden paths, no unrelated refactors |
| Iteration | How should failures be handled? | One focused change, rerun checks, inspect logs before retrying |
| Stop/Pause | When does work end or wait? | Completion evidence, auth blockers, destructive choices, budget caps |

中文对应：

| 要素 | 回答的问题 | 好内容 |
|---|---|---|
| 目标结果 | 最后要变成什么状态？ | 用户可见或仓库可见的结果 |
| 验证 | 怎么证明完成？ | 命令、测试、构建、截图、日志、API 检查、文件 |
| 约束 | 什么不能变？ | 行为、公开 API、数据结构、风格、密钥、分支规则 |
| 边界 | 可以写哪里？ | 允许目录、禁止路径、不做无关重构 |
| 迭代策略 | 失败后怎么继续？ | 小步改动、重跑检查、先读日志再换策略 |
| 完成/暂停 | 什么时候停止或等人？ | 完成证据、登录/权限阻塞、破坏性选择、预算上限 |

## Drafting Rules

- Write the outcome as a result, not as "work on X".
- Put exact commands in `Verification` when the repo exposes them.
- If exact commands are unknown, make discovery part of the goal: read package scripts, Makefile, CI config, Xcode schemes, project docs, or local runbooks first.
- Put artifacts in `Verification` when commands are not enough: changed files, screenshots, exported PDFs, published URL, GitHub PR, logs, or API response.
- Put "what must not change" in `Constraints`, not in `Boundaries`.
- Put filesystem and repo permissions in `Boundaries`.
- In `Iteration policy`, require a new source of evidence after repeated failures.
- In `Stop when`, define proof, not a feeling.
- In `Pause if`, include anything that needs human judgment or external permission.
- If the domain is unfamiliar or specialized, do not invent domain rules. Require an initial discovery pass over authoritative project docs, sample data, official references, or user-provided material.
- Allow model taste and implementation judgment inside the boundary, but do not allow scope expansion or weaker verification.

## Strong Examples

### Bug Fix

```text
/goal Fix the checkout discount bug so percentage coupons apply once per order and fixed-value coupons still stack with gift-card credit.
Verification: run the repo's checkout unit tests, add or update a regression test for percentage coupons, and run the smallest relevant lint/typecheck command from package scripts.
Constraints: do not change public coupon API names, database schema, gift-card behavior, or unrelated checkout UI copy.
Boundaries: edit only checkout pricing logic, coupon tests, and directly required fixtures; do not touch payment provider configuration or migration files.
Iteration policy: make one focused change at a time, rerun the failing check after each change, and inspect test output before changing strategy.
Stop when: the regression test fails before the fix, passes after the fix, and the relevant lint/typecheck command passes.
Pause if: payment credentials, production data, a schema migration, or a product decision about stacking rules is required.
```

### UI Polish

```text
/goal Make the editor toolbar usable on mobile without horizontal overflow or overlapping controls.
Verification: run the configured frontend checks, open the local app, capture desktop and mobile screenshots, and confirm no text/control overlap in the toolbar.
Constraints: preserve existing editor commands, keyboard shortcuts, saved document format, and visual identity.
Boundaries: edit only toolbar layout/components/styles and directly related tests; do not redesign the editor shell or change document serialization.
Iteration policy: adjust one layout issue at a time, rerun checks, and use screenshots to compare before/after.
Stop when: checks pass and screenshots show the toolbar fits at desktop and mobile widths with all primary controls accessible.
Pause if: the design requires removing a primary command, adding a new design system dependency, or changing product navigation.
```

### Skill Creation

```text
/goal Create a local agent skill named qiaomu-example-skill that packages the provided workflow into a reusable SKILL.md, README.md, agents/interface.yaml, references, and a lightweight validation script.
Verification: inspect the generated files, run YAML/JSON syntax checks if present, run the validation script on a sample output, and confirm the skill directory exists under ~/.agents/skills/qiaomu-example-skill.
Constraints: keep the skill concise, Chinese-first when appropriate, and include 向阳乔木 copyright/contact metadata; do not publish to GitHub unless explicitly requested.
Boundaries: write only under ~/.agents/skills/qiaomu-example-skill and any explicitly requested temporary verification files; do not modify existing unrelated skills.
Iteration policy: create the minimal package first, validate structure, then add only references or scripts that improve reliability.
Stop when: all required files exist, validation passes, and the README explains usage, boundaries, and local checks.
Pause if: the workflow requires private credentials, external publishing, unclear ownership, or a naming change from the user.
```

## Anti-Patterns

Weak:

```text
/goal Improve the app.
```

Better:

```text
/goal Reduce the dashboard's first-screen clutter so a returning user can see today's key metrics and complete the primary action without scrolling.
Verification: run frontend checks, open the local app, capture desktop and mobile screenshots, and verify no text overlap or hidden primary action.
Constraints: keep existing data sources, routing, auth flow, and analytics events unchanged.
Boundaries: edit only dashboard view components, layout styles, and directly related tests.
Iteration policy: change one visual/workflow issue at a time, rerun checks, and compare screenshots after each meaningful layout change.
Stop when: checks pass and screenshots show the key metrics plus primary action in the first viewport on desktop and mobile.
Pause if: new product priorities, new analytics events, or backend API changes are required.
```

Avoid:

- verification like `make sure it works`
- boundaries like `edit whatever is needed`
- iteration like `keep trying`
- stop conditions like `when it seems good`
- pause conditions omitted for auth, payment, destructive operations, or private data
