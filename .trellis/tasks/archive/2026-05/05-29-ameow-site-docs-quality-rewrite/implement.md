# Implementation Plan: Ameow site documentation quality rewrite

## Phase 1: Audit

- List all Markdown/MDX pages in `site/src/content/docs/docs/`.
- Categorize each page as workflow, troubleshooting, concept/reference, release archive, or index.
- For each page, record:
  - whether it passes self-containedness
  - `请看 [` / `详见 [` count
  - approximate substantive length
  - needed image placeholders

## Phase 2: Structure Updates

- Update Starlight sidebar if approved:
  - move FAQ into “入门”
  - optionally reorder `入门` and `桌面端使用`.
- Add `site/public/images/docs/README.md` with placeholder-to-filename mapping.

## Phase 3: Rewrite P0 Pages

- Rewrite `getting-started.md`.
- Rewrite `downloads.md`.
- Rewrite `faq.md`.
- Rewrite `browser-extension.md`.
- Rewrite `extension/install.md`.
- Rewrite `extension/connection.md`.
- Rewrite `troubleshooting/download-failures.md`.
- Rewrite `troubleshooting/macos-first-run.md`.

Each page must be self-contained and include concrete image placeholders.

## Phase 4: Rewrite P1 Pages

- Enhance desktop workflow pages with complete examples and success states.
- Enhance `troubleshooting/extension-disconnected.md`.
- Enhance `troubleshooting/missing-files.md`.

This phase is in scope for the first implementation pass.

## Phase 5: Rewrite P2 Pages

- Improve concepts and advanced/reference pages enough to avoid index-only language.
- Keep `releases/index.md` mostly unchanged.
- Adjust `index.mdx` so cards include useful direct context, not only link labels.

This phase is in scope for the first implementation pass, except `releases/index.md`, which should remain mostly unchanged.

## Phase 6: Validation

Run in `site/`:

```bash
npm run build
```

Additional checks:

- internal href check on built HTML
- search for `请看 [` and `详见 [` counts
- search for image placeholders and verify README mapping
- spot-check self-containedness on all P0 pages
- check no garbled Chinese replacement characters

## Validation Results

- `npm run build` passed in `site/` and generated 26 pages.
- Internal built-HTML href check passed with no broken internal links.
- Pure jump-link phrase check found 0 matches for `请看 [`、`详见 [`、`详细排查见`、`继续阅读 [`、`更多说明请阅读`.
- `您` check found 0 matches in site documentation.
- Image placeholder check found 23 placeholders and all are mapped in `public/images/docs/README.md`.
- Ordinary topic page length check found no non-release, non-index page below 400 CJK characters.
- Built HTML garbled replacement character check found no matches.
- Build still prints the existing non-blocking `Entry docs → 404 was not found.` message after successful generation.

## Commit Plan

- Commit docs rewrite inside `site` submodule.
- Push `ameow-site`.
- Commit main repo submodule pointer and Trellis artifacts.

## Rollback

- Revert the `ameow-site` commit if the rewrite harms navigation or build output.
- Revert the main repo submodule pointer if the pushed site should not be referenced.
