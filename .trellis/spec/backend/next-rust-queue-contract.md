# Ameow Next queue and GPUI contract

## 1. Scope / trigger

TRA-23 R4 adds the production multi-job boundary in the separate Rust/GPUI Next package. R8 product Review `356afa20-edc1-4c45-89d4-4f1984eb1162` on 2026-10-13 passes the refactor and user-confirmed core downloads; R9 authorizes selective local baseline closure and archival only. Historical repair reports remain evidence, not separate full-matrix PASS claims. Current-version native GPUI Cancel remains NOT VERIFIED and mandatory for Stage C's actual Portable package; numeric progress screenshots, HTTP429/bot refusal and intermittent health-probe/preparation timeouts remain recorded. Stage C and overall TRA-23 acceptance are pending. Stage A ownership remains governed by [the single-job contract](./next-rust-download-contract.md). An outer `queue::DownloadCoordinator` owns logical Jobs and reuses the Stage A `Coordinator` privately for each attempt. Do not introduce a second engine or publish attempt terminal states as logical terminal states.

TRA-23 R8 Instruction `1c6cf5a5-4929-4315-9add-73c5b84a77a4` supersedes the application retry budget and requeue rules. Stage1 implementation removes those rules; Stage2 neutral adapter migration is implemented and independently engineering-checked on 2026-10-12. Release product verification and web Review remain separate. These implementation contracts do not constitute product acceptance.

R8 production constructors inject DownloadServices and freeze one Adapter/requirement set for the queue lifetime; only composition selects the concrete engine. Admission uses bounded neutral IdentityAttestation and snapshots contain neutral identity/progress/delivered facts. One existing preparation owner prepares declared requirements, retaining liveness/panic/join/owner-lost behavior. See the [neutral execution contract](./next-rust-download-contract.md) for port, verifier and runtime validation.

## 2. Signatures

```rust
DownloadCoordinator::new(services: DownloadServices, settings_path: PathBuf, defaults: Settings) -> Result<Self, String>
composition::download_coordinator(root: PathBuf, settings_path: PathBuf, defaults: Settings) -> Result<DownloadCoordinator, String>
snapshot(&self) -> QueueSnapshot
submit(&self, url: String) -> Result<u64, String>
save_settings(&self, settings: Settings) -> Result<Settings, String>
cancel(&self, job: u64) -> bool
retry(&self, failed_job: u64) -> Result<u64, String>
retry_cleanup(&self, job: u64) -> bool
stop(&self)
diagnostic(&self, job: u64) -> Result<String, String>
apply(&self, command: QueueCommand) -> CommandReply
```

`queue::run_commands` consumes an ordered command receiver and publishes replies from a background owner. Filesystem, runtime preparation and clipboard path selection must not block GPUI's foreground.

## 3. Contracts

- `Settings { quality: Highest|Balanced|Saver, output_dir: PathBuf }`: absent persisted settings use defaults (first-run Balanced); invalid/unreadable settings fail truthfully. Persist atomically in the same directory before publishing an acknowledgement. Submit/save/retry share ordering. Accepted identity intent, quality and output directory are immutable for that Job.
- `QueueCommand`: `Submit { url }`, `SaveSettings(Settings)`, `Cancel(id)`, `Retry(id)`, `RetryCleanup(id)`, `Stop`, `CopyDiagnostic(id)`. Replies: `Accepted(id)`, `SettingsSaved(Settings)`, `Applied(bool)`, `Stopping`, `Diagnostic(String)`, `Error(String)`.
- `QueueSnapshot`: `revision`, acceptance-ordered `jobs`, `settings`, `unfinished`, `failures`, `active_slots`, `preparing`, `preparation_held`, `preparation_owner_lost: bool`, `stopping`, `stopped`, `main_job`. `JobSnapshot` includes logical `job_id`, `revision`, internal `attempt` (0 pending, 1 started; generation for stale-message isolation), phase, accepted intent, verified identity, safe title/message/failure, local delivered file, `slot_owned`, `resources_released`, `start_order`, `terminal_count`, bounded timestamped events. No retry countdown or visible Attempts budget. Delivered paths and accepted directories are local fields; they must never enter copied diagnostics or uploaded raw snapshots.
- Maximum three owned execution slots. Shared preparation owns a separate Control and no media slot. Held keeps its slot/lease. Release requires process/file settlement **and the execution owner thread's actual join**. Downloader internal recovery retains the same Job and slot. Final failure releases only after those barriers, then the next ready FIFO Job may start. Each logical Job publishes exactly one terminal.
- Ameow does not restart a final-failed downloader, assign network retry counts, backoff, deadlines or requeue. The pinned downloader uses native retry defaults; no replacement fixed or infinite policy. Missing necessary fragments still abort as an integrity exception. Native part/cache/current-execution recovery is allowed only in the Job-owned workspace; no cross-Job or cross-start continuation/history. Network stderr observations and internal retry counts never schedule Jobs.
- Admission normalizes known YouTube identities and keeps Bilibili part intent explicit. Metadata proves BV/av/short-link equivalence before transfer. Unspecified P and explicit P1 are not provisionally assumed equivalent. Ambiguous/multiple objects fail safely. Downloader internal recovery remains one Job; explicit Failure retry creates a **new** Job using the old frozen object/quality/directory, while retaining the old Failure. An unresolved failed short link cannot silently retarget during retry.
- `stop` closes admission, withdraws pending work, cancels preparation and executions; `stopped` is true only after all owners release. `RetryCleanup(0)` addresses a **live** shared preparation Held owner even when no Job 0 exists and remains usable while stopping. Gate retry against owner liveness, not merely an observer Held bit; clear liveness during normal completion and unwind so stale Held cannot acknowledge a nonexistent recipient. Timeouts cannot manufacture settlement. Queue/history is session-only and never restored on restart.
- R6 outer preparation unexpected unwind sets `preparation_owner_lost`, not live Held. The lifetime guard detects panic and publishes owner loss under the same model lock used by commands **before** clearing its live-recipient signal; the later consumed `JoinHandle::join() == Err` applies that state idempotently. Otherwise cancel/stop/admission can race between guard drop and dispatch join and manufacture a released terminal. Neither detection supplies SettlementFacts; unwound guards are not proof of physical retention or cleanup. Keep affected pending Jobs nonterminal with `resources_released=false`; do not restart preparation or acknowledge stopped. Shared cleanup returns false and new submission returns `E_RUNTIME_OWNER_LOST` with no new Job. GPUI says cleanup is unconfirmed, offers no phantom shared retry, and preserves independent live attempt cleanup actions. This is a diagnosable conservative block, not a recovered runtime/cache. Thread spawn failure is a separate safe pre-owner boundary because the closure never ran.
- GPUI consumes real snapshots. Main ring selects the earliest currently executing Job by start ticket and resets continuity on selected Job, attempt or phase change. `Snapshot` and `JobSnapshot` carry optional `transfer_progress: Option<progress::TransferProgress>` with downloaded bytes, optional exact total, optional live byte/s and fraction, observation timestamp and a merging flag. Only matching Job/attempt and strictly newer attempt revisions project; cancellation, stopping, retry, Held, phase exit and terminal clear these facts. R7 displays a fresh measured rate for at most two seconds and optional whole-transfer fraction only with exact totals for all positively identified selected streams. Unknown/estimated/fragment totals remain indeterminate. Preterminal UI fraction is capped below 1; media validation and safe delivery still decide Success. Only the actual `Merger` postprocessor marker gives the merging label; merge/remux remains download blue. Success/Cancelled leave the operable list; Failure remains through the session and beyond the five-second visual feedback.
- Badge geometry follows the selected Penpot source: 42x28 capsule, 8px dots offset by 3px (5px overlap), one 12px number. Ordinary unfinished-only Badge appears at 2+; any final Failure keeps a red entry at 1+. Per the user's 2026-10-11 correction, **the single number counts unfinished plus Failure rows** (5 unfinished + 1 Failure = 6), with backend counts still independent. No Badge glow; preserve the existing ring glow. Clicking opens the scroll queue in the same Full window.
- Copy is explicit per final Failure and uses a closed whitelist: app/platform, Job correlation, safe site, component version summaries and at most six stable failure summaries, total 4096 ASCII characters. The six-entry limit is an input bound, not a retry policy. Never include Attempts budget, evidence stderr, title, URL path/query, credentials or private absolute paths. Show copied feedback only after successful OS clipboard ownership/write.
- Full/Compact and tray hide/restore are presentation actions. Actual exit defaults to Continue when work remains; Stop and Exit awaits backend `stopped`. Held permits return/explicit cleanup retry rather than forced release.

## 4. Validation and error matrix

| Condition | Observable result |
| --- | --- |
| Known unfinished media repeated under another URL/default setting | `E_DUPLICATE`, no new Job or altered old intent |
| Metadata cannot prove a unique object/part | `E_IDENTITY`, no guessed transfer |
| Settings staging/replace or directory validation fails | `E_SETTINGS_SAVE`, prior acknowledged defaults remain |
| Settings absent / corrupt / unreadable | Defaults / `E_SETTINGS_READ` / `E_SETTINGS_READ` |
| Queued output directory disappears | Truthful storage Failure; no alternate directory |
| Downloader internally recovering from timeout/reset/HTTP errors | Same Job and slot until execution and owners settle |
| Final HTTP 429 | `E_RATE_LIMIT`, one Failure after settlement; no application requeue or guessed header |
| Final permission/authentication/unavailable/storage/cancel | One truthful terminal after settlement |
| Final HTTP 403 | `E_HTTP_FORBIDDEN`, underlying reason unconfirmed; no proxy/authentication inference or application restart |
| Nonzero engine exit with no verified cause | `E_ENGINE_FAILED`, preserve actual stage without speculative cause or application restart |
| Resolve stdout exceeds finite complete capture / complete invalid JSON | `E_METADATA_TOO_LARGE` / `E_METADATA_INVALID_JSON`; no parse of a truncated prefix |
| Progress lost, malformed, stale or total uncertain | No lifecycle failure; phase-only label/indeterminate fraction as appropriate |
| Retry on non-Failure / unknown ID / unresolved failed short-link | `E_RETRY`, no terminal resurrection or changed target |
| Copy on non-Failure / unknown ID | `E_DIAGNOSTIC`, no clipboard write |
| Three Held/active owners | Fourth Job stays queued until a proven release |
| Late observation/cancel after terminal | No terminal/progress resurrection or delivered-file deletion |
| Stop with uncertain ownership | Remain stopping/Held; do not quit as if settled |
| Preparation outer join Err | `preparation_owner_lost=true`; pending nonterminal/unreleased; no stopped acknowledgement or new preparation |
| Shared cleanup with stale Held or owner lost | `Applied(false)`; no cleanup epoch advance or false release |
| Submit after preparation owner loss | `E_RUNTIME_OWNER_LOST`; no new Job |

## 5. Good / base / bad cases

- Good: five accepted Jobs start 1,2,3; Job 2 joins after final Failure; Job 4 fills that slot. Native recovery holds its existing slot and does not requeue. An explicit retry after final Failure adds a new ID with the old frozen settings.
- Base: one active Job has no ordinary Badge; one Failure has red Badge 1; five unfinished plus one Failure use the overlapping dots and total 6.
- Bad: changing a default mutates queued intent, retry resets terminal state, a CLI exit releases an unjoined slot, or copied text includes a signed media URL.
- Good: live shared preparation Held accepts cleanup and waits for native settlement plus outer join. Bad: outer preparation panic is described as physically retained resources or offers a retry that only increments an unobserved Control epoch.

## 6. Tests required

Use lowest-layer deterministic tests for FIFO/refill after actual owner join, exact terminal, native recovery retaining the same Job/slot, final Failure without requeue, cancel, frozen settings and Failed new-Job retry. Assert user-visible outcomes, not private call counts. Exercise real Windows preparation/execution Held, cleanup retry and stop barriers; continue affected process/file regressions. Use attacker-supplied diagnostics fields/URLs/paths and verify only whitelist text survives. Preserve the R8 regression predecessor showing RetryWaiting/Attempts before removal.

R6 regression: test-only started-closure panic must refuse shared retry/new admission and preserve unresolved nonterminal/stop behavior. Hold dispatch before join after the real outer unwind: cleanup/cancel/new admission must refuse, and stop must not publish terminal/released state for affected pending records. Contrast with a real Windows process supervised by the same shared outer owner/control: retry is accepted only live and stopped waits for true SettlementFacts and the outer join. Keep pre-fix failure evidence. A supervisor returning `Err` can still publish real `Settled` facts; observe those facts rather than infer settlement from `Ok`, root exit, or a timeout. This contrast is not proof of a pinned RuntimeManager probe or a GPUI Held screenshot.

Run a fresh public-site production queue with at least five different explicit objects plus an active duplicate. Preserve original snapshots/attempt bundles locally, derive safe event timelines, and independently reopen actual delivered files for hash/ffprobe and sentinel integrity. Fixtures and snapshot hashes alone cannot prove a public download.

Native GPUI evidence must cover paste, default persistence, 0/1/2/5 and Failure/mixed Badge cases, same-window scroll/actions, clipboard, five-second failure reachability, Full/Compact, active tray continuation, and default-safe/stop exit with no remaining task-owned process. Capture the actual application window; invalid desktop/blank screenshots are not evidence. Use task-owned `CARGO_TARGET_DIR`, `AMEOW_RUNTIME_TEST_ROOT` and `AMEOW_PROCESS_EVIDENCE_ROOT`; retain the accepted release EXE.

## 7. Wrong vs correct

```rust
// Wrong: an attempt failure is not necessarily the logical Job terminal.
on_engine_exit(|_| ui.mark_failed(job_id));
// Correct: use the outer authority's versioned snapshot and one final terminal.
let snapshot = queue.snapshot();
```

Wrong: parse stderr into an application retry delay, restart a final-failed engine or release a Held slot after an arbitrary timeout. Correct: let the downloader recover within its execution, retain uncertainty, and publish final Failure/release only after actual process/file/owner joins. Only explicit user Retry creates a new Job.

Wrong: treat preparation join Err as live Held and report successful `RetryCleanup(0)` without a recipient. Correct: publish `preparation_owner_lost`, refuse that retry/new admission, keep stop unresolved, and describe cleanup as unconfirmed without claiming unwound guards remain physically owned.

## R12 shared preparation and Full indicator increment (2026-10-14; Web CONTINUE on 2026-10-15)

`QueueSnapshot.preparation` and `QueueCommand::{RetryPreparation, CopyPreparationDiagnostic}` project the typed contract in `next-rust-download-contract.md`. Startup begins shared preparation without media Jobs; preparation is excluded from media slots, Badge counts and media transfer progress. Failed waiting Jobs remain nonterminal and cancellable, preserving their original acceptance/settings. Their actual GPUI queue/live labels distinguish failed preparation (component/stage/category, waiting for shared Retry), live Held and owner loss. Never replace those states with an undifferentiated Preparing label.

Full alone mounts the 24px lower-left component indicator. Hover opens the continuous-hitbox compact panel using current Palette/Penpot tokens. Actual known bytes permit progress; unknown is indeterminate. Ready visibility uses the stable backend timestamp and ends after 1800ms; repeated snapshot polling cannot prolong it. Failed remains discoverable with safe cause, explicit Retry and Copy. Ordinary Retry is disabled during Held/lost/stopping. Compact adds no permanent button. Existing media ring/glow, Badge, morph and R11 ExitIntent remain independent.

Regression tests cover stable Ready expiry, Full/Compact visibility, failed/held/lost labels, retry transition and independent media execution. Native evidence must additionally inspect Light/Night, hover continuity, Ready disappearance, failed waiting rows and the close-queue-to-lower-left-Retry route. Only an actual owned foreground GPUI action establishes native Retry/Copy/Cancel behavior; API or fixture results must be reported separately.

### R13 evidence boundary (2026-10-15)

R12 Web Review CONTINUE includes user-confirmed cross-machine YouTube/Bilibili downloads and actual Downloading Cancel with a clean visible destination. Preserve that human evidence without repeating it or upgrading it into proof of process/tree/readers/lease/job-workspace settlement. Verify those engineering facts separately through the unchanged production queue and owned paths; diagnostics retained after a cancellation are not leftover media workspaces. The queue's shared Ready lease may correctly remain while the application is alive; final Stop must join all owners and release it.

Unavailable foreground/native component Copy/Retry/menu-active Exit or an unverified clean non-admin environment remains NEEDS HUMAN. Administrator PATH isolation and other computers with unspecified account/tool/cache conditions do not close that Gate. Win+D is normal Shell behavior per the user; no hook, periodic force-topmost, new UI design or occlusion refactor is authorized by this closeout. Local source commits preserve engineering work and never constitute final Stage C acceptance or public Gate B clearance.

## TRA-26 R2 stage A presentation increment (2026-10-15; pending web Review)

Instruction18b9d696-d4f2-499c-a6ca-79e4e586a0fd and TRA-23 R13 Web Review43c6cb1f-bb52-49cf-ad83-6ab36f44c6e9 allow an isolated UI increment from bd61334d. This section supersedes the historical GPUI selection, immediate Success-row removal and retained-Failure Badge projection above. Backend admission, FIFO3, start tickets, frozen settings, process/slot/settlement and diagnostic history contracts remain unchanged. TRA-23 native/clean-user and public-release gates remain independent.

- Backend main_job remains its legacy oldest-started projection. GPUI chooses the newest actually started slot-owning Job by start_order. A waiting submission has no start ticket and cannot steal the main ring. Only the previously selected Job may begin a foreground terminal hold; background terminals do not steal it. Success holds1500ms once, then selection reads the latest snapshot and current progress. Existing Cancel/Failure ring retention remains separate.
- Visible unknown Downloading requests continuous frames unless Reduced Motion is enabled. Retain the220ms ease-out fill and separate resolver handoff. Exact all-selected-stream progress, two-second freshness, preterminal cap below100%, merger/validation/publishing truth and safe delivery still govern percentages/Success. Missing facts hide the percent; same-Job unknown-to-known recovery must not reset the visible baseline to a fabricated0%.
- Queue projection preserves admission order, fixed96px rows,40px header,140px scrolling viewport and reserved track/status/action slots in the fixed180px panel. Waiting is an empty neutral track without0%; downloading uses trustworthy integer percentage and fresh measured speed; processing replaces obsolete numeric facts. Full-title hover stays inside the visible surface. Retirement above the viewport preserves the first surviving visible row and its intra-row offset, rather than merely retaining a numeric scroll offset.
- Success already observed while the queue is open is green for500ms before row retirement. Closed/previous Success is never replayed; settled Cancelled rows disappear. These clocks are independent from the foreground1500ms hold. Presentation Clear and accepted Retry retire only the visible Failure row; the backend Failure/history/diagnostics remain. Rejected Retry or a failed command enqueue keeps that row and gives bounded safe in-row feedback. Copy acknowledgement follows actual OS clipboard success.
- Badge counts unfinished plus visible, uncleared/unretried Failure rows. A single visible Failure is red numeric1; ordinary unfinished-only Badge starts at2+. Mixed blue/red geometry and ring glow remain unchanged, with no Badge glow. Badge is the only ordinary queue entrance; safe-exit return-to-queue remains a recovery continuation.
- Opt-in diagnostic fixtures must be bounded, task-owned and no-network, without constructing production coordinator/preparation/runtime/settings/tray. Actual GPUI window-message evidence is distinct from physical mouse/human acceptance; callback intervals are distinct from GPU presents and public downloading. Tests of the unchanged coordinator establish authority separately. No Stage B popup/menu/directory/magnetic or Stage C settings work is implied by this increment.

The QueueCommand/CommandReply signatures above are unchanged. Presentation correlates Retry's source ID with Accepted(new_id); Error or transport refusal must not retire that source. Base: C has the highest real start ticket while D waits. Good: C Success holds once, then D's fresh19% is shown; removing an above-viewport Success leaves the same surviving row under the pointer. Bad: backend oldest main_job is reused as the new UI selector, a timer fabricates100%, or a rejected Retry silently dismisses its Failure.

Required increment regressions: steady unknown Downloading still schedules frames after700ms; settled determinate/Reduced Motion do not spin needlessly; same-Job freshness gaps do not show fake0%; all-stream/missing/processing observations remain honest; A/B/C/D selection and background/foreground terminals respect independent1500ms/500ms lifetimes; closed Success never replays; Retry accepted/refused/transport failure, Clear and visible-failure Badge agree without deleting diagnostics; above-viewport retirement preserves visible row/intra-row position. Wrong: select snapshot.main_job and reset terminal deadlines every poll. Correct: derive the newest eligible start ticket in the UI and initialize a selected terminal's deadline once.

## TRA-26 R3 A Repair presentation contract (2026-10-21; pending web Review)

### 1. Scope and supersession
Instruction402f064f-15c3-4174-b9c1-864ab400002a repairs R2 Review08649ee3-6488-4a07-ad4b-15b7696cc591. This supersedes R7/R2 whole-selected-stream percentage and96px queue geometry only. R2 animation,220ms interpolation, newest-started foreground,500ms/1500ms retention, Badge, scrolling, safety and command authorities remain. A repair engineering checks never authorize B/C or close TRA-23 human/public gates.

### 2. Signatures
Neutral `TransferProgress` adds serde-default `estimated_total_bytes: Option<u64>` and `phase: TransferPhase::{Primary,Audio,Processing}`. `fraction_at(now)` returns fresh Primary fraction only; GPUI never parses provider JSON. `--preview` explicitly creates synthetic transport; existing `--stage` and `--queue-fixture-control PATH` remain. `--progress-timeline PATH` enables bounded sanitized facts, not a new download authority. Queue command/reply signatures stay unchanged.

### 3. Contracts
- Adapter chooses one identified video primary, or a sole media stream; incomplete/ambiguous selected IDs fail closed. Exact totals take precedence. Downloader estimates must be nonzero integer bytes <=2^53, >=downloaded bytes and not contradict exact facts. Estimated provenance is shown as approximate progress. Missing/ambiguous/stale facts stay indeterminate. Finished primary and subsequent audio never become a second percentage ring. Merge/remux, validation and saving keep truthful neutral states; only actual delivered Success is100%. Two-second freshness and preterminal99 cap remain.
- Fixed56px admission-ordered rows share stable right operation slots, single-line truncated titles, short status/percentage/rate, one track and subtle separators. Failure prioritizes Retry; a same-surface secondary action area holds safe Copy/Clear/Return. Full title remains within the panel in a scrollable left strip and does not cover right actions. Retirement preserves first surviving visible Job plus intra-row offset, using current56px geometry.
- `--preview` exposes0-9 representative rings/queues, Q queue, T theme and R reduced motion, with Fixture labeling. No coordinator, runtime preparation, tray, user settings/file persistence or real Submit is constructed; explicit preview takes precedence over production test-bridge flags. Scene changes preserve monotonically increasing snapshot revisions and reset presentation identity, so repeated keys cannot replay old holds or freeze behind stale-revision filtering. Interactive preview ends with transport/window lifetime; file-controlled fixture remains120s bounded. Ordinary production launch has no numeric scene keys.
- Timeline uses create-new output, a bounded128-record channel and at most8192 scalar records on a background writer. Whitelist stream ordinals/bytes/exact/estimated totals/status/timestamps/phase/fraction; no URLs, format identifiers, Cookies, raw provider text or private paths. Best-effort telemetry never blocks process callbacks or changes settlement. Displayed-percent telemetry follows the rounded tween normally and immediate target under Reduced Motion, mirroring the indicator rather than a stale floor.

### 4. Validation and error matrix
| Condition | Required result |
| --- | --- |
| Primary exact or valid estimate, fresh sample | One truthful integer/arc; approximate basis visible |
| Selected stream missing/oversized/duplicate ID or ambiguous video | No invented primary percentage |
| Audio after video / actual processing / sample age >=2000ms | Neutral phase or unknown; hide obsolete number |
| Estimate correction | Existing220ms retarget, including truthful downward correction |
| Retry rejected / clipboard write failed | Keep Failure / no copied-success acknowledgement |
| Preview Submit/settings/preparation or combined production bridge | Refuse before production side effects |
| Multiple scene changes after long viewing | Fresh monotonic snapshots, no stale scene/terminal replay |

### 5. Good, base and bad cases
Good: sequential video has visible progress before audio is first observed, then audio/processing carry no percentage and verified publication alone yields Success. Base: a fast video produces only a few real samples; animation follows them without slowing download. Bad: audio is promoted because invalid video metadata was filtered out, a fragmented/unknown total is invented, or synthetic preview Jobs mix with production.

### 6. Required tests and evidence
Regress primary-before-audio, single stream, missing/ambiguous IDs, actual/estimated/contradictory/stale/fragmented facts, truthful phase text, tween correction, fixed row/anchor and Failure actions. Regress numeric repeated scene switches after accumulated revision/terminal state, default production isolation and combined-flag isolation. Preserve authority tests. Windows final-build fixture crops/WM operations prove rendering only, separate from one actual split-media provider/presentation/render trace and delivered ffprobe/hash. Blank/occluded crops are excluded. Historical pre-check25115 telemetry used floor while rendering rounded; do not present those telemetry numbers as exact pixels. GPUI callback cadence is not GPU-present timing or human acceptance.

### 7. Wrong versus correct
Wrong: require exact totals for every selected stream before showing primary video, or use a timer to fill gaps. Correct: use a positively identified primary's exact/constrained estimated byte facts; audio and post-transfer phases remain neutral. Wrong: reset fixture snapshot revision to1. Correct: preserve monotonic transport revisions across scenes and retire old presentation state.


## TRA-26 R4 A Queue UI Polish (2026-10-21; pending web Review)

Instruction fcb9b23f-89ee-43d0-b867-b032ca0b3630 supersedes R3's failure More/secondary menu and full-title detail strip only. Preserve R3 neutral progress facts,220ms tween, Reduced Motion, preview isolation,56px row/scroll geometry, ordering,500ms/1500ms retention and all command/settlement authorities. This is A-only polish, never B/C permission.

- Failed rows expose three separate, always-visible outline icon actions in one fixed right region: Retry, CopyDiagnostic and session-only Clear. Active/waiting rows expose Cancel in that region. Consistent independent hitboxes, hover/press/focus/disabled treatment use current Palette/Penpot tokens; do not replace this with a More menu, popup, drawer or swipe. Header Return and safe-exit return-to-queue remain. Held/RetryCleanup permissions remain authoritative. Retry retires its source only on Accepted; clipboard acknowledgement requires actual OS success; Clear never deletes output/diagnostic evidence.
- Geometry:180px content =100px left information +4px gap +76px action lane. Each native vector icon has a24x24px independent hitbox,2px inter-button gap and14px/1.2px drawing. Row height remains56px with restrained1px separation. Enabled actions support focus/Enter/Space and hover hints within the existing status line; disabled actions never gain permissions from styling.
- Titles remain one line and truncate by default. A truly overflowing hovered title may browse horizontally only within its existing clipped slot after a quiet delay. Short titles and Reduced Motion remain static. Leaving, scrolling, queue close or row removal cancels movement and restores truncation; no full-title overlay or persistent idle animation loop. Text cannot cover adjacent rows/actions or leave the panel.
- Overflow uses actual GPUI shaping of the same10px Medium font against100px, never character-count guesses. Title browsing waits700ms, advances14px/s, stops at the end and adds no further frame deadline for short/idle/end/Reduced Motion. Title replacement or scroll-offset changes also retire stale browsing. Existing download polling is separate from this bounded presentation animation.
- Keep compact fixed-height rows, primary title versus secondary state/rate/percentage, restrained1px boundaries or subtle tonal grouping and fixed right actions. Waiting remains empty track/no fake0%, estimated progress keeps its approximate marker, processing replaces stale numeric facts. Do not change backend/Adapter or add provider coupling for polish.

Verification: behavior-level tests for overflow/short-title/Reduced Motion/leave-scroll-close-removal lifecycle and safe command feedback; native final Windows GPUI crops in Light/Night for waiting/downloading/processing/failure/success, all three icons, cancel, Badge/header Return and stable scrolling. WM/fixture evidence must be labeled separately from physical mouse/human acceptance. Existing R3 real-media trace is retained; no network matrix is required.

Wrong: make Clear available on unsafe Held, remove Failure optimistically before Retry acknowledgement, or scroll an entire row/title overlay. Correct: retain existing safe command boundary and move only the overflowing title inside its original slot.

Transport refusal/full/disconnected channels leave the Failure visible and retryable, with safe bounded feedback. Pending Retry suppresses duplicate submissions until its reply; only Accepted retires the source. Shared owner loss never invents shared cleanup permission and does not disable cleanup of an independently live slot-owning Held Job. These are unchanged command authorities, covered by behavior regressions rather than new backend APIs.

GPUI0.2.2 tab_index registers focus stops but does not install traversal. While the queue is open, root key capture must explicitly route Tab to window.focus_next() and Shift+Tab to window.focus_prev(), then stop propagation. Outside the queue, preserve existing keyboard behavior. Validate real foreground-owned Tab/Shift+Tab focus borders plus Enter/Space actions in the native final artifact; declaring focusable or posting unfocused WM keys is insufficient evidence.

For focused GPUI0.2.2 div controls, Enter/Space KeyUp already dispatches on_click. Use the same guarded on_click for mouse and keyboard; adding an extra KeyDown activation duplicates Copy and can combine unrelated actions. Native regression must count exactly one command and one real clipboard success for a single Space, and one Accepted Retry for a single Enter.


## TRA-26 R5 A Two-Row Layout Repair (2026-10-22; pending web Review)

Instruction353e284a-d216-487b-8e70-a62fd12075cd supersedes only R4's whole-row fixed100px information/76px actions layout and fixed100px title measurement. R4 icon semantics, keyboard safety, delayed in-place title browsing, R3 progress/animation, preview isolation, fixed56px rows, ordering/anchor, Badge and terminal holds remain. This engineering increment does not authorize B/C or decide product acceptance.

- Each56px item has two sibling horizontal lines: first24px title/actions;4px vertical gap; second14px track/status. Row content is centered with the existing1px separator. Only the first line reserves actual icon widths:0/1/2/3 actions use0/24/50/76px plus4px title gap only when actions exist, leaving180/152/126/100px for title. Preserve24px independent targets and2px icon gaps. Do not mount an empty fixed action lane for no-action rows.
- Second line independently spans180px. Measure the actual compact status/value string in the same8px Normal font, ceil with1px tolerance, cap at124px, and give the track the remaining width after4px gap, minimum52px. Truncate overly long status within its allocation. Video can show truthful integer/approximate percent and fresh speed; waiting stays empty neutral; audio/processing never manufacture numeric progress; identifiable Failure and green500ms Success remain. No permanent first-line icon reservation applies to this line.
- Title shaping/ellipsis/browse must use the actual current viewport, same10px Medium font. Browse identity includes Job/title, phase/attempt and viewport width. On changes, retire stale offset before measuring/browsing; retain700ms delay,14px/s bound, clip before actions, and leave/wheel/scroll/close/removal/Reduced Motion resets. Do not add overlays or move buttons/other rows to reveal a title.
- Offline layout fixtures may expose same long title with different states/action counts. Repeated transient Success triggers need a fresh synthetic identity so ordinary500ms retention is exercised, rather than replaying a retired Job or extending its hold. Preserve existing0-9/Q/T/R preview keys and production isolation.

Verification: lowest-layer regressions for actual action width, truthful compact state and width/phase/attempt marquee invalidation; actual final GPUI Light/Night 3/1/0-action tight crops, neutral audio/wait/processing, long title/RM, safe actions and foreground-owned keyboard. A short Success screenshot must follow observation of the current fixture identity; a pre-application Waiting screenshot is not Success evidence. Above-viewport retirement must preserve surviving Job plus intra-row offset, not merely numeric scroll offset. Retain distinction between WM/SendInput fixture evidence, physical-user acceptance, real network and GPU Present.


## TRA-26 R6 A Hover + Failure Label Repair (2026-10-28; pending web Review)

Instruction416478ff-d580-4a37-92fd-4f606980d495 supersedes R4/R5 status-line hover/action-hint substitution and technical Failure code labels. R5 two-row dynamic geometry and all queue/command authority remain. This is a bounded A repair and does not authorize B/C or product PASS.

- Hover/focus/leave on any row action changes only existing icon visuals. Persistent second-line text/color/measurement come from actual task state and fresh progress/rate; transient hover labels and command notices must not enter that projection. Track geometry and fill stay identical for the same facts. Real progress/rate/phase/freshness changes still update normally. Do not mask the defect with tweening or freeze true data.
- Default ordinary Failure status is the friendly red 下载失败, including missing Failure detail. Keep internal FailureCode/reasons and safe CopyDiagnostic content intact. Ordinary UI text is not a diagnostic dump.
- Meaningful command results use the existing clipped first-line title viewport for5000ms, leaving icons/row dimensions/second line unchanged, then restore current title. A notice cancels old title browsing and cannot itself marquee. RetryAccepted retires source only after authority acknowledgement and gives the new Job the accepted notice; Rejected preserves source. Clipboard success follows actual OS result. UI-only RowCommand correlation carries Cancel/Cleanup refusals to the affected visible Job; shared owner0 may target its still-visible no-slot Held rows. Do not alter backend protocol or settlement permissions.
- Offline command_accept and progress-a controls prove refused commands preserve state and the same Job can update34%1.2MB/s to61%2.5MB/s during notice. Existing preview keys/isolation and bounded file transport remain. Tests of transport refusal and row correlation complement actual native rendering.

Required evidence: final --preview same-Job normal/hover/leave/foreground focus semantic pixels and track/fill geometry unchanged; failed three-icon state friendly while just-copied synthetic diagnostic retains E_MEDIA and stage; command refusal/clipboard failure visible without changing ongoing second line; genuine progress update remains visible. Separate physical user/network/GPU claims from WM/SendInput fixture evidence.

### Scope and trigger

Any queue icon hover/focus/leave or command result in the R5 two-row panel follows this increment. It supersedes earlier action_hint substitution; backend command/terminal/resource authority remains unchanged.

### UI-only signatures

`UiReply::RowCommand { job: u64, cleanup: bool, reply: CommandReply }` correlates Cancel/Cleanup worker replies without adding a backend QueueCommand or CommandReply variant. `queue_row_status` projects persistent snapshot state. First-line notices are keyed by Job and expire after5000ms.

### Contracts

Row height56px, title widths180/152/126/100px for0/1/2/3 icons, and second-line track measurement remain. Neither hover/focus labels nor temporary notice strings may enter status measurement. Notice clears and suppresses title browsing until expiry. Accepted Retry notice may precede new snapshot delivery; unknown ordinary Job replies cannot create visible rows.

### Error matrix

| Result | First-line feedback | Persistent state |
| --- | --- | --- |
| Retry Accepted(new_id) | 已加入下载队列 on new Job | Source retires under existing authority |
| Retry rejected / transport refused | 重试未受理 | Original Failure remains |
| OS clipboard Ok / Err | 诊断已复制 / 复制失败，请重试 | Failure and technical diagnostic remain |
| Cancel / Cleanup refused | 取消未受理，请重试 / 清理未受理，请重试 | Current progress / Held remain |
| Shared owner0 refusal | Correlate still-visible no-slot Held rows | No backend ownership bypass |

### Cases

Same facts imply the same status ink, track span and blue fill across normal/hover/leave/focus. Genuine same-Job34%1.2MB/s→61%2.5MB/s updates during notice. Failure detail present, absent or any internal code still defaults to 下载失败. Successful diagnostic copy keeps technical code/stage/reason under existing safe formatting.

### Tests and evidence

R6 UI/fixture regressions cover notice expiry, browse reset, friendly Failure codes, reply correlation/refusal, accepted/rejected Retry and true progress updates. Final Windows Light/Night captures measure122px track/56px blue fill for46%, stable across input states; Failure143px empty track is stable across all three icons. Native scripts verify actual clipboard outcome and single Space activation. Full package174 PASS/12 ignored; production check/strictClippy/static build pass. Extra all-targets test lint debt is recorded separately.

### Wrong versus correct

Wrong: set hover action_hint, replace34%1.2MB/s with 取消, then remeasure track; report copy success before OS acknowledgement. Correct: keep snapshot-derived second line and geometry; show acknowledged command result in the existing first-line viewport and restore title on expiry.


## TRA-26 R6 user follow-up: fixed track and second-line action labels (2026-10-28; pending web Review)

### Authority and scope

The user directly corrected the R6 presentation after its initial Report: they prefer action hover labels in the second line and explicitly proposed fixed track width. Supplemental Execution4d763383-c312-4228-a121-f94a8d935868 records that instruction. This supersedes ONLY the earlier R6 ban on second-line hover/focus text and R5 adaptive second-line measurement. Historical reports remain tied to their frozen artifacts. Friendly Failure, command authority and all other R6/R5 contracts remain.

### Presentation contract

Second-line180px content has a fixed122px track,4px gap and54px text slot in all states. User rejected the initial86/90 proportion because rare long error text took too much space from the track. Common progress/rate and short labels determine the allocation. User further requested right alignment for short labels and readable long preparation statuses; prefer concise queue-specific wording that preserves preparation/cleanup uncertainty rather than a truncated half sentence. Complete diagnostics and other views retain their full detail. Neither action label nor real status length changes track geometry. Same progress facts yield the same blue-fill geometry across normal/hover/leave/focus. Actual fraction changes continue updating while a hint is visible. Existing first-line widths and56px height remain.

Queue-only mappings: nonterminal owner-lost job without an independent slot → 清理未确认; Preparing with shared Held → 等待组件清理; Preparing with shared Failed → 组件准备失败. Ordinary Preparing remains 准备下载组件, independently owned Held remains 清理待确认, terminal media Failure remains 下载失败. These shortened labels cannot claim cleanup success or grant command permission. Shared full preparation labels and diagnostic facts remain unchanged.

### Intent and restoration

Enabled Cancel/Retry/Copy/Clear/Cleanup icons expose localized second-line labels on hover or keyboard focus. Hover takes precedence over focused action in the same row. Mouse leave restores the focused label if focus remains, otherwise the latest snapshot-derived task text; blur restores current status when no other enabled action intent remains. Queue close, row identity/phase/attempt/permission invalidation must retire stale action intent. Valid control focus must not be stolen; root may be restored when there is no valid focused control.

GPUI0.2.2 explicit tracked FocusHandles must themselves be created with tab_index(0).tab_stop(true). The div.tab_index setting is not propagated when track_focus supplies an explicit handle. Unit intent tests cannot prove native Tab registration; actual Tab/Shift+Tab traversal and single Space/Enter activation must be checked in the built Windows application.

### Error and command results

Hover/focus labels describe an action and never claim command success. Actual command results remain in the existing first-line title slot for5000ms. OS copy success is acknowledged only after actual success; Retry rejection preserves source Failure. Default Failure remains red 下载失败; diagnostic details/FailureCode remain untouched. Disabled actions gain no permission or enabled hint.

### Cases

Base: Failure shows 下载失败; Retry→Copy→Clear hover changes only right-aligned text/icon visuals, not the122px empty track. Good: same Job34%→61% grows blue fill under unchanged Cancel label and mouse leave reveals the latest percentage/rate. Short preparation states remain fully readable while retaining their safe meaning. Bad: measuring a hover string to allocate track width, reserving an oversized permanent text area for rare errors, clipping an abnormal preparation sentence until its meaning is lost, using hover to show 已复制, leaving a retired action label on a new phase, or adding a second keyboard activation callback.

### Verification

Behavior-level regressions cover fixed geometry, active intent/restoration, stale lifecycle and live snapshot updates; run affected tests, production check/strictClippy, bounded static build. Actual Windows Light/Night final-artifact crops verify hover/leave/focus labels, fixed track/fill, true progress update, current-state restoration and single Space copy with retained technical diagnostic. Fixture/WM/foreground SendInput evidence remains separate from physical-user/network/GPU Present/product acceptance.

### Boundaries

Only GPUI presentation and inline tests change. No backend protocol, main/Cargo/native window, fixture, first-line title geometry or download authority change. No tooltip/third line, network matrix, B/C, commit/archive/push/merge/public release or acceptance PASS.

## TRA-26 R7 temporary Popup evidence checkpoint (2026-10-28; blocked, not product acceptance)

### Scope / trigger

R7 Gate1 saved accepted A at6ef13827. User separately started Gate2; its Instruction requires stopping if temporary GPUI Popup reliability needs wider architecture. The isolated B branch remains uncommitted and incomplete. This entry records evidence rules and a failed candidate, not an approved final menu contract.

### Signatures / native boundary

GPUI0.2.2 WindowOptions has no owner argument; Windows PopUp starts as WS_EX_TOOLWINDOW without owner. A small candidate creates hidden, extracts HWND via fully-qualified HasWindowHandle::window_handle, defers GWLP_HWNDPARENT binding/show until Window borrows end, and verifies GetWindow(GW_OWNER). Existing product TitlebarOptions.appears_transparent=false avoids the probe's observed8px drawing inset. No dependency change, toolkit fork, global hook or permanent main-HWND enlargement was adopted.

### Contracts

Owner/style fields, successful build and arithmetic placement tests do not prove focus, outside input or cleanup. Distinguish standalone probe, integrated product, OS automation and physical-user evidence. Native focus-loss events close activating outside targets; polling GetAsyncKeyState every30ms is only sampled state and cannot guarantee observing shorter nonactivating button presses. Do not describe that polling as reliable arbitrary outside-click delivery.

### Validation / error matrix

| Observation | Permitted conclusion |
| --- | --- |
| Probe native7 cross-menu mouse selection and live root-close/destroyed | That probe path works; integrated product still needs independent checks |
| Product hover-geometry4: visible owned Zed menu foreground; NOACTIVATE Button hit guard; requested20ms click;180ms later menu live/foreground unchanged | Current candidate misses that controlled nonactivating outside input; stop at R7 reliability checkpoint |
| Hidden IME chosen by GW_OWNER-only discovery | Test-driver error, not menu focus failure |
| WindowFromPoint skips a STATIC text witness | Test-target error; use an actually hit-testable owned witness before input |
| No physical-user callback/receipt evidence | Keep the OS-injection limitation; do not upgrade to human acceptance |

### Good / base / bad cases

Good: identify same-PID visible Zed root/menu, verify owner, foreground and actual point target, preserve failed native trace and stop within scope. Base: temporary test foreground preparation is explicitly labeled. Bad: infer Popup failure from a hidden IME, infer a stable Full from transient width alone, or keep expanding hooks/window architecture after the authorized stop condition.

### Tests required

Retain source/build hashes, actual test counts and ignored cases, precise input timing method, native HWND lifetime and safe exit. Future candidate changes need the same activating/nonactivating outside behavior, keyboard/submenu/edge and lifecycle checks in the integrated product. Real Explorer open/drop must pass before removing the old directory menu; those gates were not completed here. R7 bin103/1ignored and lib61/6ignored plus strictClippy pass are engineering checks, not B acceptance.

### Wrong versus correct

Wrong: owner correct +30ms polling means all outside clicks close. Correct: prove each input class with a valid native target; a sampled-state miss is a failed candidate, and any replacement mechanism needs coordination within the approved scope. Keep the accepted A baseline and partial B source recoverable without committing or archiving B.


## TRA-26 R8 in-main-window menu checkpoint (2026-10-28; blocked, not product acceptance)

### Scope / trigger

Approved R8 replaces the separate menu Popup with a page inside the existing 200x200 Full Surface. The existing main HWND itself may be a native Popup kind. Final primary rows are Quality, Hide to tray, Settings; Quality is another page. Tray retains real Exit. No menu HWND, HMENU, global input hook or input-state polling is authorized. B remains uncommitted and incomplete after the actual-blur stop condition below.

### Signatures

Prototype owns neutral context_menu::Menu and a retained GPUI observe_window_activation subscription. The candidate calls close_menu when !window.is_window_active(). Opt-in presentation/telemetry adds menu_page (closed/primary/quality), menu_selected, menu_pending, menu_hint (boolean only), visual_offset. These report underlying state, not proof of platform event delivery.

### Contracts

Opening hides ring/glow/Badge/status visually while retaining live job/timer authority and a Full lock. Closing releases that lock through established stage/pointer/retention rules. Pointer leave alone keeps the menu. Actual deactivation must close. Esc/Back are page-specific; header nonbutton area alone starts drag, rows/gaps consume presses. Quality closes only after the matching SettingsSaved acknowledgement, never on send; failures retain the page and prior acknowledged marker. Real Explorer folder drop and correct-folder background double-click must pass before removing the transitional folder entry.

### Validation and error matrix

| Observation | Allowed conclusion |
| --- | --- |
| Light Windows menu-light-1: root remains one 228x228 HWND; mouse/keyboard navigation, row/header drag ownership pass | Those bounded automated fixture paths work; not full B acceptance |
| NOACTIVATE witness remains outside foreground; primary remains open | Expected no-actual-blur boundary under R8; does not prove universal outside-click closure |
| blur-confirmation-1: continuously pumped ordinary Button holds foreground for all35 samples;35 distinct product timestamps over3730ms still primary | Actual-blur closure FAIL for this candidate; stop under R8 |
| Native gutter screenshot contains external desktop | Keep original locally; crop/mask exterior pixels before sharing |

### Good / base / bad cases

Good: distinguish actual foreground change from nonactivating input, bind to exact HWND/PID, keep the witness message loop running and compare fresh product states. Base: foreground preparation is test setup, not natural-start z-order proof. Bad: infer correctness from a retained observer alone, treat GetGUIThreadInfo background thread fields as system foreground, or count a stale sample as a live failure. The full-scope checker also noted invisible Badge opacity does not remove its hitbox at Surface(30,30); this is an unverified interaction risk, not a new runtime failure claim.

### Tests required

Candidate menu regressions5/5, bin107/1ignored, lib61/6ignored, strictClippy/build/diff-check pass. The targeted native repro is run_blur_confirmation.py; it continuously pumps the witness, records foreground/GUIThreadInfo and fresh menu_page states. Unit/build success cannot override this failure. Both fixture processes exited0 after synthetic Idle cleanup and ordinary WM_CLOSE; this does not prove tray Exit or in-flight downloader safe-stop. Directory/quality persistence/tray/theme/reduced/mixed-DPI and remaining B workflows were not run after the stop.

### Wrong versus correct

Wrong: GPUI subscription exists and menu tests pass, therefore every ordinary outside click closes. Correct: this candidate demonstrably remains open after actual foreground loss; preserve the failure, retain the old directory route and report for coordination without adopting broader platform mechanisms or declaring B complete.

## TRA-26 R9 focus observation boundary (2026-10-28)

R9 permits task-owned diagnostic copies only; it does not authorize a production activation repair. Keep the frozen R8 source, EXE and actual-blur FAIL separate from instrumented results. A later non-reproduction in another control order does not erase that failure.

Correlate root HWND/PID/thread and global foreground, thread active/focus, raw WM_ACTIVATE/WM_ACTIVATEAPP/focus messages, GPUI public active samples, observer entry/exit and menu page/generation on a shared QPC axis. Public active samples cannot prove execution of GPUI's private setter. Native records carry timestamped cached UI fields, not simultaneous GPUI reads. Preserve exact WndProc call-through and return values; producer queue drops/sequence gaps and missing logger tail completion limit absence claims.

An unopened menu or a witness that never obtains foreground is an unmet diagnostic precondition, not evidence that a downstream close failed. Cleanup/destruction activation messages are outside the target transition. R9's original-binary controls reached a closed menu, but subsequent first-open and instrumented attempts did not establish the required open-menu/ordinary-witness interval; the first failing production layer remains unproven. Stop with this gap and coordinate the smallest stable-input follow-up instead of adding a production workaround or declaring B accepted.

## TRA-26 R10 real-settings acceptance boundary (2026-10-29)

### Scope / trigger

R9 web Review 10f6234c-ba4b-45f7-bb7d-63a985805211 accepted its bounded diagnostic checkpoint and the user's separately reported focus/Full-to-Compact interactions. Root cause remains unknown and R8 evidence remains historical. R10 continues remaining B under a real, isolated settings authority; no production focus repair follows merely from the old diagnostic gap.

### Signatures

Normal startup reuses --runtime-root <task-root>, --settings-path <task-settings.json>, and --output <existing-task-folder>. Directory/quality writes use the existing QueueCommand::SaveSettings and SettingsSaved/Error replies. Existing accepted Job settings and Retry intent remain immutable.

### Contracts

Do not use --preview or another fixture mode to verify persistent product settings. Its empty output path and rejected SaveSettings are test-mode behavior, not production success/failure. Keep runtime, settings and output task-owned. Startup automatically prepares components even without media submission; an isolated cold root alone does not prevent network acquisition. A private one-click acceptance launcher should preflight a copied, matching immutable warm cache and bound any fallback through process-local controls; never modify global environment/proxy or user cache to obtain evidence.

Background actions must respect the existing settings-pending lock through both press and release, so a directory save awaiting ACK cannot open stale acknowledged output. An invisible Badge must not consume background hit testing. Keep one canonical settings owner, publish success only after persistence, and leave acknowledged defaults intact on rejection.

### Validation / error matrix

| Condition | Required result |
| --- | --- |
| Pending directory save and background double-click | No stale-directory open; normal eligibility resumes after success or failure |
| Idle invisible Badge over background | Background input is not consumed by an invisible control |
| Ordinary file, multiple/missing/unwritable folder input | No incorrect settings ACK or changed persisted defaults |
| Explorer process starts | Insufficient alone; observe the actual current folder |
| Real Explorer OLE drop and durable settings/restart match | Bounded automated Windows evidence if input is synthetic; physical-user acceptance remains separate |

### Good / base / bad cases

Good: one-click normal product launch uses isolated real settings; actual Explorer path and folder drop are verified before removing the transitional fourth menu row. Base: document remaining physical-user scenes as NEEDS HUMAN. Bad: count a fixture rejection as product failure, infer the target folder from spawn success, or declare whole B accepted from build/automated input.

### Tests required

Use focused pending-save success/failure and click-pair invalidation regressions, existing atomic-settings and frozen-Job tests, then affected product checks. Verify exact-folder double-click, real OLE drop, disk ACK and restart in Windows, with bounded focus/back/Esc/Compact and tray/quality/menu checks. Preserve exact final executable/source hashes and failed-harness history; do not rerun unrelated network matrices.

### Wrong versus correct

Wrong: isolated runtime root plus no media URL means startup cannot download anything. Correct: cache miss starts component acquisition; preflight the task-owned warm cache and bound startup effects before delivering the acceptance entry.

## TRA-26 R11 Badge and idle feedback contract (2026-10-29; product Review pending)

Instruction 4ed9939a-02c9-4433-ac8e-c03ba027c9af authorizes two local UI repairs. Badge remains 42x28 with the same 12px Medium font, count, hitbox, colors and overlapping 8px dots. The earlier row-v2 candidate uses one shared vertically centered row: a fixed 16px count slot with 12px line height and right-aligned text, a 5px gap, and an 11x8px dot group with mixed blue displaced horizontally by 3px. Red and blue share top=0. Light/Night share layout and change colors only. No glyph-measurement helper or theme/count-specific vertical offset remains. Native Light/Night crops must include blue 2/5, red 1/2, mixed 1+1/5+1 and one/two-digit counts, with queue entry checked separately.

The user reopened mixed-dot optical REPAIR on 2026-10-29, authorizing at most two reasoned local composition candidates while preserving overlap intent. Candidate1 tested mixed center separation5px (3px overlap) and mixed group13px, retaining origin/y/draw order/colors/count slot. Its hypothesis was that reducing occlusion makes blue easier to read; no perceptual root cause or AA defect was established. The user subsequently confirmed both versions look aligned and satisfactory and selected the more compact baseline. Production therefore uses the original3px separation,5px overlap,11px group; candidate1 widening is withdrawn, with its immutable binaries/evidence preserved as experiment history. Do not reintroduce5px based on its label as candidate or resume per-theme vertical patches. Record the user visual confirmation without extending it to unrelated B runtime gates or final web Review.

Earlier R11 experiments are withdrawn history, not implementation guidance. GPUI 0.2.2 on Windows exposes a negative font-level descent but a positive DirectWrite shaped-line descent; using baseline_offset first made the count visibly too high. Subsequent ShapedLine ink measurement and text/blue-dot shifts added unnecessary complexity. The user explicitly requested a simpler common layout. Prefer the shared row and inspect actual native rendering before considering optical adjustments; do not reintroduce metric algorithms or per-theme/per-count patches for this repair.

Native raster bounds, shared layout geometry and subjective alignment are separate evidence. The user accepted the other earlier samples but identified the Night mixed Badge blue dot, rather than the numeral6. Actual Light/Night dot coverage had identical y-centers and symmetric rows; only theme RGB differed. The precise perceptual cause remains unknown. Text shifts targeted the wrong element, half-pixel trials produced unchanged raster output, and the later Night-blue shift was also withdrawn in favor of the shared row. Preserve these failed attempts without presenting them as delivered fixes. Final optical acceptance belongs to user/web Review; neither geometry nor a numerical pixel measurement alone establishes product PASS.

Full feedback has an absent state: idle production and synthetic fixture guides render no text or empty feedback hit layer. Preserve existing startup settings loading/errors, actual bounded operation receipts, component preparation/errors and conservative safe-stop feedback. Do not introduce a replacement permanent guide or a general Toast system. Menu typography, spacing, transitions, queue geometry and download authority are unchanged.

R11 inherits the R10 second drag-image/native source without a third window algorithm. Task-owned builds must preserve previous binaries. Window-targeted fixture messages prove rendering/interaction only; an automation helper that itself sets TOPMOST cannot prove natural startup or persistent topmost behavior. Actual Explorer drag image versus ordinary-app coverage remains a separate human acceptance gate. Keep the R8 lost-binary exception and prior focus/drag failures in evidence.


## TRA-28 R5 custom title-bar focus and TOPMOST (2026-10-31; pending web Review)

- GPUI 0.2.2 div track_focus installs a bubbling mouse-down listener that calls Window::prevent_default. Windows handle_nc_mouse_down_msg consumes default_prevented events, so a focusable ancestor can suppress native dragging even with a correct HTCAPTION hit. Keep automatic focus on the settings body below the title region, retain root Tab capture, independent close/button focus, WindowControlArea::Drag and explicit is_movable:true. Do not replace this with a manual move loop, global hook, owner change, speculative frame styles or a GPUI fork.
- First show and explicit reuse establish HWND_TOPMOST using SetWindowPos without SWP_NOZORDER, preserving SWP_NOACTIVATE and owner-order protection. Existing explicit user-open activation is separate; no timers, repeated background raises or focus loops.
- Regression proof requires real title-text and blank-title mouse drags, HTCAPTION plus SC_MOVE/ENTERSIZEMOVE, changed RECT during MOVING/MOVE and EXITSIZEMOVE. Static registration or synthetic RECT changes do not prove dragging. Verify close/content/Tab, reuse/reopen, WS_EX_TOPMOST and normal-app foreground coverage without focus theft.
- R5 evidence uses task-only transparent native message observation and research/verify_native_drag.py; user accepted four targeted checks. Baseline has caption-down events but no system move; fixed run has three complete system moves and TOPMOST. Observation code stays outside production. Exact foreground/Z-order time series and multi-display/DPI were not independently captured. A clean executable is separately identified; this engineering result does not advance TRA-28 to another stage or Done.
