# Worktree Guide

## Current Situation

Window A already started in the main working tree. That is acceptable.

Recommended next step for Window A in `D:\FlowSelect`:

```powershell
git switch -c task/i18n-foundation
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-foundation
```

If Window A already called `task.py start` in the main working tree, that is still fine. The important rule is:

* Do not let any other Codex window call `task.py start` inside this same working tree.

## Recommended Flow

Use the current repo for `03-10-i18n-foundation`, then create separate worktrees for the other parallel tasks only after foundation is committed and merged to `main`.

Why:

* these new task files are currently local workspace changes, not guaranteed to exist in a fresh worktree created from `main`
* foundation defines the contracts that the parallel tasks depend on
* this reduces rebase/conflict churn substantially

## After Foundation Is Merged To `main`

Run these from `D:\FlowSelect`.

### Common setup

```powershell
New-Item -ItemType Directory -Force ..\trellis-worktrees | Out-Null
```

### Window B: desktop React

```powershell
git worktree add ..\trellis-worktrees\03-10-i18n-desktop-react -b task/i18n-desktop-react main
Copy-Item .\.trellis\.developer ..\trellis-worktrees\03-10-i18n-desktop-react\.trellis\.developer -Force
Set-Location ..\trellis-worktrees\03-10-i18n-desktop-react
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-desktop-react
```

### Window C: extension sync

```powershell
Set-Location D:\FlowSelect
git worktree add ..\trellis-worktrees\03-10-i18n-extension-sync -b task/i18n-extension-sync main
Copy-Item .\.trellis\.developer ..\trellis-worktrees\03-10-i18n-extension-sync\.trellis\.developer -Force
Set-Location ..\trellis-worktrees\03-10-i18n-extension-sync
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-extension-sync
```

### Window D: Rust tray

```powershell
Set-Location D:\FlowSelect
git worktree add ..\trellis-worktrees\03-10-i18n-rust-tray -b task/i18n-rust-tray main
Copy-Item .\.trellis\.developer ..\trellis-worktrees\03-10-i18n-rust-tray\.trellis\.developer -Force
Set-Location ..\trellis-worktrees\03-10-i18n-rust-tray
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-rust-tray
```

### Window E: verification

Create this only after B/C/D are merged or at least rebased onto the same latest `main`.

```powershell
Set-Location D:\FlowSelect
git worktree add ..\trellis-worktrees\03-10-i18n-verify -b task/i18n-verify main
Copy-Item .\.trellis\.developer ..\trellis-worktrees\03-10-i18n-verify\.trellis\.developer -Force
Set-Location ..\trellis-worktrees\03-10-i18n-verify
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-verify
```

## If You Need To Create Worktrees Before Foundation Is Merged

This is possible, but not recommended.

Fresh worktrees created from `main` will not automatically contain today's uncommitted `.trellis/tasks/03-10-*` files from your current working tree.

If you really need to do that now, create the worktree and then manually copy:

* `.trellis\.developer`
* `.trellis\tasks\03-10-03-10-chinese-primary-language`
* the specific child task directory for that worktree

Example for desktop React:

```powershell
Set-Location D:\FlowSelect
git worktree add ..\trellis-worktrees\03-10-i18n-desktop-react -b task/i18n-desktop-react main
Copy-Item .\.trellis\.developer ..\trellis-worktrees\03-10-i18n-desktop-react\.trellis\.developer -Force
Copy-Item .\.trellis\tasks\03-10-03-10-chinese-primary-language ..\trellis-worktrees\03-10-i18n-desktop-react\.trellis\tasks\03-10-03-10-chinese-primary-language -Recurse -Force
Copy-Item .\.trellis\tasks\03-10-i18n-desktop-react ..\trellis-worktrees\03-10-i18n-desktop-react\.trellis\tasks\03-10-i18n-desktop-react -Recurse -Force
Set-Location ..\trellis-worktrees\03-10-i18n-desktop-react
python .\.trellis\scripts\task.py start .trellis\tasks\03-10-i18n-desktop-react
```

## Merge Sequence

### 1. Merge foundation first

From `D:\FlowSelect` after Window A commits its work:

```powershell
git switch main
git merge --no-ff task/i18n-foundation
```

### 2. Update parallel branches before merging them

In each parallel worktree:

```powershell
git rebase main
```

If rebase is inconvenient, merge `main` into the branch instead.

### 3. Merge parallel branches one by one

From `D:\FlowSelect`:

```powershell
git switch main
git merge --no-ff task/i18n-desktop-react
git merge --no-ff task/i18n-extension-sync
git merge --no-ff task/i18n-rust-tray
```

### 4. Merge verification last

```powershell
git switch main
git merge --no-ff task/i18n-verify
```

## Remove Worktrees After Merge

Run from `D:\FlowSelect` after each branch is merged and no longer needed:

```powershell
git worktree remove ..\trellis-worktrees\03-10-i18n-desktop-react
git branch -d task/i18n-desktop-react

git worktree remove ..\trellis-worktrees\03-10-i18n-extension-sync
git branch -d task/i18n-extension-sync

git worktree remove ..\trellis-worktrees\03-10-i18n-rust-tray
git branch -d task/i18n-rust-tray

git worktree remove ..\trellis-worktrees\03-10-i18n-verify
git branch -d task/i18n-verify
```

Foundation is using the main working tree in this plan, so there is no extra worktree to remove for it.
