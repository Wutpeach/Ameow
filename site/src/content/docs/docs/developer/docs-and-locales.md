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
