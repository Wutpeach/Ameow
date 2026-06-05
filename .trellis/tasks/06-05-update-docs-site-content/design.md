# Design

## Goal Shape

This task is a narrow docs-site sync, but it now includes one structural migration:

- refresh a small set of user-facing docs pages so they match recent product behavior;
- move user-facing entry points away from root `docs/*.md` copies and onto the Astro/Starlight docs site;
- add full English docs-site support for the public user-doc set so English entry links can move too;
- convert the existing Astro/Starlight docs site from a submodule into normal files in the Ameow repository;
- leave engineering/reference docs in root `docs/` untouched.

## Source of Truth

After this task:

- `site/src/content/docs/...` is the source of truth for user-facing documentation;
- root `docs/` remains for engineering/reference notes and any assets that are still intentionally repo-local;
- root user-doc copies are no longer the canonical destination for README or extension help entry points.
- `site/` is tracked directly by the main repository, not as a gitlink/submodule.

## Repository Strategy

Move to single-repository management for the app and public docs site.

Chosen approach:

- remove the `site` submodule registration from `.gitmodules` and the root Git index;
- keep the current `site/` working tree content as normal files;
- do not import or preserve the separate `ameow-site` history;
- remove nested submodule Git metadata so future edits are visible directly in the root repository.
- deploy the docs site from the main repository's GitHub Pages workflow under `https://wutpeach.github.io/Ameow/`.

Rationale:

- app behavior and user-facing docs change together;
- one review/commit can include code, README, extension help links, docs-site content, and release notes;
- submodule pointer churn and clone/update mistakes are not worth the separation for this product-docs use case.

## i18n Strategy

Use Starlight's built-in i18n support.

Chosen structure:

- Chinese stays as the root locale
- English is added under `/en/`

Rationale:

- preserves current Chinese URLs and public links;
- minimizes migration risk;
- allows English README links to point to docs-site pages instead of stale root markdown copies.

This task should add English coverage for the current public user-doc information architecture, not just a few landing pages. Engineering/reference docs remain outside that requirement.

## Scope Boundary

### Chinese docs pages to update

- `docs/browser-extension`
- `docs/extension/supported-sites`
- `docs/troubleshooting/download-failures`
- `docs/faq`

Expected content changes:

- clarify that popup/current-media selection should target the current content page, not search/list/recommendation pages;
- make supported-site guidance clearer for specific-content-page vs search/home/list pages;
- document YouTube proxy-environment troubleshooting and the recommendation to rely on the user's proxy tool (for example TUN/global/VPN mode) instead of implying Ameow owns proxy configuration;
- reflect these changes in quick-answer form inside FAQ.

### Entry-point migration

- `README.md` should point to docs-site Chinese URLs.
- `README.en.md` should point to docs-site English URLs.
- `browser-extension/popup.js` should point its “Getting started” action to the docs-site getting-started page instead of the GitHub blob markdown file.

### English docs-site migration

Required outcome for this task:

- the current public user-doc tree in `site/src/content/docs/docs/` gets an English counterpart under the docs-site i18n structure;
- English navigation should cover the same public information architecture categories as the Chinese site:
  - 入门 / Getting Started
  - 桌面端使用 / Desktop
  - 浏览器扩展 / Browser Extension
  - 高级使用 / Advanced
  - 故障排查 / Troubleshooting
  - 版本记录 / Releases

The content quality can stay pragmatic and translation-oriented, but the site should not feel half-migrated for English users after README and extension links are moved.

## Non-Goals

- Do not migrate engineering/reference root docs into Starlight.
- Do not attempt full Chinese/English parity across the entire docs site.
- Do not attempt parity for engineering/reference root docs that are not part of the public user-doc site.
- Do not redesign the docs site's information architecture.
- Do not delete all root `docs/` files blindly in this task.
- Do not preserve the separate docs-site repository history.
- Do not redesign the release/deploy pipeline beyond what is required to make the migrated `site/` directory build from the root repository.

## Risk Notes

- Starlight i18n introduces URL and sidebar/config changes; keep the migration minimal and validate built routes carefully.
- Full English coverage makes the task larger than a simple content sync; keep the scope anchored to the existing public docs tree rather than inventing new sections.
- README and extension links should not be updated until target docs-site pages exist.
- If root user-doc copies are kept temporarily for compatibility, they should be treated as deprecated rather than canonical.
- Submodule removal must leave `site/` as ordinary tracked files, not an untracked nested Git repository or a deleted gitlink only.
