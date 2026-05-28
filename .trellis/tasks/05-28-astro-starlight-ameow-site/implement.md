# Implementation Plan: Astro Starlight docs site

## Preconditions

- MVP scope is confirmed as Chinese-first; English/i18n is a later iteration.
- `ameow-site` repository is accessible with push permission.
- If `ameow-site` is empty, initialize and push its default `main` branch before adding it as a submodule to the main repo.

## Phase 1: Initialize `ameow-site`

- Clone `https://github.com/Wutpeach/ameow-site.git` outside or inside the main workspace as appropriate.
- Initialize Astro Starlight:

```bash
npm create astro@latest -- --template starlight
```

- Use npm for consistency with the main repository unless the site repo already has a different lockfile.
- Commit `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `src/`, `public/`, and workflow files.

## Phase 2: Configure Site Routes

- Configure `astro.config.mjs`:
  - `site: "https://wutpeach.github.io"`
  - `base: "/ameow-site"`
  - Starlight title and sidebar.
- Create `src/pages/index.astro` for the custom homepage.
- Keep docs pages under `src/content/docs/`.
- Ensure internal links work with Astro's configured base.

## Phase 3: Build Homepage

- Create a custom homepage using Astro and CSS.
- Use existing visual assets from `docs/readme/*.svg` copied into `public/images/`.
- Include:
  - product summary
  - primary download CTA to `https://github.com/Wutpeach/Ameow/releases/latest`
  - docs CTA to `/docs/`
  - feature/workflow sections
  - platform cards or rows
  - footer links

## Phase 4: Migrate MVP Docs

- Copy and adapt:
  - `docs/getting-started.md` -> `src/content/docs/getting-started.md`
  - `docs/browser-extension.md` -> `src/content/docs/browser-extension.md`
  - `docs/faq.md` -> `src/content/docs/faq.md`
- Create `src/content/docs/index.mdx` and `downloads.md`.
- Update relative links to Starlight routes.
- Keep content public-safe; do not include private implementation details.

## Phase 5: Add GitHub Pages Deployment

- Add `.github/workflows/deploy.yml` in `ameow-site`.
- Use Astro official Pages workflow shape:
  - checkout
  - `withastro/action`
  - `actions/deploy-pages`
- Configure repository Settings -> Pages -> Source: GitHub Actions.
- Verify the deployed URL:

```text
https://wutpeach.github.io/ameow-site/
```

## Phase 6: Add Main Repo Submodule

- From the main `Ameow` repo, add:

```bash
git submodule add https://github.com/Wutpeach/ameow-site.git site
git submodule update --init --recursive
```

- Commit `.gitmodules` and the `site` gitlink.
- Do not update the main repository README links in the first implementation pass. Defer public site link replacement until the deployed Pages URL and Astro `base` behavior are verified.
- Add contributor notes later if needed:

```bash
git submodule update --remote site
```

## Validation Commands

In `ameow-site`:

```bash
npm install
npm run build
npm run dev
```

In main repo:

```bash
git submodule status
git submodule update --init --recursive
```

Optional after README link updates in main repo:

```bash
npm run lint
npm run type-check
```

## Rollback Points

- Before adding submodule: site work can be reverted entirely in `ameow-site`.
- After adding submodule: remove `site` gitlink and `.gitmodules` changes if the integration is not wanted.
- After README link changes: revert only README changes if public URL or route changes.

## Review Gate Before Implementation

- Submodule path is confirmed as `site/`.
- README public-site link replacement is deferred until after first deploy verification.
