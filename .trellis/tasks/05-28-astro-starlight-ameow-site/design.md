# Design: Astro Starlight docs site

## Architecture

采用双仓架构：

- 主仓库 `Ameow`：继续承载桌面端、浏览器扩展、发布脚本、release notes 和当前 Markdown 文档源资料。
- 独立站点仓库 `ameow-site`：承载 Astro/Starlight 站点源码、静态资源、GitHub Pages workflow 和站点内容。
- 主仓库通过 git submodule 引用 `ameow-site`，推荐路径 `site/`。

该结构让站点构建与发布完全发生在公开的 `ameow-site` 仓库中，主仓库不新增 Pages 构建负担。

## Site Layout

推荐 `ameow-site` 结构：

```text
ameow-site/
  .github/
    workflows/
      deploy.yml
  public/
    favicon.svg
    images/
      preview-desktop.svg
      preview-browser.svg
      preview-settings.svg
      extension-install.svg
  src/
    assets/
    components/
      home/
    content/
      docs/
        index.mdx
        getting-started.md
        browser-extension.md
        faq.md
        downloads.md
    layouts/
      HomeLayout.astro
    pages/
      index.astro
  astro.config.mjs
  package.json
  package-lock.json
  tsconfig.json
```

## Routing

- `/`：Astro 自定义产品官网首页。
- `/docs/`：Starlight 文档首页。
- `/docs/getting-started/`：快速上手。
- `/docs/browser-extension/`：浏览器扩展。
- `/docs/faq/`：FAQ。
- `/docs/downloads/`：下载和 Release 入口。

Starlight 的默认文档体验保留给 `/docs/` 下的内容。首页不使用 Starlight 的 hero 模板，而是 `src/pages/index.astro` + 自定义组件和 CSS。

## GitHub Pages Configuration

`ameow-site` 是项目页仓库，不是 `wutpeach.github.io` 特殊仓库，因此 Astro 需要配置：

```js
export default defineConfig({
  site: 'https://wutpeach.github.io',
  base: '/ameow-site',
  integrations: [
    starlight({
      title: 'Ameow',
      sidebar: [
        {
          label: '指南',
          items: [
            { label: '快速上手', slug: 'getting-started' },
            { label: '浏览器扩展', slug: 'browser-extension' },
            { label: 'FAQ', slug: 'faq' },
            { label: '下载', slug: 'downloads' },
          ],
        },
      ],
    }),
  ],
})
```

部署 workflow 推荐使用 Astro 官方 GitHub Action：

- `push` 到 `main` 自动部署。
- `workflow_dispatch` 支持手动部署。
- `permissions` 包含 `contents: read`、`pages: write`、`id-token: write`。
- build job 使用 `withastro/action`。
- deploy job 使用 `actions/deploy-pages`。

GitHub 仓库设置中需要把 Pages Source 设为 GitHub Actions。

## Homepage IA

首页首屏目标是快速说明 Ameow 是什么，并提供下载与文档入口。

建议区块：

- Hero：产品名、简短价值描述、下载按钮、文档按钮。
- Product Preview：使用现有 `docs/readme/*.svg` 作为产品截图/预览。
- Workflows：拖拽文件、粘贴链接、浏览器扩展发送到桌面。
- Platforms：Windows Installer/Portable、macOS Apple Silicon DMG。
- Extension：浏览器扩展如何连接桌面端。
- Footer：GitHub、Releases、Docs、License/credits。

视觉方向：产品官网可以比文档页更自由，但应避免复杂动画和重型前端框架。优先静态 Astro/CSS，保留快加载和 GitHub Pages 兼容性。

## Documentation IA

MVP 文档以现有中文资料迁移为主：

- `docs/index.mdx`：文档入口，指向快速上手、浏览器扩展、FAQ、下载。
- `getting-started.md`：迁移 `docs/getting-started.md`。
- `browser-extension.md`：迁移 `docs/browser-extension.md`。
- `faq.md`：迁移 `docs/faq.md`。
- `downloads.md`：整理 README 下载入口和 Releases 链接。

当前英文文档已有源内容，但 MVP 推荐先中文主站。后续若要双语，可以使用 Astro/Starlight i18n，而不是复制一套临时英文导航。

## Submodule Strategy

主仓库推荐添加：

```bash
git submodule add https://github.com/Wutpeach/ameow-site.git site
git submodule update --init --recursive
```

协作约定：

- `site/` 内的提交属于 `ameow-site` 仓库。
- 主仓库只提交 `.gitmodules` 和 submodule 指针更新。
- 修改站点时先在 `site/` 内提交并推送，再回到主仓库提交新的 submodule 指针。
- 不把 `site/node_modules` 或构建产物提交到主仓库。

风险：如果 `ameow-site` 仍为空仓库，直接 `git submodule add` 可能无法检出工作树。实施时应先初始化并推送 `ameow-site` 的默认分支，再把它添加为主仓库 submodule。

## Compatibility and Rollback

- 站点仓库失败不会影响主仓库应用构建。
- GitHub Pages 部署失败时回滚方式是 revert `ameow-site` 的站点提交或重新部署上一版。
- Submodule 集成失败时可以从主仓库移除 `.gitmodules` 和 `site` gitlink；不会影响应用源码。
- 如后续改用自定义域名，需要移除或调整 `base`，添加 `public/CNAME`，并更新 `site`。

## References

- Astro GitHub Pages deployment: https://docs.astro.build/en/guides/deploy/github/
- Starlight Getting Started: https://starlight.astro.build/getting-started/
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
