# Investigate Windows npm dev failure

## Goal

Restore a working Windows local development environment so `npm run dev` can start successfully on the current machine.

## Confirmed Facts

- The project's `dev` script runs `node ./scripts/run-electron-dev.mjs`.
- `predev` completes successfully on this machine.
- `node_modules` was initially missing, which caused `vite` and `typescript` module resolution failures.
- After dependency installation partially completed, `vite`, `typescript`, and `electron` packages appeared in `node_modules`.
- `npm ping` to `https://registry.npmjs.org/` succeeds on this machine.
- Environment inspection shows `ALL_PROXY=socks5://127.0.0.1:7897`.
- `npm run dev` now fails because Electron installation is incomplete: `node_modules/electron` lacks the installed runtime payload expected by `electron/index.js`.
- A background `npm install` process was still running after the interrupted install attempt.

## Requirements

- Stop any leftover install processes that keep the dependency tree in a partial state.
- Clean up the broken local Electron installation without disturbing unrelated repository changes.
- Reinstall or repair dependencies until the local Electron runtime is correctly installed.
- Verify whether `npm run dev` can start the renderer and Electron process on Windows.
- If further blockers remain after dependency repair, identify the next concrete Windows-specific failure.
- Add a user-configurable global desktop proxy setting so Electron-owned network requests can use an explicit proxy URL instead of relying only on ambient system/environment proxy configuration.
- The first version only needs a global proxy toggle plus a single proxy URL field; it does not need auth, PAC, or per-feature proxy routing.

## Acceptance Criteria

- [ ] No stale `npm install` process is left running for this repository repair.
- [ ] `node_modules/electron` contains a valid installed runtime payload for the current platform.
- [ ] Running `npm run dev` no longer fails with missing `vite`/`typescript` modules or `Electron failed to install correctly`.
- [ ] The final status clearly distinguishes between repaired environment issues and any remaining application-level startup issues.
- [ ] Settings UI exposes a global proxy toggle and proxy URL field.
- [ ] Saving proxy settings applies them to the Electron desktop network session without requiring manual JSON edits.
- [ ] Desktop-side bootstrap/update/download fetches continue to use the existing session-backed fetch path, now honoring the configured proxy when enabled.

## Out Of Scope

- Refactoring the repository's dev scripts unless environment repair proves insufficient.
- Unrelated dependency upgrades.
- Proxy authentication, PAC scripts, or per-module proxy policies.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
