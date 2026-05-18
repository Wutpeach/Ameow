# brainstorm: GitHub Pages Docusaurus public docs with private repo

## Goal

为 FlowSelect 增加一个部署在 GitHub Pages 的 Docusaurus 文档站，尽量保持主仓库私有，同时让文档站可公开访问。

## What I already know

* 用户目标：使用 Docusaurus 2 在 GitHub Pages 发布公开文档，仓库保持私有。
* 用户偏好：文档在公开 docs 仓库内独立维护，不与私有主仓库做自动同步流水线。
* 用户偏好：首版先使用 GitHub Pages 默认域名（不接自定义域名）。
* 当前仓库已有 `.github/workflows/release.yml` 和其他 CI 工作流，但没有 Pages/Docusaurus 相关工作流。
* 当前项目根目录已有 `docs/`（主要是 README 资源），尚无 Docusaurus 工程结构。
* `package.json` 当前是应用主工程（Tauri + React），未包含 Docusaurus 依赖与脚本。
* GitHub Docs（2026-03 检索）显示：Pages 站点默认可公开访问，即使仓库是 private/internal。
* GitHub Docs（2026-03 检索）显示：GitHub Free 账号在私有仓库上不能直接使用 Pages，私有仓库 Pages 需要 Pro/Team/Enterprise 等方案。
* Docusaurus 官方部署文档支持两类模式：同仓库部署（same repo）和远端部署仓库（remote repo）。

## Assumptions (temporary)

* 仓库未来会继续保持私有，不计划公开源代码。
* 文档内容不包含敏感信息，可以公开访问。
* 团队可接受通过 GitHub Actions 构建与部署静态站。

## Open Questions

* 无（已收敛）。

## Requirements (evolving)

* 文档站必须可公开访问。
* 主应用仓库代码应尽量保持私有。
* 文档站使用 Docusaurus 2 技术栈。
* 具备自动化部署能力，避免手工发布。
* 不在私有主仓库中执行 docs 构建（避免消耗私有仓库 Actions 配额/预算）。
* docs 的构建与发布流程放在公开 docs 仓库执行。
* docs 源码在公开 docs 仓库独立维护，不依赖私有主仓库 CI 同步。
* 首版使用 GitHub Pages 默认域名 `<owner>.github.io/<repo>`。
* MVP 仅包含最小可用站点能力，不额外加入 PR 阻断或链接检查增强项。
* 采用双仓并行工作流：私有主仓库用于代码理解与资料查阅，公开 docs 仓库用于文档编辑与发布。

## Acceptance Criteria (evolving)

* [x] 形成最终部署架构决策（A/B/C 之一）并记录原因。
* [x] 明确 GitHub 账号/组织计划前置条件（是否支持 private repo Pages）。
* [ ] 确定 Docusaurus 目录布局、构建命令和发布触发策略。
* [ ] 文档站 URL 可被匿名用户通过默认域名访问（public）。
* [x] 明确 MVP 范围边界（仅最小可用站点）。
* [x] 明确双仓并行维护流程与边界。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 本任务不涉及具体文档内容撰写（仅讨论站点搭建与发布方案）。
* 本任务不涉及替换当前应用发布流程（release.yml）。
* 本任务不涉及私有主仓库到 docs 仓库的自动同步机制建设。
* 首版不接入自定义域名。
* 首版不包含 PR 构建失败阻止合并。
* 首版不包含外链/内部链接检查流水线。

## Technical Notes

* 已检查文件：
  * `.github/workflows/release.yml`
  * `.github/workflows/check-pinterest-sidecar-upstream.yml`
  * `package.json`
  * `README.md`
* 参考资料（2026-03 检索）：
  * GitHub Docs: Creating a GitHub Pages site
  * GitHub Docs: GitHub Pages limits
  * Docusaurus Docs: Deployment

## Research Notes

### What similar tools do

* Docusaurus 官方给出两种常见发布模式：同仓库部署到 `gh-pages`，或部署到远端仓库。
* GitHub Pages 支持由 GitHub Actions 自定义构建发布，适配静态站点生成器。
* 私有仓库可发布公开 Pages（默认公开），但私有仓库可用性取决于账号/组织计划。

### Constraints from our repo/project

* 当前仓库是私有项目并且是多模块工程（桌面端 + 扩展 + 脚本），文档工程应尽量隔离，避免干扰主构建。
* 当前 CI 已较复杂，新增 docs workflow 需要与现有发布流程解耦。
* 已有 `docs/` 目录用于 README 资源图，需要避免与 Docusaurus 默认 `docs/` 目录冲突。

### Feasible approaches here

**Approach A: Same-repo Pages from private source repo** (Recommended if plan supports private Pages)

* How it works:
  * 在主仓库新增 Docusaurus 子目录（例如 `website/`）。
  * GitHub Actions 在 push/main 时构建 Docusaurus 并通过 `actions/deploy-pages` 发布。
* Pros:
  * 结构最简单，单仓库维护，版本与代码同步最好。
  * 不需要额外公开源码仓库。
* Cons:
  * 需要账号/组织计划支持私有仓库 Pages。
  * 私有仓库 Actions 分钟有配额与计费约束。

**Approach B: Private source repo -> public docs deployment repo**

* How it works:
  * 主仓库保持私有，仅在 CI 构建静态产物后推送到公开 docs 仓库（`gh-pages` 或主分支）。
* Pros:
  * 文档公开与源码私有完全分离，权限边界最清晰。
  * 可在不依赖“私有仓库 Pages 能力”的情况下落地。
* Cons:
  * 需要双仓库同步与 PAT/Deploy Key 管理。
  * 维护复杂度高于同仓库方案。

## Decision (ADR-lite)

**Context**: 私有主仓库 GitHub Actions 预算不足，不能在私有仓库执行 docs 构建；目标仍是 GitHub Pages 公开文档。  
**Decision**: 采用 Approach B 的变体：建立公开 docs 仓库，docs 的源码、构建、发布全部在该公开仓库内完成。  
**Consequences**:
* 优点：构建运行在公开仓库标准 runner，避免消耗私有仓库分钟数；发布链路简单稳定。
* 代价：文档源码本身公开；文档更新节奏需要在团队流程中手动维护一致性。

## Technical Approach

* 新建公开仓库（例如 `flowselect-docs`），独立初始化 Docusaurus 2 项目。
* 使用 GitHub Actions 官方 Pages 流程：
  * `actions/configure-pages`
  * `actions/upload-pages-artifact`
  * `actions/deploy-pages`
* 触发策略：`push` 到 `main` 自动发布，`pull_request` 做构建校验但不部署。
* 域名策略：先用默认域名，后续如需品牌域名再追加 `CNAME` 与 DNS。
* MVP 内容策略：仅提供基础首页与最小导航结构，后续再渐进扩展文档体系。
* 双仓并行执行方式：
  * 私有仓库路径：`D:\FlowSelect`（读代码与提炼事实）
  * 公开 docs 仓库路径：`D:\flowselect-docs`（写文档与发布）
  * 写作流程：先在私有仓库确认功能事实，再在公开 docs 仓库更新对应页面。

## Expansion Options (for MVP boundary)

1. Future evolution
   * 后续可能增加版本化文档（release 对应 docs version）。
   * 后续可能增加多语言（`zh-CN` / `en`）文档结构。
2. Related scenarios
   * 与主仓库 `release-notes/` 保持更新节奏一致。
   * README 中新增文档站入口，避免入口分散。
3. Failure & edge cases
   * PR 构建失败时阻止合并（基础质量闸门）。
   * 外链/内部链接失效检测，避免发布后 404。

**Approach C: Keep private repo and host docs outside GitHub Pages**

* How it works:
  * 用 Cloudflare Pages/Vercel/Netlify 读取私有仓库并发布公开文档。
* Pros:
  * 托管与权限策略更灵活。
* Cons:
  * 偏离“GitHub Pages”目标，不是当前优先方向。
