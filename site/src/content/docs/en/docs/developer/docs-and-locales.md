---
title: Documentation development
description: Build the Astro / Starlight site and keep both languages in sync.
---

The independent site lives in `site/` and requires Node.js >= 22.19.0. From the repository root:

```sh
npm ci --prefix site
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run preview
```

- Chinese pages live in `site/src/content/docs/docs/`; English pages in `site/src/content/docs/en/docs/`. Keep facts, routes, and links in sync.
- Navigation and targeted redirects live in `site/astro.config.mjs`. Preserve useful bookmarks when moving current content; remove obsolete features so they no longer appear in search.
- Workflow figures live in `site/src/components/manual/`. Follow their README for real control relationships and themes, with accurate alternative text and no repetitive visible caption.

`npm run build` includes checks for built routes, bilingual coverage, and local links. Relevant PRs run the Pages build check; relevant `main` pushes or manual workflow runs can deploy to [wutpeach.github.io/Ameow](https://wutpeach.github.io/Ameow/). Website deployment and app releases remain independent.

[Back to developer resources](../)
