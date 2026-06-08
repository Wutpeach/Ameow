# Docs Site Contract

## 1. Scope / Trigger

This contract applies whenever a task changes any user-facing behavior that a public docs reader would need to understand, including:

- install, update, packaging, or release-asset behavior;
- browser-extension workflows, popup behavior, current-page media scanning, or supported-site behavior;
- download quality, format, runtime, proxy, network, cookies, login-state, or troubleshooting behavior;
- README links, extension help links, or public docs navigation;
- the Astro/Starlight docs site under `site/`.

The docs site is part of the main Ameow repository. It must be updated with product behavior, not as a separate follow-up repository.

## 2. Signatures

Commands from the repository root:

```bash
npm run docs:dev
npm run docs:build
npm run docs:preview
```

Runtime requirement:

```text
Node.js >= 22.12.0
```

The desktop app still has its own runtime requirements, but the Astro 6 docs site must build with Node 22.12 or newer. GitHub Pages docs deployment should use Node 22+.

Docs-site internal commands:

```bash
npm --prefix site run dev
npm --prefix site run build
npm --prefix site run preview
```

Deployment workflow:

```text
.github/workflows/deploy-docs.yml
```

Primary public URLs:

```text
https://wutpeach.github.io/Ameow/
https://wutpeach.github.io/Ameow/docs/
https://wutpeach.github.io/Ameow/en/docs/
```

Astro/Starlight base contract:

```js
// site/astro.config.mjs
export default defineConfig({
  site: 'https://wutpeach.github.io',
  base: '/Ameow',
});
```

## 3. Contracts

- `site/` is a normal tracked directory in the root repository, not a submodule.
- `.gitmodules` must not contain a `site` entry.
- `site/.git` must not exist.
- `.git/modules/site` must not exist.
- Root Git index must track `site/**` files as normal `100644` files, not a `160000` gitlink.
- Public user documentation source of truth is `site/src/content/docs/`.
- Chinese content is the root locale under `site/src/content/docs/docs/`.
- English content is under `site/src/content/docs/en/docs/`.
- Root `docs/` is for engineering/reference notes and repo-local assets, not public user guides.
- README and browser-extension help links must point to docs-site URLs under `https://wutpeach.github.io/Ameow/`.
- The docs deploy workflow builds from `site/` and uploads `site/dist`.
- Starlight docs pages should keep one semantic page `h1` for accessibility and SEO. If the visual title scale feels too large, adjust `site/src/styles/starlight.css` instead of demoting the page title to `h2`.

## 4. Validation & Error Matrix

| Condition | Required validation | Failure meaning |
| --- | --- | --- |
| Docs content or config changed | `npm run docs:build` | Broken route, Starlight config, markdown/MDX, or Pagefind build |
| Docs deploy workflow changed | YAML parse check plus workflow review | GitHub Pages deployment may fail |
| Docs deploy workflow uses Node < 22.12 | inspect `node-version` in `.github/workflows/deploy-docs.yml` | Astro 6 exits before building |
| README or extension docs links changed | grep old root docs and old URLs | Users may be sent to stale/deleted docs |
| `site/` migration or Git metadata changed | inspect `.gitmodules`, `site/.git`, `.git/modules/site`, and `git ls-files -s site` | Submodule model may have been reintroduced accidentally |
| Browser extension help link changed | `node --check browser-extension/popup.js` | Popup script syntax may break extension UI |

## 5. Good/Base/Bad Cases

- Good: A browser-extension behavior fix updates extension code, relevant docs pages in both locales, README/help links if needed, and passes `npm run docs:build`.
- Base: A docs-only wording update edits `site/src/content/docs/...`, passes `npm run docs:build`, and does not touch app code.
- Bad: A product behavior change updates code but leaves stale docs, causing users to follow obsolete troubleshooting or install instructions.
- Bad: A future task adds `docs/getting-started.md` as a public guide instead of adding/updating the docs-site page.
- Bad: A future task re-adds `site` as a submodule, making docs changes invisible in the root repository diff.

## 6. Tests Required

Run these when the touched surface applies:

```bash
npm run docs:build
```

Assertion points:

- Chinese routes under `/docs/...` build.
- English routes under `/en/docs/...` build.
- `site/dist` is generated locally but not tracked by Git.

For extension help-link changes:

```bash
node --check browser-extension/popup.js
```

For deploy workflow changes:

```bash
python - <<'PY'
from pathlib import Path
import yaml
yaml.safe_load(Path('.github/workflows/deploy-docs.yml').read_text(encoding='utf-8'))
PY
```

If `PyYAML` is unavailable, use another available YAML parser or clearly report that YAML parsing could not be run.

For submodule-regression checks:

```bash
test ! -f .gitmodules
test ! -e site/.git
test ! -e .git/modules/site
git ls-files -s site | head
```

On Windows PowerShell, use equivalent `Test-Path` checks. The expected `git ls-files -s site` mode for files is `100644`, not `160000`.

## 7. Wrong vs Correct

### Wrong

```text
README.md -> ./docs/getting-started.md
browser-extension/popup.js -> https://github.com/Wutpeach/Ameow/blob/main/docs/getting-started.md
site -> 160000 gitlink
```

This sends users to stale root markdown files and makes docs-site content live outside the main app commit.

### Correct

```text
README.md -> https://wutpeach.github.io/Ameow/docs/getting-started/
README.en.md -> https://wutpeach.github.io/Ameow/en/docs/getting-started/
browser-extension/popup.js -> https://wutpeach.github.io/Ameow/docs/getting-started/ or /en/docs/getting-started/
site/** -> normal tracked files
```

This keeps app behavior and public docs synchronized in one repository and one review surface.
