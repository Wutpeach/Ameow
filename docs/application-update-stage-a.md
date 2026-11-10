# Windows application updates — Stage A

> Historical stage record. Gate A/B approval switches and the old packaging flags below were retired on 2026-11-10. Use [the current release steps](first-rust-release.md) for executable commands.

Scope: [Ameow #33, Stage A](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6721474253). This is a local, controlled update foundation. It does not enable public distribution. [Packaging Gate B](../distribution/packaging.md) remains blocked.

## Layout and identity

The intended per-user layout is:

~~~text
%LOCALAPPDATA%/Programs/Ameow/
  AmeowLauncher.exe                  stable entry for shortcuts and login startup
  state.json                        atomic selection / monotonic sequence / failed trials
  state.lock                        excludes concurrent preparation and selection writers
  running.lock                      held by the launcher until its child actually exits
  launcher.jsonl                     process and recovery receipts
  versions/<strict-semver>/
    Ameow.exe                       immutable, independently verified program
    manifest.json                   publisher-signed authorization
  staging/update-*/                  incomplete downloads are never launch candidates
  boot-*/                           per-launch nonce / Ready / acknowledgement / safe abort

%LOCALAPPDATA%/Ameow/                user settings and managed media runtime/cache
<user-selected output directory>/   downloaded media
~~~

No code discovers, reads, migrates or removes the old AmeowNext/stage-a data directory. The internal ameow_next library name remains. New Windows Run, single-instance mutex, restore event and tray owner identities use Ameow. Login startup resolves an installed version to AmeowLauncher.exe. A recognized old AmeowNext Run command is retired only when the user applies the startup setting; an unfamiliar command is preserved and reported. Registry tests use disposable keys, never the user's real Run settings.

## Trust and package contract

Production loads only public keys embedded from assets/app-update-trust.json. The current list is deliberately empty: production returns E_APP_UPDATE_TRUST_NOT_CONFIGURED before network acquisition. An owner-managed production key and signed Rust releases must be provisioned before real updates can be enabled. No private production key is generated, stored or requested by this implementation.

The Ed25519 signature authorizes the exact UTF-8 payload prefixed with the domain separator Ameow application update v1 followed by a newline. The JSON envelope has payload and a lowercase hexadecimal signature. The signed payload includes schema, product, stable channel, x86_64-pc-windows-msvc target, strict three-part stable version, monotonic release sequence, signing time (provenance only, no expires field), exact release URL, package size/SHA-256 and executable size/SHA-256. The only accepted source URL has the form:

~~~text
https://github.com/Wutpeach/Ameow/releases/download/v<version>/Ameow-<version>-windows-x64.zip
~~~

The archive contains exactly one regular Ameow.exe. Traversal, extra entries, symlink entries, malformed identities, oversized metadata or implausibly future signing time, wrong signatures, conflicting sequences, downgrades, previously failed trials, truncated input and either hash mismatch fail closed. An exact signed metadata retry after an interrupted transfer is allowed. The 0.5.0 permanent-release decision supersedes the earlier expiry policy: installation, acquisition/preparation and offline launch have no deadline or periodic re-signing requirement. Signed versions, monotonic sequences and local state still reject replay/downgrade; rollback must work offline. Unpublished draft manifests carrying expires are rejected by strict parsing.

Acquisition reuses the existing Windows HTTPS/proxy resolver, bounded redirects and exact-length download helper. It never falls back to a direct connection after a routing failure. Hashing and extraction finish in a separate staging directory before an immutable version is published and pending is atomically recorded. The launcher rechecks the signed authorization and executable hash and keeps a read-only sharing guard throughout the child lifetime.

## Shared state and safe operations

app_update::Coordinator exposes one snapshot and prepare / request_restart actions for future UI surfaces. States distinguish Unchecked, NoUpdate, Checking, Downloading, Verifying, Ready, WaitingForTasks, Switching, Failed and RolledBack. It is independent of yt-dlp component update state and media presentation.

request_restart closes admission through the real DownloadCoordinator. Already accepted queued and running jobs continue. New jobs, retries, settings writes and new component operations are refused. Held cleanup remains available. Only after jobs, preparation/component owners and settings persistence settle does the coordinator request the existing stop path. A stopped snapshot is published only after actual native joins and runtime lease release. An active slot count of zero is insufficient. The pending executable guard is retained while waiting.

The launcher starts a durable trial and waits for a nonce-, PID- and build-version-bound Ready receipt from the real GPUI app. The app waits for both its native window and command owner before emitting Ready; task admission remains closed until the launcher acknowledges it. An additional liveness interval precedes committing current. A timeout requests the app's safe stop and waits for process exit; it never kills a process to invent resource release. An owner that cannot settle intentionally blocks replacement.

After confirmed process exit, an explicit safe-restart marker allows the launcher to start the pending version. Ordinary exit has no such marker and leaves pending for the next launch. A failed/unconfirmed trial is quarantined and the prior current remains usable. An interrupted launcher transaction is rolled back on the next launch. If a previously confirmed current fails on a later startup, a verified previous version is used once; failure history and the monotonic sequence prevent cycling. Program rollback never changes user data or media outputs.

## Local fixture reproduction

The app-update-fixture Cargo feature is explicit and requires debug assertions. The fixture trust root is an RFC 8032 public test vector, absent from production trust. The public test-vector seed exists only in fixture/test code. Fixture builds and their local signed ZIPs are not release artifacts; do not distribute them. Non-debug builds with this feature are rejected at compile time. The numeric fixture identities 0.2.0 / 0.2.1 / 0.2.2 are test identities, not product releases.

Use a new task-owned target and output directory. Build with the locked Rust 1.93.0 toolchain. For each fixture version, set AMEOW_FIXTURE_BUILD_VERSION, run:

~~~powershell
cargo build --locked --offline --features app-update-fixture --bin ameow --bin ameow-launcher --example app_update_fixture
~~~

Copy each EXE to a new binary directory as Ameow-0.2.0.exe, Ameow-0.2.1.exe and Ameow-0.2.2.exe. Also copy AmeowLauncher.exe and the app_update_fixture example. Do not overwrite accepted EXEs. The example takes:

~~~text
app_update_fixture <new-or-existing-controlled-install-root> <exe> <version> <sequence> <new-fixture-evidence-directory>
~~~

It signs a local fixture and prepares it with the same store/signature/extraction path. It never uploads anything. Run the native integration script with new absolute install/evidence paths:

~~~powershell
./scripts/test_app_update_native.ps1 -BinaryDirectory <binaries> -FixtureExecutable <app_update_fixture.exe> -InstallDirectory <new-controlled-install> -EvidenceDirectory <new-evidence>
~~~

The script starts actual GPUI EXEs using a Windows LUA token with administrator authority disabled and Medium integrity. It checks the actual token, initial Ready, safe explicit restart, retained prior version, ordinary exit without restart, next-launch activation, a deliberately missing Ready, safe rollback and subsequent launch without retrying the failed candidate. It uses an isolated unavailable media-runtime fixture, so it makes no public media-download or full runtime-readiness claim. The fixture control file is compiled out of production; normal builds use the same session and safe-update APIs without that file interface.

Automated checks:

~~~powershell
cargo test --locked --offline --all-targets
cargo rustc --locked --offline --lib --features app-update-fixture -- -C debug-assertions=no --emit=metadata
~~~

The second command must fail with the fixture compile guard. Set AMEOW_PROCESS_EVIDENCE_ROOT to a fresh evidence directory for the native ownership tests. Existing tests requiring a genuine prepared cache or public-site samples remain conditional; do not present their ignored status as new verification.

## Remaining limits

- Production signing-key provisioning, a real signed release source, rotation/revocation policy, release authorization and public license Gate B are not completed here.
- The three approved UI entries, automatic check/download scheduling and idle restart policy remain later-stage work. No preview scene changes are needed because Stage A adds no product UI state or control.
- A fresh standard-user account, stock machine, Windows sign-in/reboot, mixed DPI and interrupted-power/disk durability have not been established by the local fixture run. A Medium LUA token on the development machine is a narrower claim.
- The existing Launcher protocol is version 1. Launcher self-update, disk-space policy and garbage collection of old versions/orphan staging directories are not implemented. Old versions and failed-trial evidence are retained.
- A hung process whose real owners cannot settle blocks switching. This is an explicit safety choice, not a timeout-based force-update fallback.
