---
title: Documentation and locales
description: Develop, translate, and deploy the independent site.
---

The Astro / Starlight documentation site lives in `site/` and requires Node.js >= 22.19.0. From the repository root:

```powershell
npm ci --prefix site
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run preview
```

Chinese pages are in `site/src/content/docs/docs/`, and English pages in `site/src/content/docs/en/docs/`. Keep facts and links in sync across languages; the sidebar is configured in `site/astro.config.mjs`. The site build runs its verification script.

The GitHub Pages workflow builds relevant pull requests; relevant pushes to `main` or manual runs can deploy. The site is at [wutpeach.github.io/Ameow](https://wutpeach.github.io/Ameow/). The old Electron extension locale sync is not part of the current site build.
