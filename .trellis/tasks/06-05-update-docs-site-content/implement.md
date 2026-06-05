# Implementation Plan

## Checklist

- [ ] Confirm Starlight i18n configuration changes needed for `root` Chinese + `/en/` English.
- [ ] Update planning assumptions if the concrete Starlight locale/content structure differs from current expectation.
- [ ] Add full English docs-site pages for the existing public user-doc tree.
- [ ] Update Chinese docs-site pages:
  - [ ] `browser-extension.md`
  - [ ] `extension/supported-sites.md`
  - [ ] `troubleshooting/download-failures.md`
  - [ ] `faq.md`
- [ ] Add or migrate English counterparts for the public docs tree, including:
  - [ ] landing/index
  - [ ] downloads
  - [ ] concepts
  - [ ] getting started
  - [ ] FAQ
  - [ ] browser extension section
  - [ ] desktop section
  - [ ] advanced section
  - [ ] troubleshooting section
  - [ ] releases entry page
- [ ] Add the YouTube/proxy troubleshooting guidance in the chosen user-facing pages.
- [ ] Update README entry links to docs-site URLs.
- [ ] Update extension popup “Getting started” link to docs-site URL.
- [ ] Decide whether root user-doc copies are deleted now or left as deprecated compatibility files after entry-point migration.
- [ ] Convert `site/` from submodule to normal root-repository directory:
  - [ ] Remove `.gitmodules` entry for `site`.
  - [ ] Remove the `site` gitlink from the root index without deleting the working tree.
  - [ ] Remove nested submodule Git metadata so `site/` files are tracked by the root repo.
  - [ ] Add root-level docs-site helper scripts.
  - [ ] Move the docs deploy workflow to root `.github/workflows/` and build from `site/`.
  - [ ] Update docs-site base URL and entry links for the main repository GitHub Pages path.
- [ ] Build the docs site and verify the new routes.

## Validation Commands

```bash
cd site
npm run build
```

After single-repository migration, also run from the root:

```bash
npm run docs:build
```

If route/config changes are substantial, also run:

```bash
cd site
npm run dev
```

and manually confirm Chinese root + English `/en/` routes resolve.

## Risk Notes

- The user explicitly expanded scope to full English public-doc coverage; keep that full-coverage work bounded to the existing public docs tree and avoid additional new content.
- Avoid leaving README or extension links pointing at paths that do not exist on the docs site.
- Treat root `docs/` engineering/reference files as out of scope for deletion or restructuring.
- Do not use destructive Git reset/checkout operations for submodule conversion. Keep the current `site/` working tree content and stage it as ordinary files.
