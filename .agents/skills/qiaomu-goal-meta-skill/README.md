# qiaomu-goal-meta-skill

> 你只想说一句“帮我做个 App”，但 Codex 真正需要的是一个能执行、能验证、知道边界、知道何时停下来的目标。
> qiaomu-goal-meta-skill turns vague work into a copy-ready Codex `/goal` command with defaults, verification, boundaries, and pause conditions.

<p align="center">
  <a href="https://github.com/joeseesun/qiaomu-goal-meta-skill/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/joeseesun/qiaomu-goal-meta-skill?style=for-the-badge&logo=github" /></a>
  <a href="https://github.com/joeseesun/qiaomu-goal-meta-skill/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/joeseesun/qiaomu-goal-meta-skill?style=for-the-badge&logo=github" /></a>
  <a href="https://github.com/joeseesun/qiaomu-goal-meta-skill/issues"><img alt="Issues" src="https://img.shields.io/github/issues/joeseesun/qiaomu-goal-meta-skill?style=for-the-badge&logo=github" /></a>
  <a href="https://github.com/joeseesun/qiaomu-goal-meta-skill/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/joeseesun/qiaomu-goal-meta-skill?style=for-the-badge&logo=git" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge" /></a>
</p>

**中文** | [English](#english)

```bash
npx skills add joeseesun/qiaomu-goal-meta-skill
```

## 为什么值得用

很多 agent 任务失败，不是因为模型不会写代码。

而是因为目标一开始就太松：

- “做得高级一点”
- “帮我开发一个 App”
- “修一下这个问题”
- “做个类似 GTA 的网页游戏”

这些话对人类有感觉，对 agent 却缺少几个关键东西：怎么验证、哪里不能碰、失败后怎么迭代、什么时候必须暂停。

这个 skill 的目标很简单：

让 Codex 在开工前拿到一份更像“任务合同”的 `/goal`。

它会默认给你一段可直接复制的推荐执行版，而不是让你先填表。

## 它会怎么帮你

### 1. 先给可直接复制的推荐版

中文用户默认先看到：

```text
推荐执行版（中文，可直接复制）
/goal 开发一个第一版原创 GTA-like 网页游戏 MVP，用户可以在浏览器中进入一个俯视 2D 城市场景，控制角色步行、上车驾驶、完成一个简单任务，并看到基础状态反馈。
验证：如果已有项目，先读取项目脚本和运行方式；否则新建最小网页游戏项目，启动本地开发服务，在浏览器中完整走通一次进入游戏、移动角色、上车驾驶、触发任务、完成任务、查看状态反馈流程，并检查桌面和移动端布局与控制区无重叠。
约束：不使用 GTA、Rockstar 或任何真实游戏的名称、Logo、角色、地图、音乐、音效、美术素材或受版权保护内容；第一版不加入登录、后端、联机、付费 API、真实暴力血腥表现、复杂 AI 或营销落地页。
边界：如果新建项目，只写入新项目目录；如果在现有项目中工作，只修改与网页游戏画布、输入控制、游戏状态、样式和直接相关测试有关的文件。
迭代策略：先实现可玩的核心循环，再补任务、状态反馈和响应式控制；每次有意义改动后重跑项目检查并启动本地服务验证，遇到运行时或浏览器错误先读控制台日志；最多做 3 轮聚焦体验改进。
完成条件：本地游戏可运行，玩家能完成移动、驾驶、任务触发和任务完成的核心流程，项目检查通过或明确说明缺少配置，并且桌面和移动端验证无布局破损。
暂停条件：需要使用 GTA 官方 IP 或素材、真实版权素材授权、联机服务器、账号系统、支付、上架发布、复杂 3D 开放世界、真实暴力血腥表现或更完整游戏策划时暂停。
```

用户可以直接复制这一段执行。

### 2. 再给一句默认理由

```text
默认选择理由：先做原创俯视 2D MVP，因为它能最快验证“城市移动、驾驶、任务”核心乐趣，同时避开版权和 3D 开放世界的高成本。
```

这句理由很短，但能让你知道 skill 为什么这么选。

### 3. 给懒人选择题

```text
可选调整
1. 项目形态：A 新建本地网页游戏 MVP（默认） / B 改现有项目 / C 先做可交互原型
2. 画面形式：A 俯视 2D（默认） / B 像素风 2D / C Three.js 3D
3. 第一版范围：A 步行+驾驶+一个任务（默认） / B 加警戒/追逐系统 / C 加多任务和商店
4. 验证方式：A 本地浏览器桌面+移动检查（默认） / B 加自动化测试 / C 部署后线上验证

你可以直接回复：按默认，或回复类似 1A 2B 3B 4A。
```

不用写长句，回选项就能继续收敛。

### 4. 同时给英文兼容镜像

英文版字段保留 `Verification`、`Constraints`、`Boundaries`、`Iteration policy`、`Stop when`、`Pause if`，方便复制到偏英文的 agent 环境或团队文档。

## 什么时候用

适合：

- 开发一个网站、App、游戏、Chrome 插件、自动化脚本
- 修 bug、做重构、加测试、跑发布
- 设计一个 UI 或产品原型
- 创建、整理、发布 agent skill
- 做多步骤研究或文档交付
- 把一句模糊需求变成可执行任务

不适合：

- 一句话翻译
- 简单改写
- 一行 shell 输出
- 不需要持续执行和验证的小任务

## 安装

```bash
npx skills add joeseesun/qiaomu-goal-meta-skill
```

安装后确认：

```bash
test -f ~/.agents/skills/qiaomu-goal-meta-skill/SKILL.md
```

## 你可以这样说

- “用 qiaomu-goal-meta-skill 帮我把这个需求写成 Codex /goal。”
- “我要开发一个 iOS 提词器，帮我写 goal。”
- “我要做一个 GTA 网页游戏，帮我写一个安全可执行的 goal。”
- “这个任务太模糊，先给推荐执行版，再给我几个可选调整。”
- “帮我把修 bug 的任务写成带验证和暂停条件的 goal。”
- “给这个发布任务写一个不能直接乱推主分支的 goal。”
- “这个是医疗/金融/版权相关任务，帮我写发现优先的 goal。”

## 工作方式

```mermaid
flowchart LR
  A["用户的模糊需求"] --> B["选择保守默认值"]
  B --> C["生成推荐执行版 /goal"]
  C --> D["补验证、约束、边界"]
  D --> E["补迭代、完成、暂停条件"]
  E --> F["给编号可选调整"]
  F --> G["给英文兼容镜像"]
```

## 内置原则

### 默认先推进

低风险不确定性，不拦用户填表。

它会做明确假设，给最佳默认方案。

### 高风险才暂停

遇到这些情况会写进 `暂停条件`：

- 凭证、账号、支付
- 生产数据、破坏性操作
- 法律、医疗、金融判断
- 版权素材、官方授权
- 上架发布、真实部署
- 所有权或产品方向不清

### 陌生领域先发现

meta skill 不假装懂所有专业领域。

如果任务涉及医疗、金融、合规、复杂专业数据，它会生成“发现优先”的 goal：

```text
/goal 创建一个安全的医疗影像标注工具第一版，先读取工作区内的项目文档、样例数据说明和可用脚本，再实现最小可验证标注流程。
验证：识别并读取项目文档、样例数据说明、现有脚本或官方参考资料；运行最小相关检查；用样例数据完整走通一次导入、标注、保存、重新打开流程，并以日志、截图或导出文件作为证据。
约束：不编造医学结论、合规声明、数据语义或诊断用途；不处理生产患者数据；不改变未理解的数据格式。
边界：只修改第一版标注流程直接需要的界面、状态和样例数据处理文件；不触碰生产配置、凭证或无关模块。
迭代策略：先完成发现阶段并列出工作假设，再实现一个聚焦切片；每次失败后基于日志或文档调整，最多做 3 轮聚焦改进。
完成条件：样例数据下的最小标注流程有运行证据证明可用，检查通过或明确说明缺少配置，未解决的领域问题被列出。
暂停条件：需要医疗判断、合规审批、真实患者数据、外部付费服务、生产部署或破坏性数据迁移时暂停。
```

### 模糊词不删除，翻译成验证

“高级”“有质感”“专业”“像官网”不是坏词。

坏的是把它们当完成标准。

这个 skill 会把它们变成：

- 设计方向
- 截图检查
- 层级、间距、字体、可读性
- 最多 3 轮聚焦视觉改进

## 本地质量检查

这个仓库带了一个轻量 linter：

```bash
python3 ~/.agents/skills/qiaomu-goal-meta-skill/scripts/lint_goal_command.py goal.txt
```

它会拦住：

- `/目标` 这种不可执行前缀
- `[Outcome]`、`TODO`、`待定` 这类占位符
- `make sure it works`
- `随便改`
- `edit anything`
- `keep trying`
- 缺少具体证据的验证条件

## 前置要求

- [ ] 已安装支持 Agent Skills 的运行环境，例如 Codex、Claude Code 或兼容工具。
- [ ] 已安装 Node.js 和 `npx`，用于执行 `npx skills add`。
- [ ] 运行环境能读取 `~/.agents/skills`。

## Troubleshooting

| 问题 | 原因 | 解决方法 |
|---|---|---|
| 没有触发这个 skill | 运行环境未加载本地 skills，或安装路径不对 | 运行 `test -f ~/.agents/skills/qiaomu-goal-meta-skill/SKILL.md`，确认安装位置 |
| 输出还是 `/目标` | 使用了中文别名而不是 Codex 可执行命令 | 要求它“命令前缀必须保持 `/goal`，正文可以中文” |
| 输出像模板，有占位符 | 没有按推荐执行版生成 | 要求“不要输出 `[Outcome]` 等占位符，给可直接复制版” |
| 验证太空 | 目标里只有“确认可用” | 要求补充命令、日志、截图、浏览器/模拟器检查或产物路径 |
| agent 太早停下 | `暂停条件` 写得过宽 | 把低风险不确定性改成工作假设，只保留账号、付费、生产、版权、发布等高风险暂停 |

## 边界

- 这个 skill 只创建 `/goal` 指令，不默认执行目标本身。
- 它不会替用户绕过版权、账号、支付、生产数据或合规判断。
- 它不会把陌生领域的专业规则编造成“事实”。
- 它默认生成 MVP 级目标；完整产品策略、商业化、部署和发布需要明确要求。

## License

MIT

Copyright (c) 向阳乔木  
X: https://x.com/vista8  
GitHub: https://github.com/joeseesun/

<a name="english"></a>
## English

qiaomu-goal-meta-skill turns vague work into a copy-ready Codex `/goal` command.

It is built for people who do not want to fill out a planning form.

It chooses conservative defaults, explains them in one sentence, gives numbered options when a choice really matters, and mirrors the final goal with English-compatible field labels.

Install:

```bash
npx skills add joeseesun/qiaomu-goal-meta-skill
```

Use it like this:

- "Use qiaomu-goal-meta-skill to turn this vague app idea into a Codex goal."
- "Write a goal for an iOS teleprompter MVP."
- "Write a safe goal for a GTA-like browser game without copyrighted IP."
- "This domain is unfamiliar. Make the goal discovery-first."

It produces goals with:

- outcome
- verification evidence
- constraints
- write boundaries
- iteration policy
- stop conditions
- pause conditions

It intentionally avoids:

- placeholders in executable drafts
- vague verification like "make sure it works"
- broad permissions like "edit anything"
- infinite retry language like "keep trying"
- unsafe scope expansion into auth, payment, production data, copyrighted assets, or regulated decisions

Author:

Copyright (c) 向阳乔木  
X: https://x.com/vista8  
GitHub: https://github.com/joeseesun/
