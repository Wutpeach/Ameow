# Bug Analysis: Lab ready before its UI is usable

## 1. Root Cause Category

- **E — Implicit Assumption:** a development watcher rooted at the repository was assumed cheap. Nested checkouts, runtime outputs and task evidence grew the irrelevant native watcher footprint; the server announced ready while registration still delayed serving work.
- **B — Cross-process Contract:** ordinary Vite and Lab initially shared one optimizer directory. A single Lab-specific directory still left two Lab writers sharing it.
- **D — Test Coverage Gap:** ready/HTML-only checks did not establish an interactive preview, concurrent writes or safe child-process cleanup.

## 2. Why Earlier Attempts Did Not Complete the Fix

1. Lab-only cache/entry/opener corrected ordinary-vs-Lab cache ownership and navigation intent, but did not address watcher setup. Two Lab writers still reproduced a real EPERM.
2. Port-scoped caches removed the supported distinct-port collision, but cold/warm waits persisted. Late asynchronous transform spans were insufficient evidence of CPU-bound compilation.
3. Early measurement controls were incomplete: cache location outside node_modules changed plugin exclusions, HTML timing was mislabeled, and child-process cleanup missed npm descendants. Independent checks corrected these without rewriting historical evidence.
4. The representative CPU profile implicated native watcher startup (about 85% of sampled elapsed time). Its missing ELU telemetry and overlapping checks limited attribution; it was a lead, not a clean speedup measurement.
5. Bounded registration samples identified irrelevant roots. The matched final comparison changed only watcher exclusions: navigation-to-visible 28.851 s to 1.138 s, warm 22.728/17.875 s to 0.209/0.076 s. Independent review accepted the evidence with single-run/Windows/layout-observation limits.

## 3. Prevention Mechanisms

| Priority | Mechanism | Action | Status |
| --- | --- | --- | --- |
| P0 | Cache ownership | Stable configured-port children for supported loopback/strict positive-port callers; actual overlapping optimization test | Implemented and checked |
| P0 | Watch boundary | Exclude only evidenced non-input roots; retain active source/assets/config and prove source HMR | Implemented and checked |
| P0 | Runtime acceptance | Separate ready, HTML, visible preview and interaction; include cached refresh, restart reuse and concurrency | Retained runnable checks/evidence |
| P0 | Process/filesystem ownership | External deadlines for blocked probes; await exact owned processes; validate absent owned cache paths before cleanup | Implemented and checked |
| P1 | Knowledge capture | Existing frontend Lab contract records native configuration and verification boundaries | Spec update completed and reviewed; commit pending |

## 4. Systematic Expansion

- Ordinary development can have the same broad-watch cost; its separate performance was not fixed or claimed here. The final mixed test proves Lab remains responsive while ordinary work is active.
- No new watcher framework, dependency exclusion, renderer refactor or polling workaround is justified by these results.
- Prefer one discriminating profile over repeated whole-matrix experiments. A function's elapsed async span is not CPU cost. Use representative cache locations and avoid running static checks alongside performance measurements.
- Do not demand a complete watcher-ready inventory from a blocked watcher. Incremental path snapshots and a parent-enforced timeout give useful bounded evidence.

## 5. Knowledge Capture

- Runtime result and source identities: `evidence/watcher-implementation-report.md` and `evidence/final-check-report.md`.
- Root-cause contract belongs in the existing frontend Lab spec; no separate generalized guide or application monitoring system is needed.
- Historical failed probes and raw evidence stay local and are not relabeled as successful runs. Source and spec commits remain pending the Phase 3.4 confirmation.
