# Default Goal Strategy

Generate goals that can be copied directly.

The skill should not rely on knowing every domain. Reliability comes from conservative defaults, authoritative context discovery, concrete verification, bounded iteration, and high-risk pause rules.

## Output Priority

For Chinese users, output in this order:

1. `推荐执行版（中文，可直接复制）`
2. `默认选择理由`
3. `可选调整`
4. `你可以直接回复`
5. `Goal Draft (English-compatible)`

Do not put a half-filled template before the recommended executable goal. Users often copy the first block directly.

## Default-First Rule

If the user gives a vague task and the uncertainty is low-risk, choose the best default and move forward.

Good defaults:

- new app/site/tool: local MVP first
- existing repo: inspect project scripts, docs, and conventions first
- no deployment request: local runtime verification only
- no auth request: no login, backend, cloud sync, paid API, or account system
- no design system request: follow existing style; if new project, choose a restrained usable interface
- no test command known: discover package scripts, Makefile, CI config, Xcode schemes, or project docs before inventing commands
- no advanced feature request: implement the smallest complete user-visible workflow

Always add one short reason:

```text
默认选择理由：先做本地 MVP，因为它能最快验证核心体验，同时避免账号、后端和发布流程拖慢第一版。
```

## Lazy-User Choices

Ask with numbered choices only when a decision materially changes cost, risk, or direction.

```text
可选调整
1. 项目形态：A 新建本地 MVP（默认） / B 改现有项目 / C 先做原型
2. 范围：A 核心流程（默认） / B 加常见增强 / C 做完整产品
3. 验证：A 本地运行检查（默认） / B 真机或线上检查 / C 发布前检查

你可以直接回复：按默认，或回复类似 1B 2A 3C。
```

Keep choices short. Do not ask a long open-ended questionnaire.

## Unknown Domain Strategy

When the task touches an unfamiliar or specialized domain, do not invent domain-specific rules. Generate a discovery-first goal.

Use this pattern:

```text
/goal Create a safe first version of [task] by first inspecting authoritative context, then implementing the smallest verified workflow.
Verification: identify and inspect project docs, existing scripts, sample data, domain notes, or official references available in the workspace; run the smallest relevant checks; complete one representative workflow with logs, screenshots, exported artifacts, or command output as evidence.
Constraints: do not invent domain rules, compliance claims, data semantics, or user-facing promises that are not supported by the inspected context.
Boundaries: edit only the files directly required for the first workflow; keep unrelated modules, production data, credentials, and public contracts unchanged.
Iteration policy: complete a discovery pass first, state working assumptions, implement one focused slice, rerun checks, and use new evidence rather than repeated retries after failures.
Stop when: the first workflow works under documented assumptions and evidence proves the result; unresolved domain questions are listed clearly.
Pause if: required domain authority, legal/medical/financial judgment, compliance approval, production data, paid services, or destructive actions are required.
```

This keeps the goal useful without pretending the meta skill knows the domain.

## Risk Classification

Low risk: local prototype, local UI, local docs, toy data, isolated scripts, non-destructive formatting, generated examples.

Medium risk: existing repo changes, public UI copy, migrations in development, shared config, external APIs with test credentials, browser extensions, mobile builds.

High risk: production data, payments, credentials, destructive deletion, legal/medical/financial advice, compliance, privacy-sensitive user data, copyrighted assets, App Store or store submission, live deployment, account ownership, official authorization claims.

Behavior:

- Low risk: choose defaults and generate a copy-ready goal.
- Medium risk: choose defaults, add explicit boundaries and pause conditions.
- High risk: either ask a numbered decision or generate a discovery-only goal that pauses before the risky action.

## Vague Words

Do not ban vague direction words. Translate them into iteration and verification.

Example:

```text
设计方向：克制、专业、有留白，避免模板感和营销页风格。
验证：用桌面和移动端截图检查首屏身份、信息层级、文字可读性、核心入口和布局重叠。
迭代策略：基于截图做最多 3 轮聚焦视觉改进，优先调整层级、间距、字体、素材处理和控件密度。
```

The vague words guide taste. The verification proves whether the result is acceptable.

## Iteration Defaults

Use bounded autonomy:

```text
迭代策略：先实现可运行第一版，再基于构建结果、运行日志和截图做最多 3 轮聚焦改进；同一错误连续失败 2 次后必须换证据来源。
```

Do not write `keep trying` or `until it looks good`.

## Finalization Rule

After the user answers choices, output `最终可复制 /goal` and keep the response mostly to one code block. Do not repeat the full explanation unless asked.
