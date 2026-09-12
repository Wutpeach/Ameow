# Reviewable commit plan

Implementation and validation are complete. The user approved this commit plan and task archival on 2026-09-12. Executed commits: f4041e1c (Report repair), 7c022826 (P2-B stage-only). No push or next product phase is authorized.

## 1. Prior bounded Report repair

Proposed message: `fix: preserve structured runtime and terminal report evidence`

- electron/errorDiagnosticCopy.mts
- electron/errorDiagnosticCopy.test.mts
- electron/errorDiagnosticCommands.test.mts

## 2. P2-B stage-only implementation

Proposed message: `feat: stage approved managed yt-dlp releases without activation`

- .gitignore
- desktop-assets/binaries/ytdlp-managed-releases.json
- electron-builder.config.mjs
- electron/diagnostics.mts
- electron/diagnostics.test.mts
- electron/main.mts
- electron/managedRuntimeBootstrap.mts
- electron/managedRuntimeBootstrap.test.mts
- electron/managedRuntimeBootstrapProcess.test.mts
- electron/managedYtDlpRelease.mts
- electron/managedYtDlpRelease.test.mts
- electron/managedYtDlpReleaseCommands.mts
- electron/managedYtDlpReleaseCommands.test.mts
- electron/ytDlpBaseline.mts
- electron/ytDlpBaseline.test.mts
- electron/ytDlpPackageSet.mts
- package.json
- scripts/managed-ytdlp-package-set.mjs
- scripts/managed-ytdlp-package-set.d.mts
- scripts/managed-ytdlp-package-set.test.mts
- scripts/managed-ytdlp-release-manifest.mjs
- scripts/prepare-ytdlp-baseline.mjs
- scripts/prepare-ytdlp-managed-release.mjs
- scripts/run-electron-package.mjs
- scripts/verify-ytdlp-baseline-package.mjs
- scripts/verify-ytdlp-managed-release.mjs
- scripts/verify-ytdlp-managed-release-package.mjs
- scripts/verify-ytdlp-managed-release-package.test.mts
- src/electron-runtime/processRunner.ts
- src/electron-runtime/runtimePaths.ts
- src/types/diagnostics.ts
- src/types/electronBridge.ts
- tsconfig.electron.json
- .trellis/spec/backend/electron-runtime-contracts/04-electron-download-command-bridge-contract.md
- .trellis/spec/backend/electron-runtime-contracts/07-electron-managed-runtime-bootstrap-module-contract.md

## Bookkeeping and exclusions

Task artifacts and session records are separate Trellis bookkeeping after code commits. Existing `.codex/agents/trellis-check.toml` and `.trellis/tmp/` are unrelated user-owned changes and must remain excluded. No real release approval, production staging, activation, next phase, or remote push is included.
