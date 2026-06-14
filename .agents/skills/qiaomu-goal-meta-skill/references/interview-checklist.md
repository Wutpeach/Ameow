# Goal Interview Checklist

Ask only the questions needed to write a safe and testable goal. If an answer can be inferred with low risk, state the assumption and move on.

Prefer numbered choices with defaults over open-ended questions. The user should be able to reply with `按默认` or `1B 2A 3C`.

## Fast Interview

Use these choices for a very vague but low-risk task:

1. 项目形态：A 新建本地 MVP（默认） / B 改现有项目 / C 先做原型
2. 范围：A 核心流程（默认） / B 加常见增强 / C 做完整产品
3. 验证：A 本地运行检查（默认） / B 真机或线上检查 / C 发布前检查

你可以直接回复：按默认，或回复类似 `1B 2A 3C`。

Use open-ended questions only when choices would hide an important decision.

## Targeted Questions

### Outcome

- Is the desired result a code change, a document, a published artifact, a clean repo state, a deployment, or a verified diagnosis?
- Who is the user or reviewer of the final result?
- Is a "first version" acceptable, or does the task require production-ready completeness?

### Verification

- Are there project-provided commands: `package.json` scripts, Makefile targets, `scripts/`, CI config, Xcode schemes, pytest markers, or deployment checks?
- Does the task need live verification: browser screenshot, mobile viewport, API call, GitHub PR status, published URL, or exported file?
- Should the agent add or update tests, or only run existing checks?

### Constraints

- What public behavior, file format, API contract, schema, or UX should stay unchanged?
- Are secrets, credentials, production data, user content, or private notes in scope?
- Is direct push to default branch forbidden?

### Boundaries

- Which directories are allowed?
- Which files, generated artifacts, caches, or unrelated modules must not be touched?
- Are docs, tests, mocks, or fixtures allowed?

### Iteration Policy

- Should the agent make one focused change and rerun checks after each change?
- After repeated failures, should it inspect logs, search docs, reduce to a minimal repro, or pause?
- Is there a budget cap for attempts, time, or tokens?

### Stop And Pause

- What evidence proves completion strongly enough to stop?
- What blocker requires the user: login, 2FA, paid service, destructive deletion, legal/medical/financial decision, account ownership, or product direction?
- Should partial success be reported with remaining manual steps, or should the agent continue until the full outcome is proven?

## Interview Output Shape

```text
Recommended Executable Goal
/goal Create a first-version local MVP for the requested task, inspect project-provided commands before changing code, implement the core user-visible workflow, and keep unrelated systems unchanged.
Verification: run the smallest project-provided checks, start the local app or relevant runtime, complete the core workflow once, and capture logs/screenshots or command output as evidence.
Constraints: do not add accounts, paid services, production changes, destructive operations, or unrelated features unless requested.
Boundaries: write only inside the new project directory or the directly related existing project files.
Iteration policy: implement one focused workflow at a time, rerun checks after meaningful changes, inspect logs before retrying, and make at most 3 focused improvement rounds before reporting remaining risks.
Stop when: the core workflow is proven by runtime evidence and checks pass or missing checks are explicitly reported.
Pause if: credentials, payments, production data, destructive changes, legal/medical/financial decisions, copyrighted assets, or unclear ownership is required.

Default Reason
- [one concise reason]

Optional Adjustments
1. [decision]: A [recommended] / B [alternative] / C [higher-cost option]

You can reply
- Use defaults, or reply like 1B 2A 3C.
```

## 中文输出形状

中文用户优先用这一版。命令前缀仍然写 `/goal`，不要写 `/目标`。默认先给中文推荐执行版，再给英文兼容版，除非用户明确只要一种语言。

```text
推荐执行版（中文，可直接复制）
/goal 基于用户需求创建第一版本地 MVP，先读取项目已有命令和约束，实现核心用户可见流程，并避免改动无关系统。
验证：运行项目提供的最小相关检查，启动本地应用或对应运行环境，完整走通一次核心流程，并用日志、截图或命令输出作为证据。
约束：不加入账号、付费服务、生产变更、破坏性操作或无关功能，除非用户明确要求。
边界：只写入新项目目录，或只修改现有项目中与该功能直接相关的文件。
迭代策略：一次实现一个聚焦工作流，每次有意义改动后重跑检查，重试前先读日志，最多做 3 轮聚焦改进后报告剩余风险。
完成条件：核心流程有运行证据证明可用，检查通过或明确说明缺少配置。
暂停条件：需要凭证、付费、生产数据、破坏性操作、法律/医疗/金融判断、版权素材或所有权不清时暂停。

默认选择理由：[一句话说明为什么这些默认选项成本最低、风险最稳或最能验证核心价值。]

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

Keep the interview short. The goal is to reduce ambiguity, not make the user fill out a form.
