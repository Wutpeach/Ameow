# Docs Site Content Clarity Implementation Plan

## Pre-Implementation

- Read docs-site contract before editing:
  - `.trellis/spec/frontend/docs-site.md`
- Run a baseline docs build on clean planning state:
  - `npm run docs:build`
- Confirm Starlight components used by the plan are exported:
  - `Aside`
  - `Card`
  - `CardGrid`
  - `Tabs`
  - `TabItem`
  - `Steps`
  - `LinkButton`
- Keep `site/astro.config.mjs` unchanged unless final content requires a small navigation adjustment.
- Catalog screenshot/diagram placeholders in the ten touched pages before rewriting, then re-check that remaining placeholders still match the new surrounding copy.
- Review links from touched pages into `concepts.md`. `concepts.md` is intentionally outside MVP scope, but links to it should not create a jarring shift from action-first copy into reference-style explanation.

## Edit Order

1. Homepage Chinese:
   - rewrite `site/src/content/docs/docs/index.mdx` around first successful use;
   - use Starlight components for path selection and steps;
   - keep task-based reading routes as secondary.
2. Homepage English:
   - mirror structure and links in `site/src/content/docs/en/docs/index.mdx`.
3. Downloads Chinese and English:
   - tighten release-asset decision table;
   - add/keep a clear Source code warning;
   - keep extension package separate from desktop package.
4. Getting Started Chinese and English:
   - add first-success shortcut;
   - use `Tabs` for platform install details if it remains readable;
   - use `Steps` for the core workflow;
   - shorten success states and failure recovery.
5. Browser Extension Chinese and English:
   - lead with optionality;
   - add a compact decision flow;
   - keep local-connection and current-page media guidance.
6. FAQ Chinese and English:
   - keep first-use question order;
   - add "try this first" style recovery;
   - crosslink to quick path and specific troubleshooting pages.
7. Review whether `site/astro.config.mjs` needs any small order/label change. Default answer should be no.

8. Expanded pass:
   - remove `docs` from the sidebar group in `site/astro.config.mjs`;
   - update public docs entry links in `site/src/pages/index.astro` so "文档" routes to the clearer first-use page;
   - keep `/docs/` and `/en/docs/` usable by redirecting or routing them to a first-use page;
   - lightly optimize the remaining guide pages in Chinese and English, preserving routes and sidebar grouping;
   - leave release notes as changelog content.

## MDX Conversion Rules

- `downloads.md`, `getting-started.md`, `browser-extension.md`, and `faq.md` are currently plain Markdown files in both locales.
- Any page that uses `Tabs`, `TabItem`, `Steps`, `Aside`, `LinkButton`, `Card`, or `CardGrid` must be renamed from `.md` to `.mdx` and include the needed import from `@astrojs/starlight/components`.
- Rename only the specific pages that use components. Keep the route slug stable and verify with `npm run docs:build`.
- Prefer relative links such as `../downloads/` or `./faq/` so Chinese and English locale routes stay correct.

## Validation

Run from repository root:

```bash
npm run docs:build
```

Focused manual checks:

- Homepage path reaches actionable download/install guidance within three user decisions.
- Affected Chinese and English pages have matching structure.
- Internal links in touched pages point to existing docs routes.
- Pages still make sense when screenshot placeholders are not rendered as actual images.
- No new package dependency was added.
- `npm run docs:dev` renders the five affected routes without obvious component layout issues.
- `site/package.json` and `site/package-lock.json` remain unchanged unless a separately approved dependency change occurs.
- Any remaining links to `concepts.md` from touched pages still make sense with the new action-first surrounding copy.

## Risk Points

- MDX component imports are needed on any page using Starlight components. Plain `.md` pages may need to become `.mdx` or avoid component syntax.
- Changing filenames from `.md` to `.mdx` can affect route behavior and references; prefer component usage only where current file format supports it or rename carefully with build validation.
- Overusing components can make pages feel decorative instead of clearer. Use visuals only for decisions, flows, warnings, and comparisons.
- English parity can drift if Chinese edits are completed much earlier. Compare touched pairs before validation.
- Multiple `Tabs` blocks on the same page can share state by matching tab labels. Avoid accidental label collisions or visually awkward nested `Tabs`/`Steps` layouts.
- Build validation catches syntax and route failures, but not every visual/layout issue; use `docs:dev` for a short manual smoke test.

## Rollback Points

- If component-heavy MDX changes become brittle, keep the content rewrite and fall back to Markdown tables/lists plus existing `CardGrid` on homepage.
- If a sidebar adjustment creates confusion or extra translation work, revert it and keep content-only changes.
