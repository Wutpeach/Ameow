# Ameow Next Windows single-job ownership contract

## 1. Scope / trigger

Applies to the separate Ameow Next Rust package (`ameow-next/src/download/` and its opt-in GPUI bridge), introduced by TRA-23 R1 Stage A. It does not replace the frozen Electron runtime contracts. R3 narrows the engine route gate according to the revised real-download acceptance criteria. Public-site closure requires fresh coordinator downloads and verification of the actual delivered path; CLI success and boundary tests alone are not product acceptance.

On 2026-10-11, web Review 83e45d14-5f87-49de-a3fd-36760c52fe5e passed the bounded R3 Stage A checkpoint, including independently reopened approved YouTube/Bilibili delivered files. This does not authorize Stage B/C or establish full product/Portable acceptance.

TRA-23 R8 Instruction `1c6cf5a5-4929-4315-9add-73c5b84a77a4` supersedes application network-retry policy and private selection/metadata/protocol coupling. Stage1 restores native recovery in the owned workspace with no application resolve/transfer deadline; bounded version/media-health probes, integrity and actual settlement remain. Stage2's neutral contracts below are implemented and independently engineering-checked on 2026-10-12; Release product verification and web Review remain separate. Historical reports remain unchanged; development verification is not product acceptance.

On 2026-10-13, product Review `356afa20-edc1-4c45-89d4-4f1984eb1162` passed R8's two-stage responsibility refactor and user-confirmed YouTube/Bilibili downloads, including MKV import/render in AE/DaVinci. R9 Instruction `3c0af70a-1267-4bed-83c7-92bbc8ae1ba8` authorizes only selective local baseline commits and Stage B task archival. Current-version native GPUI Cancel remains NOT VERIFIED and is mandatory in Stage C's real Portable package; numeric progress screenshots, HTTP429/bot refusal and intermittent health-probe/preparation timeout limitations remain. Neither archival nor engineering checks establish Stage C or overall product acceptance. Do not change container policy or restore automatic application Job retries as part of closeout.

## 2. Signatures

- `Coordinator::accept(DownloadIntent) -> Result<u64, String>`; `cancel(job: u64) -> bool`; `retry_cleanup(job: u64) -> bool`; `snapshot() -> Snapshot`.
- `DownloadIntent { url, quality: Highest|Balanced|Saver, output_dir }` is owned and frozen at acceptance.
- `Coordinator::new(DownloadServices) -> Self`; production entry: `composition::coordinator(root)`.
- `RuntimeManager::prepare(&TrustedRuntimeRequirements, &Control, observer, record) -> Result<Arc<RuntimeLease>, String>`.
- `process_supervisor::run(ProcessSpec, &Control, callback) -> Result<ProcessOutcome, String>` is background-only.
- `SettlementFacts::resources_releasable()` requires root wait, known Job-zero, both pipe readers joined and callback consumer joined. `run` also joins its owner driver before returning.

## 3. Contracts

One Stage A `Coordinator` accepts one active job; nonterminal/Held ownership returns Busy. Stage B's outer `queue::DownloadCoordinator` reuses this owner per attempt; its logical multi-job contract is [specified separately](./next-rust-queue-contract.md). Job/attempt/revision identify authority and reject stale operations. Success/Failure/Cancelled is recorded once, after actual process and owned-file cleanup barriers. Held is nonterminal and retains workspace/runtime/destination-stage ownership. Explicit retry reattempts the failed cleanup; elapsed time cannot release it.

Windows launch always uses creation-time JOB_LIST, strict HANDLE_LIST, suspended membership verification and hidden execution. No create-then-assign fallback. Owner objects survive operation and driver-thread unwind. Output readers drain independently of bounded best-effort observation delivery. Callers must reject truncated metadata/probe JSON; output chunks are not complete lines or terminal authority.

Runtime identity comes from the embedded fixed manifest and full hashes, completion marker and supervised version probes. Read-sharing-only native file guards prevent mutation/replacement during a lease. No system Python/PATH fallback, ambient plugins/config, remote EJS components or in-place runtime update. Archive acquisition resolves the Windows route for each HTTPS request/redirect. Engine execution uses the current representable static Windows route explicitly in an isolated child environment; an unrelated bypass entry does not reject an accepted public origin. An accepted-origin bypass match, PAC/auto configuration, unsupported or credential-bearing proxy, or ambiguous scheme-dependent route still fails closed. No failure-triggered direct fallback is permitted. This bounded check is not a complete Windows bypass/PAC or redirect routing implementation.

R8 removes the selected-media/CDN/fragment URL equality preflight and metadata replay. The downloader handles extraction, concrete stream requests and network recovery under the explicit accepted effective route. Do not relocate the old blanket gate into the Adapter or rebuild a route controller. Concrete unsafe observed behavior is reported; bounded static-route support does not claim every dynamic request or bypass/PAC mode is proven. Runtime acquisition routing remains a distinct shared responsibility.

Identity validation rejects playlists/indirect objects and mismatched site/ID/part. Quality chooses maximum height within unlimited/1080/480, then H264, HEVC, VP9, AV1 at equal height. In R8 the Adapter translates that product intent into pinned native selection options, attests a canonical object/P and checks actual selected and delivered neutral media facts. DELETE Rust Format-ID ranking, selected-metadata reconstruction and production load-info-json; do not carry raw engine JSON through an opaque core field. URL/title/metadata filesystem bookkeeping never determines an arbitrary output path.

Output validation holds a read-sharing-only source identity guard across pinned ffprobe, hashing and copy. DestinationStage::create/fill retains a READ/WRITE/DELETE handle with read sharing only; FileRenameInfo with ReplaceIfExists=false publishes that same verified object. The FILE_RENAME_INFO allocation passed to Windows includes an explicit trailing UTF-16 zero after the name; FileNameLength counts only the name bytes. Do not rely on allocator padding for termination: exactly aligned names produced a different on-disk name and a false reported destination in the R3 native regression. FileDispositionInfo cleanup must additionally establish actual path absence: a delete-pending reader is not completed cleanup. The stage lives outside the coordinator unwind boundary until publication or explicit cleanup succeeds.

Cancellation and publication share authority; late cancellation preserves a committed file. Foreground snapshot() clones an Arc from a separate short-held projection lock and then clones the complete authoritative snapshot outside that lock. It never waits on the publication authority mutex or fabricates Idle on contention. The background bridge command owner rejects Start after stop but continues Retry while Held; acknowledgement requires genuinely released terminal/Idle ownership.

## 4. Validation and error matrix

| Condition | Required result |
| --- | --- |
| Ambiguous ID/P or playlist metadata | Reject before transfer |
| Runtime hash/marker mismatch | Refuse affected executable; no overwrite repair |
| Unsupported effective engine route | E_NETWORK_ENGINE_ROUTE_UNSUPPORTED, no fallback |
| Unrelated valid bypass entry | Allow the representable route for the accepted origin |
| Native media selection/requests | Downloader handles under frozen effective route; no blanket media-URL equality preflight |
| Actual object/P or neutral chosen media violates product constraints | Reject validation; never publish a guessed or incomplete object |
| Root exit but live descendants/readers/consumer | Retain ownership |
| Query/control uncertainty or owner panic | Held plus explicit recovery |
| Output collision | Atomic no-replace failure/suffix retry; existing file unchanged |
| Reported successful destination | Actual file bytes, size and hash must match the verified media; an existing sentinel is not success |
| Owned partial cleanup failure | Retain exact ownership and Held; no released terminal |
| Stale/late cancel after delivery | No deletion or terminal relabeling |

## 5. Good / base / bad cases

- Good: a native tree is retained during query failure, then explicit retry proves all barriers before releasing its runtime lease.
- Base: an unsupported host route yields one truthful Failure after version probes settle, with no media success claim.
- Bad: a synthetic FFmpeg fixture is reported as a public YouTube/Bilibili download, or a Drop cleanup attempt is treated as proof of deletion.

## 6. Tests required

Use the actual Next production APIs. `tests/windows_process_supervisor.rs` and cfg(test) native fault cases prove atomic membership, descendants, strict handle exclusion, reader/consumer joins and Held recovery. `tests/download_contracts.rs` and coordinator ownership tests cover typed identity/quality, native selection, hash leases, output integrity/collision, cleanup recovery, one terminal and publication/cancel races. Use real Windows file/process operations for those boundaries. The publication regression covers sixteen filename lengths with two pre-existing collisions, unchanged sentinels, exact returned suffix path, delivered bytes/hash/size and directory contents; retain the failing pre-fix evidence. Network regressions retain accepted-origin unrelated versus matching bypass, static representability, credentials/PAC/ambiguous scheme and no fallback; old selected-fragment URL gate tests are explicitly superseded by R8, not weakened safety tests.

For genuine cache tests supply `AMEOW_RUNTIME_TEST_ROOT` pointing to a new production-prepared cache and run serially; preserve raw evidence in task-owned directories. Use `AMEOW_PROCESS_EVIDENCE_ROOT` for fresh process evidence. Build into task-specific `CARGO_TARGET_DIR`, preserving the accepted UI release executable. Native GPUI observations must establish foreground liveness and actual cancel/close behavior. Full Stage A additionally requires the exact approved public-site samples to complete through the production coordinator; fixture results do not satisfy that requirement.

### Native test helper module isolation (R10 engineering evidence; awaiting Review)

`tests/support/windows_process_fixture.rs` is included by several test modules, each with its own `OnceLock` and case counter. Its task-owned helper/evidence directory must include both the process ID and the calling module namespace. A process-only directory lets parallel modules compile/write the same helper EXE and stderr, causing compilation failures or Win32 file-not-found before the intended process behavior is exercised.

Use `module_path!().replace("::", "-")` in the per-process directory name. A module reuses its own compiled helper; another module in the same process gets a separate path. Do not hide the collision by globally serializing otherwise independent tests. Re-run the default parallel native suite and verify the actual process/file behaviors still pass; preserve the original failure. R10 recorded 4 failures before isolation and 132 passing tests afterwards, with conditional ignored tests disclosed separately. This test-only rule changes no production ownership/safety contract and does not prove native GPUI Cancel.

## 7. Wrong vs correct

```rust
// Wrong: exit/EOF/kill request alone cannot authorize resource release.
if root_exited { release_runtime_and_workspace(); }

// Correct: background run returns only after verified tree/thread barriers;
// coordinator must then settle its owned output/workspace before terminal.
let outcome = process_supervisor::run(spec, &control, observer)?;
assert!(outcome.facts.resources_releasable());
```

Do not turn this explanatory snippet into a second terminal authority: only the coordinator arbitrates delivery/cancellation and publishes the final snapshot.

Wrong: interpret a CLI exit 0 or a snapshot media hash as proof that the reported destination contains that media. Correct: verify the delivered file at that exact path and preserve existing collision files; a mismatch is a failed closure even when transfer, merge and ffprobe passed.

## R7 bounded metadata and transfer observation (2026-10-12)

### Scope and signatures
TRA-23 R7 repairs observed exit0 metadata truncation and adds optional numeric progress in the same production pipeline; development evidence still awaits web acceptance. R8 retains these behavior guarantees, with native metadata/markers/framing and engine-private stream correlation owned by the Adapter. ProcessObservation output carries per-pipe sequence before best-effort enqueue. Snapshot.transfer_progress and queue JobSnapshot.transfer_progress use Option<progress::TransferProgress> { downloaded_bytes: u64, exact_total_bytes: Option<u64>, bytes_per_second: Option<f64>, fraction: Option<f32>, observed_at_ms: u64, merging: bool }.

### Contracts and rationale
- Resolve requests a finite16 MiB complete stdout cap, aligned with the supervisor absolute ceiling; transfer keeps its prior effective4 MiB stdout and1 MiB stderr. Other calls retain their smaller requested limits. Reject resolve/probe truncation before JSON parsing. The11.1 MiB observed single-video metadata must not silently become E_UNKNOWN or justify unlimited capture.
- Bounded local diagnostics allow resolve files up to16 MiB, other files up to8 MiB, aggregate raw64 MiB. Oversized raw evidence is omitted with a finite summary; preserve the original failure. No raw metadata, URL, stderr or private path enters copied diagnostics/shared evidence.
- Reserve fixed owned working/final-object.txt with CreateNew before transfer; pinned yt-dlp appends the after_move AMEOW_FINAL JSON there. Read only after genuine process settlement and successful exit, at most4097 bytes, require length<=4096 and exactly one complete marker/JSON record. Missing/multiple/invalid/oversized records fail. A truncated transfer stdout is optional only because this independently bounded record is required; the record still undergoes unchanged identity, workspace, ffprobe, hash and no-overwrite delivery checks. A record is not Success authority.
- Structured download/PP templates carry only allowed scalar facts, with output-na-placeholder null. Per-pipe sequence gaps discard partial lines; newline framing<=2 KiB and native chunk<=24 KiB prevent corrupt gap concatenation/unbounded buffers. At most two selected streams and200 ms normal coalescing, with urgent publication for finished/Merger records; readers continue draining independently. Only valid downloading samples supply live finite nonnegative speed. Finished average rate is excluded. Only exact Merger.started/finished changes merging.
- Exact total for every identified selected stream is required for aggregate transfer fraction; approximate/fragment/contradictory/missing totals remain unknown. Speed/fraction measurements expire after2s; merging follows actual marker lifecycle and clears on phase exit. Enclosing Job/attempt/strictly newer revision and phase/cancel checks prevent stale publication. Transfer observation is optional and never replaces settlement, file ownership or unique terminal.

### Validation and error matrix
| Condition | Required outcome |
| --- | --- |
| Complete12 MiB metadata with admitted identity | Same identity/format selected; bounded evidence archive succeeds |
| Resolve beyond16 MiB / complete malformed JSON | E_METADATA_TOO_LARGE / E_METADATA_INVALID_JSON, no guessed media |
| Final transferHTTP403 / opaque nonzero exit | E_HTTP_FORBIDDEN / E_ENGINE_FAILED after genuine settlement, no application restart, unknown underlying cause |
| Transferstdout beyond4 MiB and valid settled final record | Continue independent media validation; no observation-caused failure |
| Final record missing/multiple/invalid/>4096 or reservation exists | Truthful failure; no overwrite or arbitrary record path |
| Dropped chunk / estimate-only total / finished average | Discard damaged observation / fraction unknown / no live rate |
| Late Job/attempt/revision or phase exit | No telemetry resurrection; clear prior facts |

### Cases and required tests
Good: large complete single-video metadata keeps the admitted object; actual per-stream scalar facts drive a fresh measured label. Base: no progress records still allows real media validation with a valid final record and indeterminate UI. Bad: one stream100% becomes whole-Job Success, or missing progress invalidates an otherwise settled download.

Regression evidence must include native7 MiB drain with explicit caller cap; complete12 MiB metadata and >16 MiB overflow/diagnostic omission; closed-record absence/malformed/multiple/oversize/CreateNew protection; actual pinned local two-stream templates and Merger; loss/size/numeric/privacy/exact-vs-estimated totals; Job/attempt/revision/phase/retry/cancel clearing; existing Held/lease/FIFO3/no-overwrite settlement. Separate synthetic protocol tests from ordinary GPUI public-media/Release evidence.

### Wrong versus correct
Wrong: parse a bounded prefix as complete metadata or depend on stderr/last stdout line for Success. Correct: reject truncated resolve data, require bounded settled final record, then verify identity and actual media before atomic delivery. Wrong: show a fixed speed or finished-item100%. Correct: show fresh measured speed and only trustworthy aggregate transfer fraction; keep unknown totals indeterminate.

## R8 neutral execution contract (2026-10-12)

### 1. Scope / trigger
Production lifecycle now injects services; only composition selects the concrete Adapter. Rust ranking/reduced metadata/load-info-json and selected-media route gate are deleted. Existing preparation owner, process owner, Control, settlement and Windows publication remain. Independent checks and web Review are recorded separately.

### 2. Signatures
```rust
struct DownloadServices { runtime: Arc<RuntimeManager>, adapter: Arc<dyn DownloaderAdapter>, verifiers: Arc<VerifierRegistry> }
trait DownloaderAdapter: Send + Sync {
    fn kind(&self) -> MediaKind;
    fn requirements(&self) -> &TrustedRuntimeRequirements;
    fn execute(&self, request: &ExecutionRequest, context: &ExecutionContext<'_>) -> AdapterResult;
    fn evidence_files(&self) -> &[(&str, u64)];
}
ExecutionContext::run(ManagedCommand, Option<Arc<dyn Fn(ProcessObservation) + Send + Sync>>) -> Result<ProcessOutcome, String>
VerifierRegistry::verify(&ProducedArtifact, workspace, &RuntimeLease, &Control, observer) -> Result<VerifiedMedia, String>
```

### 3. Request / result / runtime contracts
- Identity is `request::Identity { site: Site, id, title, part }`; attestation carries bounded canonical product-key aliases, never raw metadata. Preserve the entire valid 11-character YouTube ID including `_p`; private part splitting applies only to Bilibili. Canonical object/P is re-extracted and final artifact must match admission. `ExecutionRequest { accepted }` freezes product intent/settings.
- `AdapterEvent::{Resolving, Transferring, Finalizing, Progress(TransferProgress)}` has no terminal/ownership authority. Core/queue/GPUI receive no extractor/Format ID/private progress or error grammar, JSON payload or downloader retry count. Versioned observation guards remain.
- `ProducedArtifact { relative_path, identity, kind, verification }` requires nonempty normal relative components. Declared MediaKind and registered verifier agree. `VideoExpectation { height, codec: VideoCodec, requires_audio, height_cap }` is a neutral chosen-fact projection, not a candidate selector. Shared guards validate confinement/non-reparse/nonempty/hash; Video privately validates bounded pinned ffprobe height/codec/cap/audio/duration. Compiled Data test Adapter needs no video tools; production Video cannot use Data to bypass verification.
- `VerifiedMedia { path, bytes, sha256, kind, facts: VerifiedFacts, identity_guard }` has optional neutral media facts, no raw streams JSON. Original identity guard/copy/publish/cancel/no-clobber barriers remain.
- ManagedCommand uses only declared static tool keys from immutable lease and calls the original supervisor/Control. Private compiled requirements have no Deserialize/user manifest/metadata constructor; trusted catalog/hash/probe checks precede reuse. Full production manifest bytes/digest remain exact; subsets use canonical selected-set identity. Live leases cannot mix identities. Empty requirements are test-only.
- Generic child environment owns home/temp and empty PATH; trusted composition supplies Deno/Python recipes. Reject base-key override, duplicate keys and path escape. Public runtime stores lease root and generic requirements, not engine filename branches. Same single preparation owner carries the requirement set.
- Adapter owns native selection options, extractor/identity/protocol/error parsing, before_dl/final record/sidecar and private selected-stream correlation. Highest/Balanced/Saver map to native selectors with height-first existing codec preference; no Rust ranking/replay/HTTP recovery algorithm. Actual before_dl initializes progress; resolve facts never supply transfer totals. Empty observation stays unknown; nonempty records must be unique/complete/bounded and consistent with final identity/media. Sidecar remains mandatory, followed by independent media verification.
- Retained product/safety exceptions: object/P/no-playlist, cap/codec/audio/MKV policy, no-simulate for real transfer despite measurement hooks, owned output/cache, config/plugin/remote isolation, missing-fragment abort, pinned tools/no-clobber, bounded records/captures and health probes. Resolve/transfer have no application network deadline; native recovery/part/cache remain current-Job only. Exit0/records are inputs, never Success authority.

### 4. Validation and error matrix
| Condition | Required behavior |
| --- | --- |
| Changed admitted identity/P/kind/cap or missing audio | Reject delivery; safe final Failure after settlement |
| Escaping/reparse/empty/nonregular artifact | Reject; sentinel unchanged |
| Undeclared tool/invalid requirement/live lease identity mismatch | Refuse; no ambient fallback |
| Empty optional observation | Unknown progress; mandatory final sidecar/media proof remains |
| Damaged/multiple/contradictory nonempty record or final sidecar | No guessed selection/identity/completion |
| Frozen queued destination disappears | E_STORAGE, no alternate directory |
| Final engine error/unsettled/Held/owner lost | Preserve closed Failure/original conservative ownership; no automatic restart or fictitious release |

### 5. Good / base / bad cases
Good: native transfer recovers in the same slot, emits neutral progress, verified bytes publish and actual owner joins. Base: no progress, trustworthy final proof and real media validate with indeterminate UI. Bad: opaque JSON core decoding, exit0 Success, an unowned tool or Data bypass for production Video.

### 6. Tests required
Dependency guards plus actual callgraph review cover core/queue/domain/UI/output/runtime/network; exempt only explicit cfg(test) compatibility helpers, never production paths. Minimal Data lifecycle proves real delivery/hash/manual-newJob/path escape/admitted mismatch/cancel joins. Keep FIFO3/dedup/Held/owner-lost/preparation liveness/cache/file/publish safety. Pinned localhost proves combined and separate before_dl cardinality/sidecar/real MKV; preserve native audio-fixture failures. Regressions cover full YouTube ID containing `_p` and final E_STORAGE for disappearing frozen destination. Public original sample and ordinary GPUI/Release evidence remain separate from these checks.

### 7. Wrong vs correct
Wrong: relocate the old selector into Adapter and keep core/UI interpreting engine JSON. Correct: native selects; Adapter returns bounded typed identity/events/artifact; media-kind verifier and original publisher decide delivery. Wrong: all future Adapters must require yt-dlp/Deno/ffprobe. Correct: declare compiled trusted requirements and approved media-kind verification.

## R11 startup close and private packaging increment (2026-10-13; awaiting web Review)

### 1. Scope / trigger
Preserve a close request received before the first queue snapshot. Separate owner-only private validation packaging from future public distribution. These implemented contracts do not establish native Exit/Cancel or product acceptance.

### 2. Signatures
`ExitIntent::request()` records intent; `resolve(Option<&QueueSnapshot>, startup_failed: bool) -> Option<ExitAction>` classifies it. `Native::show_without_activation()` uses `SW_SHOWNOACTIVATE`. Packaging accepts `-TargetDirectory`, `-OutputDirectory`, and either `-BuildOnly` or explicit `-PackageMode private-owner-validation -LicenseReviewFile`; `public-release` is always refused.

### 3. Contracts
Unknown startup state retains intent without guessing active work or safe settlement. Startup failure or an already stopped snapshot allows Quit; idle initialized state requests the existing Stop and waits for stopped acknowledgement; unfinished/preparing/Held/lost preparation ownership requires the existing conservative confirmation. Close handling must not invoke GPUI Windows activation, which synthesizes Alt input.

Private review schema 2 binds exact HEAD, source/resource/license inventory digest, Cargo.lock, pinned runtime manifest, license-inputs.json and each notice source/destination/hash. Gate A requires actual minimum-material checks and owner-only-controlled-device use. Gate B retains blocked status and real public-release gaps. ZIP includes visible Ameow MIT, PRIVATE LOCAL VALIDATION marker, explicit reviewed materials and an exact named-member manifest. On-demand tools are recorded separately from ZIP members.

### 4. Validation / error matrix
| Input / condition | Required behavior |
| --- | --- |
| Close before first snapshot | Retain intent; reclassify after initialization |
| Initialized idle / active or uncertain owner | Safe Stop and wait / conservative confirmation |
| Missing, blocked, historical or changed private review | PRIVATE_GATE_A_BLOCKED; no ZIP |
| public-release, including BuildOnly combination | PUBLIC_GATE_B_BLOCKED before output creation |
| Existing output, input mutation, escaping/reparse material | Refuse; preserve prior output and restore environment/CWD |

### 5. Good / base / bad cases
Good: early idle close requests Stop after initialization and quits only on acknowledgement. Base: private materials are genuinely checked but public source/redistribution review stays blocked. Bad: a discarded early close, a forced process cleanup called normal Exit, or private verification treated as public clearance.

### 6. Tests required
Early-close regression tests cover idle-to-stopped, active/preparing/Held/lost owner, and startup error. Packaging verifies rejection without output, actual private ZIP extraction/member hashes, review/HEAD/input/notice mutation, and no overwrite. Real packaged first draw, foreground Downloading Cancel, safe Exit and clean non-admin first use require separate runtime evidence; unit tests cannot substitute.

### 7. Wrong vs correct
Wrong: request activation to make a programmatic close visible, or synthesize license approval to build. Correct: show without activation, preserve startup intent, and bind a truthful materials review to the actual build inputs.

## R12 startup preparation and safe diagnostics (2026-10-14; Web CONTINUE on 2026-10-15)

### Scope and interfaces
The existing queue dispatcher starts one shared preparation after initialization, independently of media admission. `QueueSnapshot.preparation: PreparationSnapshot` carries typed phase, attempt, component, stage, actual downloaded bytes, optional total, timestamp, failure and bounded history. Phases are Idle/Preparing/Downloading/Verifying/Ready/Failed; stages are Cache/Acquire/Verify/Extract/Probe/Publish. `RetryPreparation` returns `Applied(bool)`; `CopyPreparationDiagnostic` returns bounded `Diagnostic(String)`. This prepares only the currently compiled manifest, not version discovery or automatic upgrades.

### Required behavior
Preparation owns its own Control and outer worker, consumes zero media slots, and retains the verified immutable lease until safe stop. Accepted Jobs wait with frozen IDs/settings/FIFO; Ready resumes FIFO3. Failed preparation preserves waiting Jobs and requires explicit shared Retry; that retry is distinct from creating a new media Job after final Failure. No automatic retry loop. Held, lost owner, stopping or an outstanding retry refuses ordinary preparation Retry. Existing live `RetryCleanup(0)` and conservative stop barriers remain.

Valid cache requires exact marker, executable hashes, file guards and supervised local probes before the network branch. Rejected original cache is preserved; verified staging publishes a new no-replace immutable sibling. Candidate discovery is bounded to 128 root entries, so arbitrary crowded roots do not carry an unconditional zero-network guarantee. Do not delete user cache to obtain cold evidence.

Progress reports actual bytes successfully written and compiled exact totals; unknown totals remain indeterminate. Reqwest typed errors, numeric HTTP status, exact size/hash checks, archive/IO outcomes and supervised probe outcomes supply closed categories. Opaque supervisor errors remain Probe; never infer timeout/proxy causes from strings. Ready requires full validation and publication, not bytes at 100%.

### Diagnostics and shutdown limits
Snapshots/history/copy reconstruct text from closed enums, never raw errors, stderr, private paths, URLs or proxy credentials. Keep at most 96 typed events, preserving failures preferentially; manual retry retains prior failures. Atomic `preparation-history.json` persists safe events only, reads at most 65537 bytes, and restores no Jobs, Ready or ownership. Copy is capped at 4096 ASCII bytes. Preserve historical `queue-runtime-events.log`. Unwritable storage may prevent persistence while in-session failure remains.

Stop waits for actual request/process return and outer join. Blocking HTTP read/request cancellation may wait the existing 300-second timeout plus routing/settlement overhead. Never report released resources or a stopped acknowledgement just because a deadline elapsed.

### Cases and verification
Good: startup prepares once while several Jobs are admitted, failure is visible, explicit Retry resumes the same waiting Jobs in FIFO3. Base: valid cache verifies locally and succeeds with an acquisition provider that always fails. Bad: a failed component leaves an unexplained Preparing label, retries every Job, guesses a proxy cause, or restores prior ownership after restart.

Required regressions cover typed privacy/history, actual stream bytes/size/timeout/cancel, valid persistent/live cache with failed acquisition, corrupt-primary preservation and immutable sibling reuse, shared startup/failure/late admission/manual Retry/FIFO3, and owner panic/stop barriers. Actual pinned cold/warm package, native UI and ordinary non-admin tests remain separate evidence; fixtures cannot establish cross-machine repair.
