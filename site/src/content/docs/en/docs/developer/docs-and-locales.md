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

## Automated maintenance and recovery

Ameow Docs Sync uses Cindy native scheduling and the existing precheck; its actual Cindy status determines whether periodic execution is enabled. The precheck compares remote `main` with a separate SHA cursor: unchanged commits skip the model, while check failures block execution. Run timestamps do not establish which commits were reviewed.

Maintain the necessary bilingual changes on an isolated branch. `scripts/docs-sync.mjs` stores PR and recovery receipts for that task without adding another scheduler. It discovers and reuses the PR for the same topic, queries again after a lost creation receipt, and never advances the cursor on failure. Run `node --test scripts/docs-sync.test.mjs` to check these recovery boundaries.

The Lead merges normally only after an independent Check Worker explicitly passes the current PR HEAD, required CI succeeds, and no scope issue or conflict remains, then confirms Pages deployment. The Worker reviews without editing or merging. REPAIR, BLOCK, or execution failure stops the process and requires notification. A merged PR with failed deployment remains pending recovery.

The script offers `status` to read progress; `publish` accepts a JSON file containing `through`, `topic`, `title`, and `body` and reuses the PR on `docs/sync-<topic>`; `failure` stores a failure with `reason`; `complete` takes the actually reviewed `through`, `reason`, and an `evidence` array, checks the recorded PR merge and deployment, then saves the result before atomically updating the cursor. All writes use `D:/Ameow` as the state directory so worktrees share progress.

If main moves, history diverges, the PR HEAD changes, or state is uncertain, review the missing information before claiming success. For documentation-only merges, confirm there is no new product change, record the outcome, and advance progress without generating another PR. The helper does not replace source review or Worker PASS, merge anything itself, resume periodic execution, or publish Rust installers.
