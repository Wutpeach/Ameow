# P6 Track A — Current Site / Engine Extension Model Audit

## Scope and baseline

This audit follows the accepted P0-P5 architecture and does not redesign network routing, the Download Domain, `DownloadJobService`, protocol transports, Renderer state, or Browser Extension lifecycle. Evidence was taken from current product code and the archived P1-P5 audits on 2026-08-10. No product code was changed.

Baseline invariants remain authoritative:

```text
RawDownloadInput
  -> SiteRegistry
  -> SiteProvider
  -> immutable ResolvedDownloadPlan
  -> DownloadJobService / DownloadOrchestrator
  -> EngineRegistry
  -> DownloadEngine
  -> Infrastructure adapter
```

- `prepare()` resolves the Site once.
- The exact plan and per-Job route/context objects are reused across fallback and auth recovery.
- Cookies remain attempt-specific.
- `DownloadJobService` owns ordinary lifecycle and terminal policy.

## 1. Current Site extension path

### 1.1 Minimum desktop-only Site

Adding a Site that needs only normal Desktop download planning currently requires:

| Modification point | Why | Classification |
| --- | --- | --- |
| `src/sites/<site>.ts` | implement `matches()` and `resolvePlan()` | legitimate implementation |
| `src/sites/index.ts` | explicitly register and order the provider before `genericProvider` | legitimate composition |
| `src/sites/providers.test.ts` or focused provider test | prove matching, plan, source normalization, and engine order | legitimate test |
| `src/download-capabilities/provider-migration-targets.ts` | `provider-planning.test.ts` requires every builtin provider to have a migration-ledger row | leaked historical planning obligation; unrelated to runtime correctness |

The last row means the representative Site cannot currently be added by implementation + composition alone, even if it needs no interaction, session, protocol, or UI work.

### 1.2 Strategy-backed Site

Several providers obtain engine order through `getRuntimeManualSiteStrategy()` and `buildEnginePlansFromStrategy*()`. For those Sites the current path additionally requires:

| Modification point | Why | Classification |
| --- | --- | --- |
| `src/download-capabilities/runtime-site-strategies.ts` | runtime engine order and host hints | legitimate shared policy registry, but separate from provider ownership |
| `src/assets/capabilities-manual.json` | the bundled capability registry must mirror the TypeScript strategy | duplicated source of truth |
| `src/download-capabilities/runtime-site-strategies.test.ts` / `provider-alignment.test.ts` | assert the two copies and selected plans stay aligned | regression tests for the duplication |

Not every current provider uses this path: Bilibili, Twitter/X, and `gallery-dl-supported` build engine plans inline. Therefore this registry is an optional planning mechanism, not the universal `SiteProvider` contract. P6 must not turn it into a plugin platform or force every provider through it.

### 1.3 Site hint and interaction recognition

When the new Site must be recognized by shared protocol/interaction code, more locations learn its name:

| Modification point | Current pressure |
| --- | --- |
| `src/core/site-hints.ts` | closed `KnownSiteHint` union, alias switch, and URL detection chain |
| `src/download-capabilities/runtime-interaction-capabilities.ts` | closed manual interaction list; `getRuntimeManualInteractionCapability()` throws when an otherwise known Site has no entry |
| `src/protocol/download/ipcMappers.ts` | calls the interaction capability diagnostic during command decode, so the missing entry can reject an otherwise valid new Site |
| `browser-extension/background.js` | duplicates alias normalization, URL detection, and a pasted-resolution allowlist |

This is a blocker for a genuinely first-class Site: protocol decoding and the generic Extension transport can require unrelated edits solely to accept its name. An unknown Site already has enough information to be matched by a provider, so shared transport should preserve a normalized opaque hint or safely fall back to generic behavior instead of requiring universal enumeration.

### 1.4 Conditional, feature-owned Site work

These are not mandatory for every new Site and must remain conditional:

| Feature requested | Legitimate owner and modification points |
| --- | --- |
| Browser page discovery/button/capture | Site detector/parser, `browser-extension/manifest.json`, feature tests; generic Desktop transport should not gain Site policy |
| Extension-assisted pasted resolution | Extension resolver eligibility/policy and tests; not core orchestration |
| Auth/session sync | Desktop `SITE_SESSION_CONFIGS` or dynamic session registry metadata; Extension should consume the Desktop-pushed registry, with the local fallback allowlist treated as compatibility debt |
| Known icon or localized Site label | Renderer/Extension icon and locale assets only when a dedicated presentation is required |
| Advanced-quality UI | Site plan capability plus the dedicated probe flow; not every Site |

The Browser Extension's Weibo variant grouping in `popup.js` is legitimate Site-specific presentation/application behavior for that feature. It is not a reason for generic Extension transport or the Desktop protocol to know every Site name.

## 2. Site branching and coupling map

### Legitimate composition/registry decisions

- `src/sites/index.ts`: explicit provider registration and precedence, with `genericProvider` last.
- `src/sites/site-registry.ts`: ordered first-match resolution with no Site-name branches.
- Provider-local matching, source canonicalization, capture evidence interpretation, intent construction, engine candidate order, and per-plan fallback conditions.
- `src/site-sessions.ts` and the Desktop-pushed session registry when a Site explicitly supports login/session capture.
- Browser Extension detector/manifest branches when a Site has a dedicated browser feature.
- `src/electron-runtime/engineManifest.ts` YouTube-specific yt-dlp execution profiles: these are concrete adapter/CLI execution facts, not application-wide Site selection policy.

### Leaked Site policy

1. `src/orchestration/download-orchestrator.ts` special-cases `providerId === "weibo"` to decorate selected-variant errors. Generic fallback execution therefore knows a concrete Site name. The same behavior can be derived from `intent.selectedVideoVariant` without naming Weibo.
2. `src/electron-runtime/service.ts` owns `ADVANCED_QUALITY_SUPPORTED_SITE_IDS = {youtube,bilibili}` even though providers already express `{ advancedQuality: true }` on plans. A new capable Site must edit generic runtime code.
3. `src/electron-runtime/service.ts` derives a YouTube telemetry profile from `intent.siteId`; telemetry should observe the selected engine/profile output, not re-decide Site execution policy.
4. `src/core/site-hints.ts`, `runtime-interaction-capabilities.ts`, and `browser-extension/background.js` duplicate the same Site-name recognition pressure.
5. `provider-migration-targets.ts` is a historical migration/report ledger but its test makes it a mandatory runtime-provider extension point.

### Not classified as leakage

- Provider-local `siteHint === <id>` checks are identification evidence inside the owner of that Site.
- Provider-local engine plans are Site policy: a Site knows what content/source constraints mean and may nominate candidate engines.
- Engine-specific handling of a Site inside a concrete CLI adapter is allowed only when it is an execution fact of that engine (for example a yt-dlp extractor profile), not a global fallback or UI decision.

## 3. `SiteProvider` contract assessment

Current contract:

```ts
interface SiteProvider {
  readonly id: string;
  matches(input: RawDownloadInput): boolean;
  resolvePlan(input: RawDownloadInput): ResolvedDownloadPlan | null;
}
```

Ownership is already sufficient:

| Concern | Current/target owner |
| --- | --- |
| Site identification | `SiteProvider.matches()`; shared hint values are evidence, not authority |
| Site resolution and canonical source | `SiteProvider.resolvePlan()` and provider-local helpers |
| Content meaning and constraints | resolved intent and plan requirements |
| Capture evidence interpretation | provider-local code over canonical `captureEvidence` |
| Engine candidate preference/priority | `ResolvedDownloadPlan.engines`, optionally built from an explicit strategy registry |
| Auth/session requirement | Site-session application/composition policy keyed by resolved `intent.siteId`; raw cookies never belong in the provider contract |
| Fallback conditions | provider declares per-engine conditions in the plan; Application executes fallback |
| Auth recovery and terminal policy | `DownloadJobService`, not the provider |

**SiteProvider contract: NO CHANGE REQUIRED.**

Do not add CLI args, session material, logger hooks, telemetry hooks, fallback execution, or UI metadata to this interface. Remove leaked consumers around it instead.

## 4. Current Engine extension path

### 4.1 Mandatory current modification inventory

Adding a third managed Engine currently crosses these locations:

| Area | Concrete modification points | Why |
| --- | --- | --- |
| Domain identity/plan | `src/core/types/engine-plan.ts`, `src/core/schemas/engine-plan-schema.ts` | closed `EngineId` union and Zod enum |
| Engine port/registry | new adapter/runner plus `src/engines/engine-registry.ts` tests | implementation and composition are legitimate; registry itself is already name-agnostic after typing |
| Capability package | `src/download-capabilities/types.ts`, `schema.ts`, seed/manual JSON and tests | duplicate closed `CapabilityEngineId` and schemas |
| Telemetry | `src/download-capabilities/telemetry.ts` | `engineChain`/`chosenEngine` reuse the closed capability schema |
| Runtime paths/status | `src/core/types/runtime-binaries.ts`, `src/electron-runtime/runtimePaths.ts`, `src/types/runtimeDependencies.ts`, associated tests | fixed physical fields for yt-dlp/gallery-dl and fixed dependency status/components |
| Runtime package/bootstrap | `electron/managedPythonPackageManifest.mts`, `managedRuntimeBootstrap.mts`, dependency gate/version helpers when applicable | legitimate only for a managed Python package engine, but spread across switches/types |
| Engine manifest/command plan | `src/electron-runtime/engineManifest.ts` and a concrete runner/plan | legitimate engine infrastructure |
| Composition | `electron/main.mts` adapter registration | legitimate composition-time registration |
| Readiness/network policy | `electron/main.mts` `ensureEngineRuntimeReady`, network consumer and failure-layer ternaries; `src/config/networkRoute.ts` `NetworkConsumer` | current unknown-engine defaults silently behave as yt-dlp, so a new engine needs unrelated branch edits to be correct |
| Tests/smoke | adapter, registry, contract, packaging/runtime smoke | legitimate validation |

Renderer and Browser Extension protocols do not expose an Engine union today; they should remain unchanged for an ordinary new Engine.

### 4.2 Closed identity is a real blocker

`EngineId = "yt-dlp" | "gallery-dl"` is not just helpful exhaustiveness. It prevents a representative fake Engine from being registered in a test without editing Domain, schemas, capability data, and telemetry. This satisfies the P6 blocker threshold.

Target behavior is an open, validated non-blank Engine identifier at Domain/Application boundaries, with existence decided by `EngineRegistry`. Concrete managed-runtime support remains explicit at composition; an unknown runtime binding must fail as `engine-unavailable`, never fall through to yt-dlp defaults.

### 4.3 `RuntimeBinaryPaths` is a real extension blocker

`RuntimeBinaryPaths` physically owns `ytDlp`, `galleryDl`, `ffmpeg`, `ffprobe`, and `deno` in one core type. Every concrete adapter receives the entire object even though its engine executable is adapter-specific. Adding any Engine therefore modifies a central cross-engine shape.

P6A should remove engine-specific executable ownership from this global Domain type. Adapters should receive their own construction dependencies; shared media tools may remain a small shared infrastructure value where they are genuinely consumed. This is not a runtime discovery system.

### 4.4 Probe ownership and capability pressure

There are two different capability mechanisms:

1. `DownloadEngine.capabilities` currently contains only `advancedQuality` and is consumed by `EngineRegistry.isEligible()`.
2. `src/download-capabilities/**` is a broader Site/interaction/upstream capability seed and strategy registry with its own closed Engine ID.

Only `advancedQuality` creates current engine-selection pressure. No evidence requires `supportsVideo`, `supportsGallery`, `supportsCookies`, `supportsCaptureEvidence`, or `supportsNetworkRoute(...)` fields. Do not add them.

The existing `advancedQuality` claim is internally inconsistent:

- providers declare the requirement;
- registry eligibility reads it;
- generic runtime still hardcodes YouTube/Bilibili and searches specifically for `yt-dlp`;
- the probe calls `runAdvancedQualityProbe()` directly rather than a `DownloadEngine` capability.

Therefore a new Engine cannot satisfy the advertised capability contract. P6A must make this honest, but should choose the smallest route: either keep advanced-quality probing as an explicitly composed yt-dlp feature and stop presenting it as a generic Engine extension point, or introduce a separate small probe port only if Lead requires a second probe implementation. A generalized CapabilityRegistry is not justified.

## 5. Engine selection ownership

| Decision | Current/target owner |
| --- | --- |
| Which Engines are candidates for a Site/source | `SiteProvider` in `ResolvedDownloadPlan.engines` |
| Candidate priority | plan priority / order, optionally from explicit strategy data |
| Static requirement eligibility | `EngineRegistry` against the minimal requirements declared by the plan |
| Runtime support of one candidate | `DownloadEngine.supports()` |
| Build and execute one attempt | Application builds context; Engine adapter executes |
| Whether an error permits the next candidate | Application `DownloadOrchestrator` using typed classification and plan fallback conditions |
| Global auth recovery/retry and terminal outcome | `DownloadJobService` |
| Raw stderr/exit/network fact classification | concrete Infrastructure adapter |

Adapters must never select the global fallback Engine. Site providers nominate candidates but do not execute fallback.

## 6. Site / Engine boundary findings

Target semantic rule remains:

```text
Site knows WHAT the content/source means.
Engine knows HOW one declared attempt is executed.
```

Positive findings:

- providers produce transport-neutral plans and do not import Electron or concrete adapters;
- adapters receive plans and do not import provider modules;
- process error classification stays in Infrastructure;
- Application fallback consumes typed classifications.

Boundary problems:

- generic Orchestrator contains Weibo policy (P6A blocker);
- generic runtime contains Site-name advanced-quality policy (P6A blocker);
- `gallery-dl-supported` and manual strategy/capability data duplicate engine policy across provider and registry, but this is a consistency/deletion decision, not a reason for a unified framework;
- no provider currently emits CLI args or process environment directly, so there is no Site-to-CLI blocker.

## 7. Existing debt classification

| Debt | P6 classification | Reason |
| --- | --- | --- |
| `RawDownloadInput` physical ownership | Follow-up debt | P3 left compatibility/internal ownership residue, but adding a Site or diagnostic observer does not require moving it |
| `RuntimeBinaryPaths` physical ownership | **Required for P6A** | fixed engine-specific fields make every new Engine edit a shared central type |
| Probe ownership | **Required for P6A clarification** | advertised `advancedQuality` eligibility cannot be implemented by a new Engine; choose honest narrow ownership, not a generalized probe platform |
| `service.ts` queue/transcode/telemetry/output co-location | Follow-up debt | P6 can add narrow hooks and remove name branches without splitting the facade |
| `main.mts @ts-nocheck` | Follow-up debt | raises composition risk but P6 contracts can be covered by typed helper/tests without rewriting Main |
| closed `EngineId` | **Required for P6A** | blocks fake Engine and forces Domain/schema/telemetry edits |
| provider migration ledger mandatory coverage | **Required for P6A removal/decoupling** | makes every new Site edit historical planning/report data |

## 8. Findings classification

### P6A blockers

1. Closed Engine identities and duplicate capability schemas prevent representative Engine registration without cross-layer edits.
2. Global `RuntimeBinaryPaths` and runtime status/readiness switches force unrelated physical edits for a new Engine.
3. Unknown Engine composition falls through yt-dlp-oriented readiness/network branches instead of failing explicitly.
4. Weibo selected-variant error policy leaks into the generic Orchestrator.
5. Advanced-quality capability is declared generically but executed through hardcoded Site and Engine branches.
6. Known Site hint + interaction diagnostic lists can make protocol decoding reject a new first-class Site.
7. Historical provider migration metadata is mandatory for every builtin provider.

### Follow-up debt

- dynamic upstream capability probing for all gallery-dl/yt-dlp Sites;
- plugin SDK, dynamic modules, marketplace, or third-party manifests;
- full cleanup or deletion of the broad `src/download-capabilities` package;
- browser-extension Site framework or cross-browser abstraction;
- site-session catalog/platform redesign;
- `main.mts` typing and full `service.ts` decomposition.

### Optional cleanup

- rename registries/loaders and move files;
- consolidate provider label builders or URL helpers;
- normalize every provider to one engine-plan helper;
- reduce harmless provider-local switches;
- icon and locale naming alignment.

## 9. Minimal target extension model

```text
Raw Download Intent
  -> explicit SiteRegistry
  -> small existing SiteProvider (unchanged)
  -> immutable ResolvedDownloadPlan
       providerId + siteId + ordered Engine plans + proven requirements
  -> Application selection/fallback
  -> open EngineRegistry lookup
  -> DownloadEngine<TExecutionContext>
  -> explicitly composed Infrastructure adapter
```

Minimum rules:

- New desktop Site: implementation + one explicit registration + tests. Optional browser/session/presentation features add only their owning files.
- New Engine: open identity + adapter implementation + explicit composition/runtime binding + tests. Domain, protocol, Renderer, and Extension do not enumerate its name.
- Registry existence, not a closed union, validates Engine availability.
- Keep only `advancedQuality` pressure or narrow it further; add no speculative capability fields.
- Do not add dynamic discovery, DI, a plugin manifest, or `registerEverything(plugin)`.

## 10. Guard and extension-test recommendations

Use the existing `src/architecture/import-guard.test.ts` infrastructure:

- keep `src/sites` and Application free of Electron and concrete engine adapters;
- forbid Engine adapter/runner imports from `src/sites` or Renderer/protocol modules;
- keep Application diagnostic/selection modules free of Electron/Renderer imports;
- preserve the existing `DownloadEngine<TExecutionContext>` variance assertions.

Add architecture regression fixtures:

1. Register a fake Site with an opaque new Site ID, resolve a stable plan, and prove no core hint/interaction/protocol/UI enumeration is required.
2. Register a fake Engine with an opaque new Engine ID, select/execute it through registry/orchestrator, and prove no `EngineId`/telemetry/schema edit is required.
3. Prove unknown/default Site falls through to generic behavior.
4. Prove capability rejection is structured and fallback policy stays in Application.
5. Prove Site code cannot import a concrete adapter and an adapter cannot import Site policy.

These fixtures are compile/runtime architecture tests, not a plugin framework.
