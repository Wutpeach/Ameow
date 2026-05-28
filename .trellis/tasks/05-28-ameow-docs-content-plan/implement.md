# Implementation Plan: Ameow documentation content completion

## Preconditions

- Continue using `site/` submodule as the implementation location.
- Make changes inside the `ameow-site` repository first, then update the main repo submodule pointer.
- Keep content Chinese-first.
- Do not redesign the deployment workflow.

## Phase 1: Inventory And Mapping

- List all existing site pages.
- List all `release-notes/v*.md` files and classify them:
  - stable releases
  - rc/pre-release notes
- Build a page map from PRD/design into concrete Markdown paths.
- Identify source content for each planned page:
  - README
  - current docs
  - release notes
  - public UI behavior from existing code where necessary

## Phase 2: Update Starlight Structure

- Update `astro.config.mjs` sidebar to the expanded groups.
- Keep `/docs/` as the documentation root.
- Keep existing page URLs where possible:
  - `/docs/getting-started/`
  - `/docs/browser-extension/`
  - `/docs/downloads/`
  - `/docs/faq/`
- Add new pages under:
  - `desktop/`
  - `extension/`
  - `advanced/`
  - `troubleshooting/`
  - `releases/`
- Preserve `/docs/faq/` as an entry page even after adding troubleshooting pages.

## Phase 3: Write Core User Docs

Write or rewrite P0 pages first:

- `downloads.md`
- `getting-started.md`
- `concepts.md`
- `desktop/output-folder.md`
- `troubleshooting/macos-first-run.md`
- `faq.md`

Each page should include concrete user steps and links to the next relevant page.

## Phase 4: Write Common Workflow Docs

Add or expand:

- `desktop/floating-window.md`
- `desktop/files-and-folders.md`
- `desktop/links-and-queue.md`
- `desktop/settings.md`
- `extension/install.md`
- `extension/connection.md`

Keep the existing `/docs/browser-extension/` page as the canonical overview.

## Phase 5: Write Advanced And Troubleshooting Docs

Add:

- `extension/supported-sites.md`
- `extension/cookies-and-login.md`
- `advanced/quality-and-formats.md`
- `advanced/ae-compatibility.md`
- `advanced/download-dependencies.md`
- `troubleshooting/index.md`
- `troubleshooting/extension-disconnected.md`
- `troubleshooting/download-failures.md`
- `troubleshooting/missing-files.md`

Keep explanations public-safe and user-facing.

## Phase 6: Migrate Release Notes

- Create `releases/index.md` as the single release notes page.
- Migrate every `release-notes/v*.md` into this one page.
- Group stable releases before pre-release notes.
- Translate English release notes into Chinese before including them.
- Preserve `Full Changelog` links.
- Do not create one page per short release note unless a future release note becomes large enough to justify splitting.

## Phase 7: Homepage And Cross-Link Pass

- Add homepage/documentation links only if needed.
- Ensure docs index points to the expanded page groups.
- Ensure FAQ and troubleshooting pages cross-link to each other.
- Ensure release notes link to GitHub Releases for downloads.
- Keep `/docs/faq/` valid.

## Phase 8: Validation

Run in `site/`:

```bash
npm install
npm run build
```

Optional visual check:

```bash
npm run dev -- --host 127.0.0.1 --port 4321
```

Then verify:

- `/ameow-site/docs/`
- `/ameow-site/docs/releases/`
- representative troubleshooting pages
- `/ameow-site/docs/faq/`

Additional content checks:

- Search for common Chinese keywords: `macOS 拦截`, `Cookies`, `Bilibili`, `快捷键`, `输出目录`.
- Check mobile rendering for long release notes and sidebar navigation.
- Check built HTML for garbled Chinese characters.
- Confirm every `Full Changelog` link is preserved.

Run main repo checks if the only main repo change is submodule pointer:

```bash
git submodule status
```

If README or main repo docs are changed, also run:

```bash
npm run lint
npm run type-check
```

## Commit Plan

- Commit content changes in `ameow-site`.
- Push `ameow-site` main.
- Update main repo `site` submodule pointer.
- Commit main repo Trellis artifacts and submodule pointer.

## Rollback

- Revert the `ameow-site` content commit if docs build or deployment fails.
- Revert the main repo submodule pointer if pushed site content should not be referenced.

## Validation Results

- `npm install` completed in `site/` with 0 vulnerabilities.
- `npm run build` completed in `site/` and generated 26 pages.
- Internal HTML link check passed with no broken internal hrefs.
- Built HTML check found no garbled Chinese replacement characters.
- Release notes migration count matched source files: 18 `release-notes/v*.md` files and 18 `Full Changelog` entries.
- Keyword coverage checked for `macOS 拦截`, `Cookies`, `Bilibili`, `快捷键`, `输出目录`, `Release Notes`, `预发布记录`, `Apple Silicon`, `AE 兼容`, and `下载依赖`.
