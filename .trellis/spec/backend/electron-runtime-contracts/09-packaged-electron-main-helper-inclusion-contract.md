## Scenario: Packaged Electron Main Helper Inclusion Contract

### 1. Scope / Trigger

- Trigger: Any task that adds, renames, or refactors a helper module imported by `electron/main.mts`, `electron/preload.mts`, or another file compiled into `dist-electron/`.
- Why this needs code-spec depth: Packaged Electron builds execute `dist-electron/electron/*.mjs`, not the source `electron/` directory. A helper can exist in source and still be missing from the installed app if it is outside the Electron TypeScript emit contract.

### 2. Signatures

Electron main import signature example:

```ts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";
```

Electron compile boundary:

```json
{
  "include": ["electron/**/*.mts"],
  "outDir": "dist-electron"
}
```

Packaged runtime file paths:

```txt
dist-electron/electron/main.mjs
dist-electron/electron/macAppVisibility.mjs
dist-release/<target>/Ameow.app/Contents/Resources/app/dist-electron/electron/macAppVisibility.mjs
```

### 3. Contracts

- Any module that `electron/main.mts` or `electron/preload.mts` statically imports at runtime must exist in `dist-electron/electron/` with the same emitted `.mjs` path.
- Source helpers owned by the Electron build must live inside the `tsconfig.electron.json` include contract, or the same task must add an explicit copy step that produces the packaged runtime file.
- Do not leave a runtime-owned helper only as `electron/<name>.mjs` source if `tsconfig.electron.json` only emits `electron/**/*.mts`.
- `electron-builder` packaging is downstream of the compile step. If `dist-electron/electron/<name>.mjs` is missing before packaging, the installed app will still be missing that file.
- When converting a helper from source `.mjs` to `.mts`, keep the runtime import in compiled modules as `./<name>.mjs` so NodeNext output and packaged Electron resolve the emitted file correctly.

### 4. Validation & Error Matrix

| Condition | Validation Point | Expected Behavior | Action |
|-----------|------------------|-------------------|--------|
| Helper source is inside Electron TypeScript emit contract | `npm run electron:build` then inspect `dist-electron/electron/` | Emitted `.mjs` helper exists and packaged startup can resolve it | OK |
| Helper is imported by `main.mts` but left outside `tsconfig.electron.json` include globs | Launch packaged app or import `dist-electron/electron/main.mjs` | Startup can fail with `ERR_MODULE_NOT_FOUND` for the helper path | Move helper into emitted source set or add explicit copy step |
| Helper exists in source but not in packaged `Resources/app/dist-electron/electron/` | Inspect packaged app contents after `npm run package:dir` | Packaged app is invalid even if source tree looks complete | Treat as build contract failure, not a machine-specific runtime bug |
| Helper is converted to `.mts` but imports are changed to `.mts` in runtime code | `npm run type-check` / packaged startup | NodeNext output can drift from actual emitted packaged path | Keep runtime import specifier `.mjs` |

### 5. Good / Base / Bad Cases

- Good:
  - `electron/macAppVisibility.mts` is included by `tsconfig.electron.json`, `npm run electron:build` emits `dist-electron/electron/macAppVisibility.mjs`, and packaged startup resolves the import successfully.
- Base:
  - A helper needs to stay plain `.mjs` source for a specific reason, and the same task adds a deterministic copy step plus a packaging assertion that the file lands in `dist-electron/electron/`.
- Bad:
  - `electron/main.mts` imports `./macAppVisibility.mjs`, but only `electron/macAppVisibility.mjs` exists in source and no emitted `dist-electron/electron/macAppVisibility.mjs` is produced.
  - A release build passes local source inspection but the installed app crashes on first launch because the helper never entered `dist-electron`.

### 6. Tests Required (with assertion points)

- `npm run type-check`: Electron TypeScript sources compile cleanly after moving or adding the helper.
- `npm run electron:build`: `dist-electron/electron/<helper>.mjs` exists after the build.
- `node -e "import('./dist-electron/electron/<helper>.mjs')..."`: emitted helper can be resolved directly by Node ESM.
- `npm run package:dir`: packaged app is created successfully from the same build chain used in release automation.
- Inspect packaged app contents: `Contents/Resources/app/dist-electron/electron/<helper>.mjs` exists in the packaged app.
- Manual assertion (packaged macOS build): first launch does not show a main-process `ERR_MODULE_NOT_FOUND` dialog for a missing Electron helper module.

### 7. Wrong vs Correct

#### Wrong

```ts
// electron/main.mts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";

// Source file exists only as electron/macAppVisibility.mjs
// tsconfig.electron.json still emits only electron/**/*.mts
```

#### Correct

```ts
// electron/main.mts
import { applyMacTrayAppMode } from "./macAppVisibility.mjs";

// Source file lives at electron/macAppVisibility.mts
// tsc emits dist-electron/electron/macAppVisibility.mjs
```

Why wrong:
- The source tree looks valid, but the packaged runtime executes `dist-electron/electron/main.mjs`, where the imported helper does not exist.
- GitHub Actions and local packaging both reproduce the same broken artifact because they package `dist-electron/**/*`, not arbitrary source helpers.
