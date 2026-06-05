# Update docs site content

## Goal

Update the public documentation site content so it matches the current Ameow product behavior and gives users clearer guidance in the areas the user wants to prioritize.

This is a content-update task for an existing docs site, not a docs-site scaffolding task.

## Confirmed Facts

- The public docs site already exists under `site/` and uses Astro + Starlight.
- After the single-repository migration, the site is deployed from the main Ameow repository to GitHub Pages at `https://wutpeach.github.io/Ameow/`.
- Current navigation already includes:
  - 入门
  - 桌面端使用
  - 浏览器扩展
  - 高级使用
  - 故障排查
  - 版本记录
- Existing content lives under `site/src/content/docs/docs/`.
- The site is currently Chinese-only at the Starlight locale level.
- The site currently has no English locale configured in Starlight:
  - `site/astro.config.mjs` only declares the root Chinese locale;
  - `site/src/content/docs/` currently contains only one `docs/` tree and no parallel English content tree.
- A historical Trellis task `03-12-github-pages-docusaurus-public-docs` describes an older Docusaurus planning direction, but the current repository state is already an Astro Starlight docs site, so this new task should plan against the live implementation instead of reviving that older stack decision.
- Root `docs/` currently mixes multiple roles:
  - user-facing markdown copies such as `docs/getting-started.md`, `docs/browser-extension.md`, `docs/faq.md` and their `.en.md` variants;
  - engineering/reference docs such as `docs/download-telemetry-schema.md`, `docs/electron-runtime-foundation.md`, `docs/electron-parity-verification.md`, and `docs/engineering/bugfix-log.md`;
  - legacy/static assets under `docs/readme/`.
- The root user-facing docs are still actively referenced:
  - `README.md` links to `./docs/getting-started.md`, `./docs/browser-extension.md`, and `./docs/faq.md`;
  - `README.en.md` links to the `.en.md` variants;
  - `browser-extension/popup.js` still points its “Getting started” link to `https://github.com/Wutpeach/Ameow/blob/main/docs/getting-started.md`.

## Requirements

- Identify the intended scope of this docs update before implementation begins.
- Keep this round narrow in scope.
- Keep documentation aligned with current product behavior rather than obsolete assumptions.
- Prefer updating the existing docs information architecture unless there is a strong reason to add or move sections.
- Capture the final update scope as concrete pages/sections to edit.
- Define acceptance in user-facing terms: what a docs reader should now be able to understand or find.
- If root English user-doc copies are retired in this task, the docs site must provide a full English replacement path instead of forcing English README users into Chinese-only or partial content.
- Use the docs site as the source of truth for user-facing docs after this migration.
- Keep engineering/reference material in root `docs/`; do not fold those files into the public docs migration.
- Convert `site/` from a Git submodule into a normal directory in this repository so docs content and app behavior can be reviewed, committed, and released together.
- Do not preserve the separate docs-site repository history during this migration; keep the current working tree content as the migrated source.

## Acceptance Criteria

- [x] The target content scope for this docs update is explicitly defined as a narrow content sync, not a broad docs refresh.
- [ ] The affected docs pages or sections are identified in the planning artifacts.
- [ ] The planned changes are grounded in the current Astro/Starlight docs site structure.
- [ ] Open questions are reduced to genuine product/scope choices, not repository facts.
- [ ] If English root user-doc copies are migrated away, a full English docs-site replacement is planned.
- [ ] An i18n migration path is defined: Chinese remains the root locale, English lives under `/en/`.
- [ ] Entry points that still send users to root user-doc copies are identified for migration.
- [ ] Full English docs-site coverage is planned for the existing public user-doc information architecture.
- [ ] The `site/` docs site is no longer a submodule and is tracked as normal files in the root repository.
- [ ] Root scripts expose docs-site build/dev commands so the single repository can validate docs from the root.

## Open Questions

- None at the planning level. The major scope decisions have been made:
  - keep this round narrow;
  - document proxy-related YouTube troubleshooting;
  - converge user-facing docs to the docs site;
  - keep engineering/reference docs in root `docs/`;
  - use Chinese as root locale and English under `/en/`;
  - perform full English docs-site migration for the existing public user-doc set, not only a small entry-page subset.
  - convert the docs site to single-repository management in this task, without preserving the previous separate docs-site history.

## Likely Affected Pages

- `site/src/content/docs/docs/browser-extension.md`
- `site/src/content/docs/docs/extension/supported-sites.md`
- `site/src/content/docs/docs/troubleshooting/download-failures.md`
- `site/src/content/docs/docs/faq.md`
- `site/astro.config.mjs`
- `site/src/content/docs/` locale/content structure for minimal English pages
- `site/src/content/docs/` locale/content structure for full English pages
- `.gitmodules`
- `.git/modules/site`
- root `package.json`
- `README.md`
- `README.en.md`
- `browser-extension/popup.js`

## Evidence Collected

- `browser-extension.md` describes extension purpose and connection flow, but does not mention popup current-media selection behavior or any proxy-related troubleshooting.
- `extension/supported-sites.md` describes supported sites and warns against sending search/home/list pages, which is adjacent to the recent popup current-media accuracy fixes.
- `troubleshooting/download-failures.md` currently lists login state, unsupported sites, output directory, and quality/format causes, but does not mention proxy-environment-dependent YouTube failures or the new recommendation to rely on the user's proxy tool.
- `faq.md` mirrors current support-site and extension guidance and is a likely place for one short user-facing answer if the proxy guidance should be discoverable without reading the full troubleshooting page.
- Root `docs/browser-extension.md`, `docs/faq.md`, and `docs/getting-started.md` still exist and overlap conceptually with the public site, but their wording is older and already diverges from `site/src/content/docs/docs/`.
- User explicitly chose to document the new YouTube/proxy troubleshooting guidance. Recommended placement: `site/src/content/docs/docs/troubleshooting/download-failures.md` and `site/src/content/docs/docs/faq.md`, not broad intro pages.
- User accepted the recommendation to converge source-of-truth toward the docs site and to keep engineering/reference docs in root `docs/`.
- User then asked to migrate English entry docs away from root `docs/` too, which implies some level of English docs-site support because the site is currently Chinese-only.
- User later corrected the scope: English should be a full docs-site localization for the public user-doc set, not only a minimal migration of a few entry pages.
- The most concrete remaining root user-doc entry points are:
  - `README.md` -> `./docs/getting-started.md`, `./docs/browser-extension.md`, `./docs/faq.md`
  - `README.en.md` -> `./docs/getting-started.en.md`, `./docs/browser-extension.en.md`, `./docs/faq.en.md`
  - `browser-extension/popup.js` -> GitHub blob URL for `docs/getting-started.md`
- The previous `site/` directory was a Git submodule pointing at `https://github.com/Wutpeach/ameow-site.git`. The user chose to manage app and docs-site content in a single repository and explicitly does not require preserving the separate docs-site history.
