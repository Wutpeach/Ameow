---
title: 文档站开发
description: 构建 Astro / Starlight 站点并同步中英文内容。
---

文档站位于独立的 `site/`，需要 Node.js >= 22.19.0。从仓库根目录执行：

```sh
npm ci --prefix site
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run preview
```

- 中文在 `site/src/content/docs/docs/`，英文在 `site/src/content/docs/en/docs/`。修改时同步事实、路由与链接。
- 导航和定向重定向在 `site/astro.config.mjs`。有效内容迁移时保留必要书签；失效功能直接移除，避免继续被搜索命中。
- 操作图例位于 `site/src/components/manual/`，按其 README 复用真实控件关系与主题；示意图需短图注和准确替代说明。

`npm run build` 包含构建产物的路由、双语和内链检查。相关 PR 运行 Pages 构建检查；相关 `main` 推送或手动工作流可部署到 [wutpeach.github.io/Ameow](https://wutpeach.github.io/Ameow/)。网站部署与应用发行各自独立。

[返回开发资料](../)
