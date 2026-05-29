# Design: Ameow site documentation quality rewrite

## Objective

把现有 Starlight 文档从“链接索引型内容”改为“任务完成型内容”。用户进入任何一个工作流、安装或排查页面，都应能在当前页面内完成主要操作；跨页链接只承担延伸阅读、背景补充和下一步导航。

## Claude Consultation Summary

Claude 认同当前方向，但指出必须把“当前页直接回答”变成可验证规则。采纳建议如下：

- 增加自包含规则：遮住所有链接后，页面仍应能完成核心任务。
- FAQ 不应只藏在“故障排查”组；建议移到“入门”组末尾。
- `browser-extension.md` 应是完整 walkthrough，不应只是子页面 hub。
- `troubleshooting/download-failures.md` 必须写成分支决策树，而不是原因列表。
- `concepts.md` 要么成为完整概念说明，要么缩短为心智模型；首轮选择完整概念说明。
- 桌面端工作流页也需要按 workflow 模板补足成功状态和示例。
- 图片占位应收敛为 `截图：` 和 `示意图：` 两类，并建立占位到文件名的 README 清单。

暂不采纳或延后：

- 不合并 `extension/install.md` 与 `extension/connection.md`，因为本轮优先保留现有 URL 和导航结构。
- 不拆分 Release Notes，继续保留单页归档。

## Page Model

### Workflow Pages

适用于：

- `getting-started.md`
- `downloads.md`
- `browser-extension.md`
- `extension/install.md`
- `extension/connection.md`
- `desktop/*.md`
- `advanced/*.md`

每页结构建议：

1. 这页解决什么问题。
2. 开始前需要什么。
3. 最短可执行路径。
4. 每一步的操作、预期画面、成功判断。
5. 常见误解或失败点。
6. 下一步或延伸阅读。

### Troubleshooting Pages

适用于：

- `troubleshooting/download-failures.md`
- `troubleshooting/extension-disconnected.md`
- `troubleshooting/macos-first-run.md`
- `troubleshooting/missing-files.md`
- `faq.md`

每页结构建议：

1. 你会看到什么现象。
2. 先做 30 秒快速判断。
3. 分支排查路径。
4. 每个分支的具体操作。
5. 处理后应该看到什么。
6. 仍失败时的下一步。

FAQ 仍可更短，但每个答案必须包含可执行快速答案，不允许只有“请看链接”。

## Sidebar Changes

已确认调整：

- `FAQ` 从“故障排查”移动到“入门”组末尾。
- “故障排查”保留具体专题：
  - 排查入口
  - macOS 首次启动
  - 扩展未连接
  - 下载失败
  - 找不到文件

推荐同步调整：

- “入门”顺序调整为：
  - 文档首页
  - 下载 Ameow
  - 基础概念
  - 快速上手
  - FAQ
- “桌面端使用”顺序调整为：
  - 悬浮窗口
  - 输出目录
  - 文件与文件夹
  - 链接与下载队列
  - 常用设置

## Image Placeholder Contract

占位类型：

- `[截图：具体画面描述]`
- `[示意图：具体流程或关系描述]`

目录：

```text
site/public/images/docs/
```

命名：

```text
{page-slug}-{what-it-shows}.png
```

需要创建：

```text
site/public/images/docs/README.md
```

README 表格列：

| 页面 | 占位文本 | 文件名 | 说明 |
| --- | --- | --- | --- |

## Rewrite Priority

### P0

- `getting-started.md`
- `downloads.md`
- `faq.md`
- `browser-extension.md`
- `extension/install.md`
- `extension/connection.md`
- `troubleshooting/download-failures.md`
- `troubleshooting/macos-first-run.md`

### P1

- `desktop/floating-window.md`
- `desktop/output-folder.md`
- `desktop/files-and-folders.md`
- `desktop/links-and-queue.md`
- `desktop/settings.md`
- `troubleshooting/extension-disconnected.md`
- `troubleshooting/missing-files.md`

### P2

- `concepts.md`
- `extension/supported-sites.md`
- `extension/cookies-and-login.md`
- `advanced/quality-and-formats.md`
- `advanced/ae-compatibility.md`
- `advanced/download-dependencies.md`
- `index.mdx`

### Mostly Preserve

- `releases/index.md`

## Quality Checks

- Build: `npm run build` in `site/`.
- Internal link check: generated HTML hrefs resolve under `/ameow-site`.
- Self-containedness review: hide links mentally or mechanically; page still answers its task.
- Pure jump-link phrases: count `请看 [` and `详见 [`; target ≤ 2 per page.
- Substance threshold: ordinary topic pages below about 400 substantive Chinese characters need review.
- Image placeholder coverage: workflow and troubleshooting pages have relevant placeholders near visual steps.
- Tone consistency: no mixed `您` / `你` style unless quoted.
- Troubleshooting branch check: each troubleshooting page has at least one explicit branch question.
