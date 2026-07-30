# Context policy audit

## Scope

Audit date: 2026-07-30.

Reviewed local Trellis spec/research sizes, task JSONL usage, task validation/start behavior, Codex sub-agent injection, and large application test files. Existing uncommitted Trellis changes were treated as authoritative and were not reverted.

## Findings

### Spec size

`.trellis/spec/` contains 26 Markdown files. Four exceed the existing 32768-byte context file cap:

| File | Bytes | Lines |
| --- | ---: | ---: |
| `.trellis/spec/backend/electron-runtime-contracts.md` | 176499 | 2678 |
| `.trellis/spec/frontend/type-safety.md` | 105538 | 1652 |
| `.trellis/spec/backend/type-safety.md` | 77733 | 1160 |
| `.trellis/spec/backend/sidecar-runtime-contracts.md` | 35879 | 362 |

The large files already have scenario headings suitable for mechanical, low-risk splitting. The Electron proxy scenario is itself large enough that it may require a second split by existing subsection contracts.

### Research size

The discovered task research files are all below 24 KiB. The largest is 23786 bytes. There is no immediate research migration, but the same leaf-size policy should prevent future growth.

### Manifest history

Across 600 archived/active `implement.jsonl` and `check.jsonl` files, 2631 real entries were found. Historical data includes 389 `index.md` references and 643 references to files currently above 32 KiB. No directory entries were found, although the current command and hook still support them.

The 10 manifests in non-archived tasks currently contain no real curated entries, so the new policy does not require an active-task bulk migration. Archived manifests should remain historical rather than being rewritten.

### Enforcement gap

- Existing uncommitted code adds per-file, artifact, and total injection caps.
- `task.py validate` only warns when a referenced file exceeds the per-file cap.
- `task.py start` does not call context validation before changing task state or the active pointer.
- `task.py add-context` accepts directories.
- The Codex hook expands directory entries into up to 20 Markdown files.

This means the current cap protects runtime prompt size but does not enforce a maintainable document structure.

### Test files

The largest application tests are:

| File | Bytes | Lines |
| --- | ---: | ---: |
| `src/electron-runtime/service.test.ts` | 83212 | 2361 |
| `src/electron-runtime/ytDlpDownload.test.ts` | 46897 | 1316 |
| `browser-extension/generic-video-detector.test.js` | 41038 | 1379 |

These files are not automatically included by task manifests and therefore do not cause the reported Trellis prompt-size problem. Splitting them solely by byte count would create churn without a demonstrated benefit. Revisit only when a touched test shows duplicated setup or mixed responsibilities.

## Recommended policy

1. Use 32768 bytes as the hard maximum for an injectable spec/research leaf.
2. Treat `index.md` and marked compatibility entry files as navigation indexes only.
3. Allow JSONL entries only for non-index `.md` files under `.trellis/spec/**` or the current task's `research/**`.
4. Reject directories and invalid paths at `add-context`, `validate`, and `start`.
5. Keep the hook's byte caps as defense in depth, but skip invalid index/directory entries instead of expanding them.
6. Add a small explicit audit command for the spec and non-archived research corpus.
7. Split the four oversized specs by their existing scenario structure and retain compact marked compatibility indexes at old paths.

This is the smallest policy that makes context selection predictable without adding a database, generated catalog, or third-party tooling.
