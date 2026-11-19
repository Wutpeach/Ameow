# Ameow Site

Astro + Starlight documentation site for Ameow.

## Commands

```bash
npm ci
npm run dev
npm run build
npm run preview
```

The locked docs dependency set requires Node.js 22.19 or newer. The root docs deploy workflow uses Node 22.19.0.

The site is managed from the main Ameow repository and deployed to GitHub Pages at:

```text
https://wutpeach.github.io/Ameow/
```

GitHub Pages must be configured to use GitHub Actions as the source.

## Manual structure

Both languages share seven user pages: quick start and installation; downloads
and queue, save location, supported links and quality, settings and updates;
and troubleshooting. A single developer entry leads to source development,
testing, and site development, keeping those subpages out of the common sidebar.

Use the existing manual illustrations where they explain an action. Keep
infrequent details in context instead of adding a page for each state or error.
Remove obsolete source pages so Pagefind does not retain them in search. Only
current topics get targeted redirects, configured in `astro.config.mjs`.
The build checks local references and the presence of the seven figure kinds.
