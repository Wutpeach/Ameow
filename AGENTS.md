<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Project Conventions

### Version Bumps

- When updating the app version, do not manually search and edit version strings across the repo.
- Always use `npm run version:set -- <version>`.
- This command is the single entry point for updating:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/tauri.conf.json`
  - `browser-extension/manifest.json`
  - `src-tauri/Cargo.toml`
  - `src/constants/appVersion.ts`
- UI version displays should read from `src/constants/appVersion.ts` instead of hardcoded literals.

### Release Tags And Notes

- When preparing a tagged release, create and commit `release-notes/v<version>.md` before pushing the tag.
- Use `release-notes/TEMPLATE.md` as the starting point.
- Release notes should be written in Chinese by default.
- Release notes should summarize user-facing changes in plain language instead of dumping commit subjects.
- Keep a `Full Changelog` compare link at the bottom of the release note.
- The GitHub release workflow expects the versioned release-note file to exist in the tagged commit; missing notes should block the release.

### Public Documentation Site

- The public user documentation site is managed in this repository under `site/`; it is not a submodule.
- `site/src/content/docs/` is the source of truth for user-facing documentation.
- Root `docs/` is reserved for engineering/reference notes and repo-local assets; do not add new public user guides there.
- Chinese docs are served from the root locale and English docs from `/en/`.
- Public docs are deployed from `.github/workflows/deploy-docs.yml` to `https://wutpeach.github.io/Ameow/`.
- Use root scripts for docs-site work:
  - `npm run docs:dev`
  - `npm run docs:build`
  - `npm run docs:preview`
- When changing user-facing behavior, packaging/download flows, browser-extension workflows, supported-site behavior, proxy/network guidance, install steps, or troubleshooting guidance, update the relevant docs-site pages in the same task/commit.
- README and extension help links should point to docs-site URLs, not root `docs/*.md` files or old GitHub blob pages.
- Do not reintroduce `.gitmodules`, a `site` gitlink, or nested `site/.git` metadata unless the user explicitly asks to return to a submodule model.


### macOS Fix PR Policy

- For macOS adaptation or bug-fix tasks, Codex may automatically create a branch, commit changes, push to `origin`, and open a draft PR when the user explicitly asks for that workflow in the current session.
- Before auto-opening the PR, Codex must ensure `npm run type-check` and `npm run lint` pass, plus any task-relevant tests that were changed or added.
- Default base branch is `main`.
- Default branch naming should use a `mac/` or `fix/` prefix with a short slug.
- Default commit and PR titles should use the `fix(mac): ...` convention when the change is primarily macOS-specific.
- Auto-PRs should avoid bundling unrelated local binary/runtime artifacts unless the user explicitly requests them.


### File Search

For any file search, filename or path lookup, or content grep in the current git-indexed directory, use the `fff` MCP tools instead of the default search tools.

Prefer:
- `fffind` for file and path search.
- `ffgrep` for content search.
- `fff-multi-grep` for broader multi-query grep tasks.

Only fall back to default tools if `fff` is unavailable or the target is outside the indexed project.
