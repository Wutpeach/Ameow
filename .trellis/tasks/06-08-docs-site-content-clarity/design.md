# Docs Site Content Clarity Design

## Scope

This task changes public docs content and lightweight MDX structure only. It keeps the existing Starlight sidebar taxonomy stable unless a content edit exposes a small ordering or label mismatch.

Primary affected pages:

- `site/src/content/docs/docs/index.mdx`
- `site/src/content/docs/en/docs/index.mdx`
- `site/src/content/docs/docs/getting-started.md`
- `site/src/content/docs/en/docs/getting-started.md`
- `site/src/content/docs/docs/downloads.md`
- `site/src/content/docs/en/docs/downloads.md`
- `site/src/content/docs/docs/browser-extension.md`
- `site/src/content/docs/en/docs/browser-extension.md`
- `site/src/content/docs/docs/faq.md`
- `site/src/content/docs/en/docs/faq.md`

Navigation file `site/astro.config.mjs` should remain unchanged unless the final copy makes a small ordering/label adjustment necessary.

Expanded scope after implementation review:

- Remove `docs` from the sidebar's 入门 / Getting Started group.
- Stop treating `site/src/content/docs/docs/index.mdx` and `site/src/content/docs/en/docs/index.mdx` as user-facing guide pages. Public `/docs/` routes should still land somewhere useful.
- Apply the same action-first model to the remaining guide pages without redesigning their visual layout.

## Content Model

The revised docs should prioritize user intent over feature explanation:

1. Start with the action the reader wants to complete.
2. Give the recommended default.
3. Show the shortest successful path.
4. State the success condition.
5. Link to deeper explanation or troubleshooting only after the first path is clear.

This means pages should use fewer broad introductions and more decision points such as:

- "Most Windows users: download Installer EXE."
- "Only install the extension when a webpage needs browser context, login state, or page media scanning."
- "If you cannot find the file, open the current output folder from Ameow first."

## Visual Aids

Use Starlight built-ins before considering external diagram dependencies:

- `CardGrid` / `Card`: first-use path choices and task routes.
- `Steps`: ordered setup and first-success flows.
- `Tabs` / `TabItem`: Windows vs macOS paths or desktop-only vs extension-assisted paths.
- `Aside`: critical warnings, "not required yet", and first-failure shortcuts.
- Markdown tables: compact release-package choices.

Mermaid-style flowcharts may be used as a writing reference, but this MVP should not add Mermaid or `beautiful-mermaid` as a dependency.

## Page Plans

### Homepage

Purpose: act as a starting surface, not a reference index.

Recommended structure:

1. Plain-language one-sentence product summary.
2. "第一次成功使用" / "First successful run" as the primary section.
3. `Steps` or `CardGrid` path:
   - Download the right package.
   - Launch Ameow.
   - Drop a file or paste/send a webpage link.
   - Open the output folder.
4. Short decision box for browser extension:
   - not needed for local files or public links;
   - needed for page context, login state, cookies, or current-page media.
5. "按任务阅读" remains, but moves after the first-use path.
6. Screenshot placeholder note remains secondary and should not carry the main explanation.

### Downloads

Purpose: help users pick the right release asset quickly.

Recommended structure:

1. Lead with "do not download Source code" and the default package choices.
2. Keep the decision table, but shorten cell text.
3. Add an `Aside` for Source code confusion.
4. Keep Windows Installer vs Portable explanation after the table.
5. Keep extension package explanation clear: it is separate from the desktop app.

### Getting Started

Purpose: make the first working path concrete.

Recommended structure:

1. Add a top shortcut: "只想第一次跑通？按这条线走".
2. Use `Tabs` for Windows/macOS installation details.
3. Use `Steps` for:
   - install and launch;
   - drop one test file;
   - paste one public link;
   - open current output folder;
   - install extension only if needed.
4. Keep success-state text after each step, but make it shorter.
5. Keep common first failures, but make each answer route to the quickest next action.

### Browser Extension

Purpose: explain optionality and correct timing.

Recommended structure:

1. Start with "You can use Ameow without the extension."
2. Add a compact decision flow:
   - local files or public links: skip for now;
   - webpage can play but download fails: use extension;
   - login/cookies/current-page media: use extension.
3. Use `Steps` for shortest install/connect path.
4. Preserve local-connection explanation for trust and privacy.
5. Keep current-page media guidance, but reduce repeated explanation.

### FAQ

Purpose: fast recovery from first-use confusion.

Recommended structure:

1. Keep question order oriented around first use:
   - which file to download;
   - macOS blocked;
   - where files went;
   - folder drop behavior;
   - pasted link failed;
   - extension disconnected;
   - supported sites;
   - YouTube/proxy;
   - when extension is needed;
   - release notes.
2. Add short "try this first" language before deeper links.
3. Crosslink back to getting started where the user should retry the basic flow.

## I18n

Chinese should be drafted first because it is the root locale and the user's primary concern. English pages should then receive structural parity and equivalent meaning, not a literal word-by-word translation.

For every touched Chinese page, the matching English page should include:

- the same section structure;
- equivalent component usage;
- equivalent internal links;
- equivalent warnings and success states.

## Constraints

- Do not add dependencies.
- Do not create new public docs pages.
- Do not rewrite deep reference pages in this task.
- Do not depend on screenshot placeholders for comprehension.
- Keep `site/src/content/docs/` as the public docs source of truth.
- Release notes remain changelog content, not tutorial content.
