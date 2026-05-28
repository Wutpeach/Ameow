# Astro Starlight docs site

## Goal

为 Ameow 建立一个独立的公开文档/官网仓库 `ameow-site`，使用 Astro Starlight 承载文档，用 Astro 自由页面承载更像产品官网的首页，并通过 GitHub Pages 发布。主仓库保留为应用源码仓库，通过 git submodule 引用 `ameow-site`，方便在主仓库中查看和同步文档站源码指针。

## User Value

- 用户可以从一个公开站点了解 Ameow、下载应用、阅读快速上手、浏览器扩展和 FAQ。
- 文档站源码与应用主仓库隔离，避免把文档构建放进主仓库发布链路。
- 首页可以更自由地展示产品价值、下载入口和视觉资产，文档部分保持 Starlight 默认体验，降低维护成本。

## Confirmed Facts

- 目标站点仓库：`https://github.com/Wutpeach/ameow-site.git`。
- `git ls-remote https://github.com/Wutpeach/ameow-site.git HEAD` 当前未返回 HEAD，推断该仓库存在但可能尚未初始化默认分支。
- 主仓库当前没有 git submodule。
- 主仓库已有用户文档和素材：
  - `README.md` / `README.en.md`
  - `docs/getting-started.md` / `docs/getting-started.en.md`
  - `docs/browser-extension.md` / `docs/browser-extension.en.md`
  - `docs/faq.md` / `docs/faq.en.md`
  - `docs/readme/*.svg`
  - `release-notes/`
- 主仓库已有 `.github/workflows/release.yml` 等应用发布工作流，但没有 Pages 工作流。
- 旧规划任务 `03-12-github-pages-docusaurus-public-docs` 已确认过：公开 docs 仓库内独立构建和发布可以避免消耗私有主仓库 Actions 预算。
- Astro 官方 GitHub Pages 文档建议使用 `withastro/action`，并在 `astro.config.mjs` 设置 `site` 和通常需要的 `base`。
- Starlight 官方入门文档建议使用 `npm create astro@latest -- --template starlight` 初始化，文档页面放在 `src/content/docs/`。
- GitHub Pages 自定义工作流支持通过 GitHub Actions 构建静态站，并要求 Pages 部署 job 具备 `pages: write` 与 `id-token: write` 权限。

## Requirements

- 使用独立仓库 `ameow-site` 承载站点源码、构建和部署配置。
- 使用 Astro + Starlight 技术栈。
- 首页使用 Astro 自定义页面，不受 Starlight 默认 landing page 限制。
- 文档区域保持 Starlight 默认体验为主，不做大规模主题定制。
- 站点应支持 GitHub Pages 默认项目页地址，预期为 `https://wutpeach.github.io/ameow-site/`。
- `astro.config.mjs` 应配置 `site: "https://wutpeach.github.io"` 和 `base: "/ameow-site"`，除非后续改为自定义域名或 user/organization page 仓库。
- 文档入口建议放在 `/docs/` 路径，首页位于 `/`。
- MVP 文档内容应迁移或复制现有中文资料作为首版主内容：
  - 快速上手
  - 浏览器扩展
  - FAQ
  - 下载/Release 入口
- 首版以中文为主，英文作为后续迭代。
- GitHub Pages 部署应在 `ameow-site` 仓库内完成，触发策略为 push 到 `main` 自动部署，并支持 `workflow_dispatch`。
- 主仓库应通过 git submodule 引用 `ameow-site`，推荐路径为 `site/`，避免和现有 `docs/` 目录冲突。
- 主仓库通过 `site/` 路径引用 `ameow-site` submodule。
- 主仓库 README 的本地文档链接不在首轮站点实施中同步改成公开站点链接；等 GitHub Pages URL/base 验证成功后再作为后续变更处理。

## Acceptance Criteria

- [x] 规划明确 `ameow-site` 的 Astro/Starlight 目录布局、路由边界和内容迁移范围。
- [x] 规划明确 GitHub Pages 的部署配置、URL/base 策略和启用步骤。
- [x] 规划明确主仓库 submodule 路径、添加命令和协作注意事项。
- [x] 规划明确 MVP 首页信息架构和文档导航结构。
- [x] 后续实施完成后，`ameow-site` 可本地 `npm run build` 成功。
- [x] 后续实施完成后，GitHub Pages 可通过默认项目页地址匿名访问。
- [x] 后续实施完成后，主仓库可通过 `git submodule update --init --recursive` 拉取站点源码。
- [x] 首轮实施不修改主仓库 README 文档入口到公开站点，避免未验证 URL 提前成为正式入口。

## Implementation Results

- `ameow-site` initialized and pushed to `https://github.com/Wutpeach/ameow-site.git` on `main`.
- Site commit: `48e1fc2914f6f5c0a4efc7ea22609c5558b10463`.
- GitHub Pages enabled with `build_type: workflow`.
- Successful deploy run: `https://github.com/Wutpeach/ameow-site/actions/runs/26552201516`.
- Public URLs verified with HTTP 200:
  - `https://wutpeach.github.io/ameow-site/`
  - `https://wutpeach.github.io/ameow-site/docs/`
- Main repository submodule path: `site/`.
- Validation:
  - `npm run build` in `ameow-site` passed.
  - `npm run build` in `site/` after `npm install` passed.
  - main repository `npm run lint` passed.
  - main repository `npm run type-check` passed.
  - main repository `npm run test` passed: 117 files, 775 tests.
- Known non-blocking note: Astro/Starlight build prints `Entry docs → 404 was not found.` after completion, but routes and public pages are generated and return 200.

## Out of Scope

- 首版不接入自定义域名。
- 首版不做复杂博客、版本化文档或全文内容治理系统。
- 首版不构建从主仓库到 `ameow-site` 的自动同步流水线。
- 首版不把文档构建并入主仓库 CI。
- 首版不要求大规模重写产品文案；优先把现有 README/docs 内容结构化迁移。
- 首版不要求完整英文站点；英文站点/i18n 作为后续迭代。

## Open Questions

- 无。
