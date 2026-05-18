# Design

## Problem

Douyin website downloads can now use `douyin-dl`, but they are not reliable when the app depends on browser-extension-provided cookies. The upstream project's Playwright cookie flow was proven locally to produce a working session, so the integration now needs an app-owned Douyin session layer in addition to the downloader runtime.

## Approach

1. Add a new managed runtime component for Douyin.
2. Bootstrap it through the existing runtime dependency gate during startup.
3. Install it as a Python managed runtime under `app_config_dir/runtimes/douyin-downloader/<target>/`.
4. Extend the engine/site routing so single-item Douyin downloads use the new backend.
5. Add an app-owned Douyin session store plus settings-page actions to launch the upstream Playwright cookie capture flow.
6. Make Douyin downloads resolve cookies from the app-owned session store first, instead of relying on browser extension cookie payloads.

## Architecture

- Runtime layer:
  - `electron/managedRuntimeBootstrap.mts` owns the managed Python install flow.
  - `electron/runtimeDependencyGate.mts` includes the new component in startup bootstrap.
  - `src/types/runtimeDependencies.ts` and `src/electron-runtime/runtimeDependencyGate.ts` expose the new status entry.
- Session layer:
  - Electron main owns launching `tools.cookie_fetcher` inside the managed Douyin runtime.
  - Cookie artifacts are stored under the app-owned config/user-data directory, not in the browser extension.
  - A settings-page account/session section displays Douyin session state and exposes login/refresh/clear actions.
- Download routing:
  - `src/core/types/engine-plan.ts` adds a new engine id for the Douyin backend.
  - `src/electron-runtime/engineManifest.ts` defines the CLI contract for the new backend.
  - `src/download-capabilities/runtime-site-strategies.ts` routes Douyin to the new engine first.
  - `src/download-capabilities/strategy-plans.ts` and `src/sites/douyin.ts` consume the new engine plan.
  - `src/electron-runtime/douyinDlDownload.ts` resolves Douyin cookies from the app-owned session store before falling back to request-provided cookies.

## Key Tradeoffs

- Using a managed Python runtime keeps install behavior consistent with existing macOS `yt-dlp` handling, but it adds bootstrap complexity.
- Using Playwright for login/session capture adds a UI/browser dependency, but it matches the upstream tool's proven success path against Douyin anti-bot.
- Keeping the first version scoped to Douyin avoids over-generalizing into a cross-platform account center before one platform is proven.
- Keeping the scope to single-item downloads avoids needing batch/profile orchestration, which is not currently requested.

## Compatibility

- Non-Douyin routes must remain unchanged.
- Existing queue/progress/completion events must remain unchanged.
- The new runtime must participate in status reporting so bootstart can install it automatically.
- Browser extension flows for page selection and other platform behaviors remain in place; only Douyin cookie sourcing moves away from the extension.

## Rollback

- If the new backend proves unstable, the route can be switched back while keeping the managed runtime/session plumbing in place.
- If the in-app session UX is too risky, the Playwright capture command can remain internal/dev-only while preserving the downloader runtime work.
