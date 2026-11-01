# Implementation Plan

Do not start product-code edits until the user approves the final planning summary and `task.py start` moves this task to `in_progress`.

## Ordered checklist

1. Load implementation context and confirm baseline.
   - Read `prd.md`, `design.md`, this plan, and `research/current-network-execution-audit.md`.
   - Run `trellis-before-dev` and read the applicable backend/runtime, error/logging, cross-layer/reuse/cross-platform, and docs-site leaves.
   - Re-run the focused 94-test proxy/runtime baseline if the worktree changed after planning.

2. Promote proxy parsing into the framework-neutral route model.
   - Add discriminated `NetworkRoute`, resolution trace, consumer, sanitized diagnostic, and network failure types.
   - Reuse/evolve `src/config/cliProxy.ts` parsing instead of maintaining a second parser.
   - Cover DIRECT, PROXY, HTTP, HTTPS, SOCKS/SOCKS4, SOCKS5, multiple, malformed, IPv6/port/case/whitespace, environment credentials, `resolvedFor`, and redaction.
   - Keep persisted manual config validation semantics unchanged.

3. Implement the single precedence/resolution service at the Electron composition boundary.
   - Inject effective policy, `session.resolveProxy(targetUrl)`, and environment snapshot.
   - Implement `manual > system result (proxy or explicit DIRECT) > environment (system unavailable/not-applicable) > direct fallback` with explicit DIRECT finality and resolution-failure behavior from `design.md`.
   - Resolve upper/lower HTTP(S)/ALL/NO proxy variables to a final target-specific route using the exact precedence in `design.md`; do not let consumers re-read or receive the raw rule set.
   - Treat authoritative malformed environment values as complex/unsupported, and evaluate `NO_PROXY`/`no_proxy` into explicit direct before adapter mapping.
   - Replace diagnostics-only gallery skip and the unused production conversion helpers with one resolution result.
   - Add focused service tests for manual, system single/direct/complex/failure, `resolvedFor`, HTTPS/HTTP variable selection, uppercase/lowercase conflicts, ALL fallback, NO_PROXY match/non-match, malformed authoritative environment values, and direct.

4. Add deterministic engine adapters.
   - yt-dlp adapter: explicit `--proxy ""` for direct, exactly one `--proxy <url>` for HTTP/HTTPS, deterministic env scrubbing, sanitized application diagnostic, and a delegation capability flag: actual downloads reject SOCKS4/SOCKS5 before spawn (FFmpegFD selection is unknowable pre-spawn and ffmpeg cannot use SOCKS), while the non-downloading probe keeps native SOCKS.
   - gallery-dl adapter: always add `-o extractor.*.proxy-env=false`; add `--proxy ""` for direct or exactly one `--proxy <url>` for HTTP/HTTPS/SOCKS4/SOCKS5; reject complex routes before spawn.
   - Verify against pinned gallery-dl 1.32.8 that `proxy-env=false` sets Requests `Session.trust_env=false`, thereby disabling environment and Windows Registry discovery. Existing `--config-ignore` alone is insufficient.
   - Ensure all upper/lower HTTP(S)/ALL/NO proxy keys are removed before the selected representation is applied.
   - Tests: explicit direct args, HTTP, HTTPS, SOCKS5, unsupported/complex, no duplicate args, all ambient keys scrubbed, gallery `proxy-env=false` on every route, simulated Registry/environment discovery cannot override, and credentials absent from diagnostics.

5. Create and stabilize `DownloadExecutionContext` in the existing runtime lifecycle.
   - Replace `resolveNetworkProxy(): string | null` plus separate diagnostics with a context resolver returning `NetworkRouteResolution`.
   - Cache one base resolution promise/context identity in the queued Job closure; reuse the exact network object across engine retry, engine fallback, and auth recovery, even when policy feedback marks a route suspect mid-Job.
   - Do not add an implicit refresh. If an implementation seam requires refresh, stop and introduce an explicit rebuild operation/context identity rather than resolving inside retry/recovery.
   - Merge existing cookie/user-data execution values without re-resolving network state.
   - Attach engine application diagnostics per attempt without mutating the base context.
   - Preserve queue, progress, cancellation, fallback, retry, and terminal event ownership in `service.ts`.
   - Add regression tests proving one Job resolves once across retry/fallback/auth recovery, policy changes do not alter the active Job context, and a new Job resolves again.

6. Route every active yt-dlp/gallery-dl execution path through the adapters.
   - Normal yt-dlp and gallery-dl download execution.
   - yt-dlp internal retries reuse one applied view.
   - Advanced-quality probe reuses the yt-dlp adapter and reports network failure consistently.
   - Leave currently uncalled metadata helpers unchanged unless making them compile requires a narrow adapter reuse; document them as deferred potential paths.

7. Unify runtime-bootstrap policy without reusing the download lifecycle.
   - Replace `manualProxyUrl` plumbing with a bootstrap-owned execution context/route input at the existing option seam.
   - Reuse `NetworkRouteService`, precedence, parser, redaction, and failure taxonomy; never pass `DownloadExecutionContext` into asset fetch or pip.
   - Record and reuse the Electron-session-applied route for managed asset fetch.
   - When environment is the selected route after system unavailability/failure, use the injected route-aware Electron fetch path; do not switch to Node global fetch.
   - Map supported pip routes deterministically; return typed unsupported diagnostics for routes pip cannot safely consume.
   - Add focused asset/pip tests for distinct bootstrap context identity/lifecycle, shared precedence behavior, manual, system, environment, direct, unsupported, `resolvedFor`, and env scrubbing.

8. Add typed network errors, diagnostics, telemetry, and redaction.
   - Add the eight required stable failure classifications and narrow evidence mapping.
   - Preserve stderr/stdout tail only as redacted evidence, including URL userinfo, proxy password, cookie and token cases.
   - Extend telemetry with optional network fields: preference, source, safe target, route/protocol, resolution status, engine, applied, reason, and failure classification.
   - Preserve existing user-facing coarse diagnostic category and terminal event behavior.

9. Remove obsolete split behavior only after all callers migrate.
   - No active engine path may consume `proxyUrl: string | null` or decide routing from ambient env.
   - No duplicated proxy args/env injection remains.
   - Existing manual policy/session helpers remain unless their responsibility is fully replaced.
   - Search every caller of changed hooks/types and confirm advanced probe/bootstrap/gallery paths are not bypasses.

10. Update contracts and public docs in the same change.
    - Amend `.trellis/spec/backend/electron-runtime-contracts/08-electron-proxy-resolution-contract-part-01.md` and its managed template/source so the old diagnostics-only rule matches the new safe-mapping contract.
    - Update relevant Chinese and English pages under `site/src/content/docs/` to explain actual manual/system/environment/direct behavior, unsupported complex/PAC results, and safe diagnostics.
    - Do not change Settings UI unless a tiny copy correction is required by the actual behavior.

11. Run the Trellis quality gate, simplify changed files, and fix all findings.
    - Verify cross-layer data flow from config/effective policy through route/context/adapter/spawn/telemetry.
    - Verify no Electron import entered framework-light runtime modules and no network policy entered `processRunner`.
    - Verify no unrelated UI, main-process decomposition, extension, or directory changes.
    - Prepare the final report with a six-row requirement-to-implementation-to-test mapping for the additional P0 invariants.

## Validation commands

Focused checks during implementation:

```text
npm test -- src/config/networkProxy.test.ts src/config/cliProxy.test.ts electron/desktopProxy.test.mts electron/networkProxyPolicy.test.mts electron/managedRuntimeBootstrap.test.mts src/electron-runtime/service.test.ts src/electron-runtime/ytDlpCommandPlan.test.ts src/electron-runtime/ytDlpDownload.test.ts src/electron-runtime/galleryDlDownload.test.ts src/electron-runtime/processRunner.test.ts
npx tsc -p tsconfig.electron.json --noEmit
```

Final checks:

```text
npm test
npm run type-check
npm run lint
npm run build
npm run docs:build
git diff --check
```

Run `npm run runtime:smoke:downloaders` when the managed downloader runtime is available locally; report a skipped smoke test honestly when it is unavailable rather than hiding it.

## Risk and rollback points

- `electron/main.mts`: only resolver/fetch composition wiring. Roll back by restoring the previous hook wiring; do not revert unrelated main changes.
- `src/electron-runtime/service.ts`: highest lifecycle risk. Land context caching separately and retain existing queue/terminal logic.
- Engine command/env construction: verify generated args/env before changing spawn callers.
- `electron/managedRuntimeBootstrap.mts`: keep asset fetch and pip paths separate so either mapping can be reverted independently.
- Error/telemetry schema additions remain optional/backward compatible for existing records.
- Persisted proxy config and Settings controls are not migrated, so rollback does not require data repair.

## Review gates

- The route logged is the route applied, or diagnostics explicitly say not applied and why.
- Every route/diagnostic records sanitized `resolvedFor` and states its entry-target scope rather than implying downstream-host equivalence.
- System single routes are applied to CLI; complex/multiple/malformed routes are not collapsed.
- The known single-candidate PAC provenance limitation is documented, not presented as solved.
- Manual fallback reasons remain observable and saved preference is preserved.
- Ambient proxy variables cannot compete with an adapter-selected route.
- yt-dlp direct is `--proxy ""`; gallery-dl direct is `--proxy ""` plus `extractor.*.proxy-env=false`.
- gallery-dl proxy routes also set `extractor.*.proxy-env=false`, so Windows Registry and environment auto-discovery cannot become a second routing authority.
- Environment variables and NO_PROXY are fully resolved for the target before Engine mapping.
- Retry, auth recovery, and fallback engine preserve one Job context unless an explicit rebuild operation is invoked.
- Asset fetch and pip use bootstrap-owned contexts while sharing the route service/policy.
- Proxy credentials, cookies and tokens do not appear in ordinary logs, telemetry, command logs, or typed error messages.
- Direct/no-proxy users retain current download behavior.
- All active yt-dlp/gallery-dl/probe/bootstrap paths use the new context at their existing seams.
- No broad UI, Electron main, extension, or directory refactor is included.
- The final report explains all six additional P0 constraints and names their corresponding tests.
