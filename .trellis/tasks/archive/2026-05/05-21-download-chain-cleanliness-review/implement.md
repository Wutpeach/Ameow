# Implementation

## Goal

Complete a small but coherent migration that:

1. Renames the browser/runtime quality preference to a product-level concept.
2. Removes stale YouTube light-mode execution behavior.
3. Makes the quality selectors match the approved semantics.
4. Keeps legacy payloads readable during the migration window.

## Order Of Work

1. Add shared normalized quality helpers and new product-level type aliases.
2. Update browser-extension wire payload and Electron boundary code to use the new field name.
3. Update runtime queue/intent plumbing and keep compatibility reads for legacy fields.
4. Remove YouTube light-mode execution and fix selector semantics.
5. Add or update tests for wire, selector, and runtime behavior.
6. Run validation commands and update specs.

## Planned File Touches

- `src/core/download-preferences.ts`
- `src/core/types/raw-download-input.ts`
- `src/core/types/download-intent.ts`
- `src/core/schemas/raw-download-input-schema.ts`
- `src/core/schemas/download-intent-schema.ts`
- `electron/main.mts`
- `electron/videoDownloadCommands.mts`
- `electron/extensionRequestBridge.mts`
- `browser-extension/background.js`
- `src/electron-runtime/ytDlpDownload.ts`
- `src/electron-runtime/ytDlpCommandPlan.ts`
- `src/electron-runtime/engineManifest.ts`
- `src/electron-runtime/*.test.ts`
- `electron/*.test.mts`

## Implementation Notes

- Keep the shared helper dependency-light and framework-neutral.
- Preserve accepted aliases:
  - `high -> balanced`
  - `standard -> data_saver`
- Introduce the new wire field without breaking legacy reads in this pass.
- Do not change direct-download routing or orchestrator fallback policy.
- Keep quality logging explicit enough to show whether a backend applied or ignored the preference.

## Validation

Run these after the edits:

```bash
npm run type-check
npm run lint
npm test -- src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/engineManifest.test.ts electron/videoDownloadCommands.test.mts src/electron-runtime/commandRouter.test.ts
```

If the wire rename touches more call sites than expected, run the broader runtime tests:

```bash
npm test -- src/electron-runtime/
```

## Rollback Points

- If the wire rename creates excessive churn, revert only the new-field emission first and keep the internal normalization.
- If removing light-mode causes behavior regressions, reintroduce only the minimal retry fallback after selector semantics are verified.
