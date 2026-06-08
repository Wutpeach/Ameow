# Docs Site Content Clarity Redesign

## Goal

Make the public Ameow docs site clearer and more direct for first-time and troubleshooting users, especially in the Chinese root locale. The redesign should help readers quickly choose the right path, understand what Ameow does, and complete common tasks without reading through broad reference-style pages first.

## Confirmed Facts

- Public user documentation lives under `site/src/content/docs/`.
- Chinese documentation is the root locale under `site/src/content/docs/docs/`; English documentation mirrors it under `site/src/content/docs/en/docs/`.
- The docs site uses Astro/Starlight, with navigation configured in `site/astro.config.mjs`.
- Current Chinese navigation groups pages into:
  - 入门: index, downloads, concepts, getting-started, faq
  - 桌面端使用: floating window, output folder, files/folders, links/queue, settings
  - 浏览器扩展: overview, install, connection, supported sites, cookies/login
  - 高级使用: quality/formats, AE compatibility, download dependencies
  - 故障排查: overview plus specific issue pages
  - 版本记录
- The current homepage already offers cards and task-based links, but it still reads like a broad documentation hub rather than a sharply guided user path.
- Key pages such as `downloads.md`, `concepts.md`, `getting-started.md`, and `faq.md` contain useful details, but first-time users may need more direct scenario routing and shorter decision points before seeing full explanations.
- Several pages contain screenshot placeholders (`[截图：...]`, `[示意图：...]`), so visual clarity is partly deferred to the existing docs screenshot pipeline.

## Product Decisions

- Primary reader journey: first-time ordinary users who want to install Ameow and complete their first webpage download.
- The first path should quickly answer: which package to download, how to start the app, how to drag a local file, how to paste/send a webpage link, when the browser extension is needed, and where to go when the first attempt fails.
- Advanced settings, AE compatibility, runtime dependencies, and deep troubleshooting should remain discoverable, but they should not compete with the first-use path.
- Sidebar grouping is acceptable as-is. The MVP should focus on content clarity and only adjust group labels/order when a content change truly requires it.
- Content should use more visual examples where they clarify decisions or workflows. Prefer built-in Astro/Starlight documentation components before adding any dependency.
- Existing `.md` docs pages may be converted to `.mdx` when that is needed to use built-in Starlight components for clearer flows, tabs, cards, or callouts.

## Consultation Notes

- Claude Code second-opinion review agreed that the current docs are comprehensive but organized more like a reference manual than a first-use path.
- Highest-leverage change: rewrite the homepage around a 3-step first-use path and make scenario routing primary instead of secondary.
- Recommended MVP should work within the existing Starlight structure rather than adding custom navigation or visual design work.
- Valid risks to manage:
  - keep Chinese and English structural changes aligned;
  - avoid making screenshot placeholders carry more explanatory weight;
  - verify sidebar labels, page titles, and internal links after reordering or wording changes.
- Claude flagged README and extension-popup help links as possible stale-entry risks, but local verification found current links already point to `https://wutpeach.github.io/Ameow/...`, so they are not currently blockers.
- Implementation-prep Claude review confirmed the five-page-pair MVP is the right scope and recommended adding implementation safeguards:
  - review `concepts.md` links from rewritten pages without adding `concepts.md` to MVP scope;
  - make `.md` to `.mdx` conversion explicit for pages that use Starlight components;
  - run a baseline docs build before editing;
  - audit screenshot/diagram placeholders after rewriting;
  - use `docs:dev` for a short visual smoke test because build validation does not catch all component layout issues.

## Requirements

- Clarify the docs-site information architecture around user intent, not only product areas.
- Make the first screen and first-reading path more direct for new users.
- Preserve required public-docs constraints:
  - source of truth remains `site/src/content/docs/`;
  - Chinese root locale and English `/en/` locale stay aligned where content changes are made;
  - root `docs/` is not used for public user guides.
- Prefer plain-language, action-oriented wording over broad feature descriptions.
- Keep advanced topics discoverable without making them part of the default first-use path.
- Treat screenshot replacement or visual asset production as separate unless this task explicitly expands to include it.
- Keep the first pass inside the existing Astro/Starlight docs structure; avoid custom theme/layout work unless content clarity cannot be achieved otherwise.
- Use diagrams and structured visual aids pragmatically:
  - prefer Starlight built-ins such as `Steps`, `Card`, `CardGrid`, `Tabs`, `Aside`, and tables for first-pass flow and decision clarity;
  - use Mermaid-style flowcharts only if they can render without adding a new package, or if the user explicitly approves a later dependency/integration;
  - treat `lukilabs/beautiful-mermaid` as inspiration or a possible later technical option, not a default dependency for this MVP.
- Convert `.md` pages to `.mdx` only where component usage materially improves clarity; do not rename files just for formatting preference.

## Proposed MVP Scope

- First implementation pass is limited to five paired Chinese/English page groups:
  - homepage;
  - downloads;
  - getting started;
  - browser extension overview;
  - FAQ.
- Rewrite `site/src/content/docs/docs/index.mdx` and `site/src/content/docs/en/docs/index.mdx` so the first viewport leads with a direct first-use path:
  - download the right package;
  - start Ameow and confirm the floating window;
  - complete the first file/link or webpage download;
  - know when to install the browser extension;
  - jump to first-failure help.
- Tighten `getting-started.md` in both locales around a common “I just want my first download to work” path.
- Tighten `downloads.md` in both locales so package choice is faster to scan.
- Lightly adjust `browser-extension.md` in both locales to reinforce that the extension is optional until webpage context/login state is needed.
- Lightly adjust `faq.md` in both locales so first-use failures route back to the quick path and specific troubleshooting pages.
- Consider sidebar ordering/labels in `site/astro.config.mjs` only if the content changes need it.
- Keep the current sidebar grouping stable by default; do not redesign the navigation taxonomy in this task.

## Expanded Scope

- Remove the standalone `Ameow 文档` / `Ameow Docs` page from the user-facing sidebar because it duplicates the navigation and adds too many links for a first-use entry.
- Keep the public `/docs/` and `/en/docs/` routes from becoming dead ends by redirecting or routing them to a clearer first-use page.
- Run a lightweight action-first clarity pass across the remaining public user guide pages in both locales:
  - concepts;
  - desktop usage pages;
  - extension subpages;
  - advanced usage pages;
  - troubleshooting pages.
- Keep release notes unchanged except for build/link compatibility, because release history is a changelog surface rather than a tutorial surface.

## Explicitly Out of Scope

- Producing or replacing screenshots.
- Rewriting deep reference pages under `desktop/`, `advanced/`, `troubleshooting/`, `extension/` subpages, or `releases/`.
- Creating new public docs pages.
- Custom Starlight components, CSS, or visual redesign.
- Rewriting English docs beyond parity with the Chinese structural/content changes.
- Changing root `docs/` engineering/reference notes.
- Adding Mermaid or diagram-rendering packages unless built-in components cannot express the workflow clearly and the user explicitly approves that dependency.
- Avoiding MDX entirely; MDX conversion is allowed when using built-in Starlight components.
- Rewriting release notes as guides.

## Acceptance Criteria

- [ ] Planning identifies the primary user journeys the docs should optimize for.
- [ ] Planning identifies which pages/navigation labels should change and which should stay stable.
- [ ] Planning defines a clear MVP scope for content restructuring or rewriting.
- [ ] Any eventual docs edits update both Chinese and English locale pages when the changed content exists in both locales.
- [ ] Any eventual docs edits pass `npm run docs:build`.
- [ ] A reader following the homepage first-use path can reach actionable installation/download instructions with no more than three decisions.
- [ ] Affected pages remain understandable even where screenshot placeholders are still present.
- [ ] Visual aids clarify decision points or workflows without requiring new dependencies in the default MVP.

## Open Questions

- None blocking. Confirmed rewrite principle: action-first content that starts with the user's current task, gives the recommended default, shows the shortest successful path, then links to deeper context.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
