## Scenario: Site-Scoped yt-dlp Quality Profile Contract

### 1. Scope / Trigger

- Trigger: Any task that changes `best`, `balanced`, or `data_saver` format selectors for `yt-dlp` downloads.
- Why this needs code-spec depth: The UI exposes three global quality preferences, but each site exposes different format families. The mapping from preference to selector must be table-driven per site to avoid scattered conditionals.

### 2. Signatures

```ts
type YtdlpFormatProfileSet = Record<YtdlpQualityPreference, YtdlpFormatProfile>;
type YtdlpSiteFormatProfiles = Record<string, YtdlpFormatProfileSet>;
```

Resolver boundary:

```ts
resolveYtdlpFormatProfile(
  quality: YtdlpQualityPreference | undefined,
  hasFfmpeg: boolean,
  options?: { isYouTube?: boolean; siteId?: string },
): YtdlpFormatProfile
```

### 3. Contracts

- `src/electron-runtime/engineManifest.ts` owns `YTDLP_SITE_FORMAT_PROFILES`.
- `default` must define `best`, `balanced`, and `data_saver`.
- Every site-specific profile, such as `youtube`, must define all three quality preferences.
- Unknown `siteId` values must fall back to `default`.
- URL-level YouTube detection may force the `youtube` profile even when `siteId` is missing or generic.
- `src/electron-runtime/ytDlpCommandPlan.ts` may pass `siteId` and URL-derived booleans into the resolver, but must not contain per-site selector switch branches.
- No-FFmpeg fallback profiles may stay generic because they intentionally avoid merge-only adaptive selectors.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| `siteId: "youtube"` with `balanced` | `resolveYtdlpFormatProfile(...)` | Returns YouTube-specific balanced selector | OK |
| YouTube URL but missing/generic `siteId` | `isYouTube: true` option | Returns YouTube-specific selector | OK |
| Unknown site id | resolver fallback | Returns `default` selector set | OK |
| New site profile missing one quality key | TypeScript compile | Type error via `YtdlpFormatProfileSet` | Add the missing profile |
| Per-site selector logic added to `ytDlpCommandPlan.ts` | code review/tests | Contract violation | Move selector data into `YTDLP_SITE_FORMAT_PROFILES` |

### 5. Good / Base / Bad Cases

- Good: Adding Bilibili-specific `balanced` means adding a `bilibili` entry with `best`, `balanced`, and `data_saver` selectors in `YTDLP_SITE_FORMAT_PROFILES`.
- Base: Twitter/X has no custom profile yet, so `siteId: "twitter-x"` uses `default`.
- Bad: `createYtdlpCommandPlan(...)` switches on `context.intent.siteId` to choose raw selector strings.

### 6. Tests Required

- `npm test -- src/electron-runtime/engineManifest.test.ts`: site-specific profile, URL-forced YouTube profile, unknown-site fallback, and no-FFmpeg fallback.
- `npm test -- src/electron-runtime/ytDlpCommandPlan.test.ts`: command planning passes site context without changing argument ordering.
- `npm run type-check`
- `npm run lint`

### 7. Wrong vs Correct

#### Wrong

```ts
if (context.intent.siteId === "youtube") {
  selector = "...";
}
```

#### Correct

```ts
const formatProfile = resolveYtdlpFormatProfile(
  context.intent.ytdlpQuality,
  Boolean(context.binaries.ffmpeg),
  { isYouTube: youtubeUrl, siteId: context.intent.siteId },
);
```

Runtime import contract:

```ts
import { dirname, join, resolve } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
```

### 3. Contracts

- `electron/main.mts` top-level code must be ordered so any immediately read `const`/`let` dependency is declared before it is passed into a controller.
- Top-level option objects may reference function declarations declared later, but must not reference later `const`/`let` bindings by value.
- If a controller must call a later `const`/`let` dependency, pass a lazy callback and ensure the callback is only invoked after assignment:

```ts
refreshTrayMenu(startupConfigSnapshot) {
  return updateTrayMenu(startupConfigSnapshot);
}
```

- `electron/main.mts` uses `// @ts-nocheck`; every Node helper called directly at top level must be explicitly imported because `npm run type-check` will not catch missing imports in that file.
- `npm run dev` is the startup assertion for this contract, not only `npm run type-check`.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Missing direct import for a top-level helper | Electron load | `ReferenceError: <name> is not defined` | Import the helper from its Node module or local module |
| Controller reads a later `const`/`let` binding | Electron load | `ReferenceError: Cannot access '<name>' before initialization` | Move construction after the binding or pass a lazy callback |
| Controller receives a later function declaration | Electron load | Function is available during module evaluation | OK |
| Lazy callback references a later binding but is invoked after assignment | Runtime call site | Callback succeeds | OK |
| Lazy callback can run during controller construction | Electron load | Same TDZ risk as direct reference | Move construction or refactor controller setup |

### 5. Good / Base / Bad Cases

- Good: `createAppUpdateController({ readConfigObject })` is called after `const readConfigObject = configStore.readConfigObject`.
- Base: `createConfigStore({ emitAppEvent })` can appear before `function emitAppEvent(...)` because function declarations are initialized before ESM evaluation.
- Bad: `createConfigStore({ refreshTrayMenu: updateTrayMenu })` appears before `const updateTrayMenu = trayMenuController.updateTrayMenu`.
- Bad: `dirname(fileURLToPath(...))` is used while only `join` and `resolve` are imported from `node:path`.

### 6. Tests Required

- `npm run type-check`: emitted declarations and non-ignored modules compile.
- `npm run lint`: renderer lint remains clean.
- `npm test`: Electron runtime unit tests remain green.
- `npm run electron:build`: ESM output includes direct imports for helpers used at top level.
- Manual assertion: `npm run dev` reaches normal Electron startup logs such as `>>> [WS] Server started: ws://127.0.0.1:39527` without `App threw an error during load`.

### 7. Wrong vs Correct

#### Wrong

```ts
const appUpdateController = createAppUpdateController({
  readConfigObject,
});

const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;
```

#### Correct

```ts
const configStore = createConfigStore(...);
const readConfigObject = configStore.readConfigObject;

const appUpdateController = createAppUpdateController({
  readConfigObject,
});
```

#### Wrong

```ts
const configStore = createConfigStore({
  refreshTrayMenu: updateTrayMenu,
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```

#### Correct

```ts
const configStore = createConfigStore({
  refreshTrayMenu(startupConfigSnapshot) {
    return updateTrayMenu(startupConfigSnapshot);
  },
});

const updateTrayMenu = trayMenuController.updateTrayMenu;
```
