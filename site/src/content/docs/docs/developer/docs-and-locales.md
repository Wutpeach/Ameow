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

维护时在独立分支处理必要的双语变更。`scripts/docs-sync.mjs` 为原任务保存 PR 和恢复记录，不另建调度器：同一主题先查找并复用原 PR；创建回执丢失时重新查询，失败不推进游标。运行 `node --test scripts/docs-sync.test.mjs` 可检查这些恢复边界。

Lead 仅在独立 Check Worker 对当前 PR HEAD 明确 PASS、必要 CI 成功且无越界或冲突时正常合并，再确认 Pages 部署。Worker 负责审核，不修改或合并；REPAIR、BLOCK 或执行失败应停止并通知。已合并但部署失败的 PR 仍保持待恢复状态。

脚本的 `status` 读取进度；`publish` 接收含 `through`、`topic`、`title`、`body` 的 JSON 文件，复用 `docs/sync-<topic>` 分支上的 PR；`failure` 保存含 `reason` 的失败记录；`complete` 接收实际审查的 `through`、`reason` 和 `evidence` 数组，在检查已记录 PR 的合并及部署后保存结果并原子更新游标。所有写入以 `D:/Ameow` 为状态目录，避免 worktree 各自推进。

主线在执行中变化、历史分叉、PR HEAD 变化或状态不明时先补查，不伪造成功。文档自身的合并只需确认没有新增产品变化，记录结果并推进进度，避免重复生成 PR。脚本不代替源码审查或 Worker PASS，也不会自行合并、恢复定时任务或发布 Rust 安装包。
