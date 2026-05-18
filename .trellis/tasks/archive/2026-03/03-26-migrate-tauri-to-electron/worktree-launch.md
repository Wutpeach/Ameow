# Worktree Launch Plan

- Generated: 2026-03-26T17:24:26
- Parent Task: `03-26-migrate-tauri-to-electron`
- Selection Mode: `all`
- Platform: `codex`
- Manual Start Command: `$start Implement the plan.`

## Ready To Launch

### 1. 03-26-electron-foundation-contracts

- Title: Electron foundation: runtime contract capture
- Status: `planning`
- Branch: `task/03-26-electron-foundation-contracts`
- Depends On: `(none)`
- Worktree: `D:\trellis-worktrees\task\03-26-electron-foundation-contracts`

```powershell
Set-Location 'D:\trellis-worktrees\task\03-26-electron-foundation-contracts'
codex
$start Implement the plan.
```

## Blocked

- `03-26-electron-shell-bridge` waiting for: `03-26-electron-foundation-contracts` (branch `task/03-26-electron-shell-bridge`, worktree `D:\trellis-worktrees\task\03-26-electron-shell-bridge`)
- `03-26-electron-native-integrations` waiting for: `03-26-electron-foundation-contracts` (branch `task/03-26-electron-native-integrations`, worktree `D:\trellis-worktrees\task\03-26-electron-native-integrations`)
- `03-26-electron-download-runtime` waiting for: `03-26-electron-foundation-contracts` (branch `task/03-26-electron-download-runtime`, worktree `D:\trellis-worktrees\task\03-26-electron-download-runtime`)
- `03-26-electron-release-cutover` waiting for: `03-26-electron-foundation-contracts`, `03-26-electron-shell-bridge`, `03-26-electron-native-integrations`, `03-26-electron-download-runtime` (branch `task/03-26-electron-release-cutover`, worktree `D:\trellis-worktrees\task\03-26-electron-release-cutover`)
- `03-26-electron-verify-cleanup` waiting for: `03-26-electron-shell-bridge`, `03-26-electron-native-integrations`, `03-26-electron-download-runtime`, `03-26-electron-release-cutover` (branch `task/03-26-electron-verify-cleanup`, worktree `D:\trellis-worktrees\task\03-26-electron-verify-cleanup`)

## Completed

- None
