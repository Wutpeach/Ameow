---
title: 文档站点与本地化
description: 独立文档站点的开发、语言和部署。
---

文档站使用 Astro / Starlight，位于独立的 `site/`，需要 Node.js >= 22.19.0。在仓库根目录执行：

```powershell
npm ci --prefix site
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run preview
```

中文页面位于 `site/src/content/docs/docs/`，英文页面位于 `site/src/content/docs/en/docs/`。修改时保持两种语言的事实和链接同步；侧边栏配置在 `site/astro.config.mjs`。站点构建会运行其构建校验脚本。

GitHub Pages 工作流在相关 pull request 上构建；`main` 上的相关 push 或手动运行可部署。站点地址为 [wutpeach.github.io/Ameow](https://wutpeach.github.io/Ameow/)。旧 Electron 扩展的 locales 同步流程不属于当前站点构建。

## 自动维护与恢复

Ameow Docs Sync 使用 Cindy 原生调度和现有前置检查；定期执行是否开启，以 Cindy 中的实际状态为准。前置检查比较远端 `main` 与独立 SHA 游标：无变化跳过模型，检查失败阻止执行。它不会通过运行时间推断已经审查的提交。

维护时在独立分支处理必要的双语变更。`scripts/docs-sync.mjs` 为原任务保存 PR 和恢复记录，不另建调度器：同一主题优先复用唯一开放 PR；创建回执丢失时重新查询，失败不推进游标。上一轮完成且没有 pending 后，只有确认分支是新的 HEAD 并显式传入 `newRound: true`，才可为同主题开始下一轮。历史 PR 不阻止新一轮，但未完成或已关闭的 pending 不能被替换。运行 `node --test scripts/docs-sync.test.mjs` 可检查这些恢复边界。

Lead 仅在独立 Check Worker 对当前 PR HEAD 明确 PASS、必要 CI 成功且无越界或冲突时正常合并。涉及 `site/` 或 Pages 工作流的变更必须确认成功部署；部署可以对应合并提交，也可以对应已审查主线范围内、包含该合并的后续提交。其他文档或脚本变更单独记录为无需站点部署。Worker 负责审核，不修改或合并；REPAIR、BLOCK 或执行失败应停止并通知。已合并但必要部署失败的 PR 仍保持待恢复状态。

脚本的 `status` 读取进度；`publish` 接收含 `through`、`topic`、`title`、`body` 的 JSON 文件，复用 `docs/sync-<topic>` 分支上的 PR；`failure` 保存含 `reason` 的失败记录；`complete` 接收实际审查的 `through`、`reason` 和 `evidence` 数组，在检查已记录 PR 的合并及部署后保存结果并原子更新游标。所有写入以 `D:/Ameow` 为状态目录，避免 worktree 各自推进。

在同步远端主线后，先运行 `node scripts/docs-sync.mjs status` 并恢复 pending：开放 PR 继续当前 HEAD 的审核；已合并 PR 继续必要的部署核对，不再 publish。其余写命令使用 `node scripts/docs-sync.mjs <command> <input.json>`。`through` 必须是已实际检查的远端 main 完整 SHA；主线移动后先补查并更新输入。发布只登记待审状态，不能代替 Worker PASS。成功清理本轮临时资源后再 complete，避免游标已推进而中断的清理被前置检查跳过。

完成记录保留实际 `mergeSha`、最终阶段和部署证据：需要站点部署时为 `deployed`，含 deployment ID、SHA 和状态链接；否则为 `merged_no_pages_required`，明确标记无需部署。先保存完成记录，再原子写游标；写游标中断后可安全重试。遇未知锁、PR 身份变化或证据不完整时停止，不自动丢弃恢复资料。

主线在执行中变化、历史分叉、PR HEAD 变化或状态不明时先补查，不伪造成功。文档自身的合并只需确认没有新增产品变化，记录结果并推进进度，避免重复生成 PR。脚本不代替源码审查或 Worker PASS，也不会自行合并、恢复定时任务或发布 Rust 安装包。
