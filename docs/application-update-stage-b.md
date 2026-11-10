# Windows application updates — Stage B

> Historical stage record. Gate A/B approval switches and the old packaging flags below were retired on 2026-11-10. Use [the current release steps](first-rust-release.md) for executable commands.

Scope: [Ameow #33 Stage B](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6722184278), on the accepted, uncommitted Stage A foundation. Public distribution Gate B remains blocked. See [Stage A](application-update-stage-a.md) for the signed package, Launcher, ownership and rollback contracts.

## Shared policy and settings

`app_update::service::Handle` owns one background checker and one shared view. About, the Full status popover and the tray summary send actions to that handle. The existing download command owner polls restart eligibility; network and signature/package work run outside GPUI. Application update state remains independent of media/runtime component updates.

Preferences are atomically persisted as `app-update-settings.json` beside the existing UI settings. Defaults are automatic checks on, background download on and idle restart off. Disabling checks pauses automatic download; manual check/download remain available. The dependent switch retains its previous value for later re-enabling. Failed persistence retains the previous effective preferences and displays a retry message; automatic work pauses conservatively while a save/read error remains.

The initial check delay is 30 seconds. Successful checks schedule the next check six hours later. Manual checks have a ten-second cooldown; failures back off from two minutes up to six hours. Metadata acquisition is limited to 16 KiB with bounded HTTPS redirects, 15-second connect and 30-second request timeouts. It uses the existing Windows proxy route, with no direct fallback after proxy failure. Only signed stable Windows x64 metadata for Ameow can produce a download candidate. Production trust is checked before network/fixture acquisition.

Disabling automatic acquisition immediately signals cancellation. Download, extraction and verification observe cancellation; a publication gate serializes cancellation with recording a fully verified pending release. Only after the installation transaction releases its state lock does the service publish Ready. A failed trial remains quarantined across background checks.

## Safe restart policy

Manual restart with existing work asks the user to wait or update later. Choosing wait starts the accepted Stage A drain: existing work continues and new work is refused. Choosing later can restore admission before stopping has begun. Repeated requests share the same restart owner. Normal exit still applies pending only on the next launch.

The [2026-11-09 instruction](https://github.com/Wutpeach/Ameow/issues/33#issuecomment-6730604432) replaces the former quiet-period policy. When enabled and a verified update is Ready, automatic restart begins as soon as Ameow has no pending/running business tasks and its resource barriers permit it. Windows input and ordinary Ameow interaction do not delay it. Queue safety includes pending preparation, preparation/component operations, Held/unknown cleanup, all job terminal/resource/slot/owner states and settings persistence. Candidate hashing occurs outside UI locks; settings and atomic queue admission are rechecked after hashing. Newly accepted work continues; a stop request is never treated as proof of resource release.

## UI and preview scenes

- Settings → About displays the real build version, check/download/verification/Ready/wait/failure/rollback states, manual actions, three keyboard-accessible preferences and save feedback. It uses the existing four-page sidebar and scrolling content.
- Full reuses the lower-left component status button and popover. Component failure retains priority; verified updates have a separate action. Checking/downloading do not produce a main-window reminder. Ready uses a static indication.
- Tray adds the attention-only update content within the top summary area, above the unchanged Open / Settings / Quit rows. Download and update actions have separate hit targets and keyboard choices; height changes are repositioned using the tray anchor and work area.

`scripts/preview-scenes.json` includes 23 app-update scenes: About states and Full/tray Ready, conflict, waiting and rollback. `--preview-english` complements the existing theme controls. Preview actions are disabled; previews demonstrate rendering, not safety execution.

## Explicit local native fixture

Build with `--features app-update-fixture`, debug assertions and `AMEOW_FIXTURE_BUILD_VERSION` set separately for 0.2.0 / 0.2.1 / 0.2.2 / 0.2.3. Copy EXEs to a new directory as `Ameow-<version>.exe`, with `AmeowLauncher.exe` and `app_update_fixture.exe`. These are signed local test identities, never releases.

`scripts/test_app_update_ui_native.ps1` accepts Prepare / Launch / Inspect / Source. Prepare refuses existing install/evidence directories. Only the initial version is placed in the real test installation; subsequent packages are signed in separate fixture roots and placed in `incoming/` for the real checker/downloader/verifier. Launch uses the Stage A Medium LUA token helper; Inspect records and checks the actual process token, version and executable. Source selects 0.2.1, intentionally non-Ready 0.2.2, or 0.2.3.

~~~powershell
./scripts/test_app_update_ui_native.ps1 -Action Prepare `
  -BinaryDirectory <absolute-binaries> -InstallDirectory <new-install> -EvidenceDirectory <new-evidence>
./scripts/test_app_update_ui_native.ps1 -Action Launch `
  -BinaryDirectory <absolute-binaries> -InstallDirectory <new-install> -EvidenceDirectory <new-evidence>
~~~

The obsolete quiet-period fixture parameter has been removed. Native automatic-restart evidence now uses the same task/resource rule as ordinary builds, without a test timer. Earlier three-second/five-minute evidence remains historical and does not establish the new rule.

`ui-control.json` accepts `{"step":1,"surface":"about"}` or `tray`. This debug-only control opens a real GPUI surface after Launcher acceptance; it does not trigger update actions. When Explorer's tray is unavailable it provides an explicit screen-edge fixture anchor, allowing actual popup keyboard/mouse actions. That fallback does not verify system icon discovery or real icon anchoring. User actions still traverse the shared service, signature validation, queue ownership, actual process exit and Launcher.

For genuine media evidence, Launch also accepts an absolute `-RuntimeDirectory` and `-MediaFixturePort`. The debug-only proxy route applies only to the three fixed `http://example.com/ameow-issue33-{1,2,3}.mp4` fixture origins and requires `--app-update-fixture-dir`; ordinary builds do not contain this branch. The local-only `scripts/test_app_update_media_server.py` serves a generated HLS master/segments (the response MIME identifies HLS), rejects other paths and never forwards traffic. Production URL checks, real yt-dlp/ffmpeg/ffprobe, verification and delivery stay active. No Windows proxy setting changes.

Generate `source.mp4` with H.264 video and AAC audio, remux it to `hls/index.m3u8` with local TS segments, and place a master in `master.m3u8` containing RESOLUTION/CODECS and `VARIANT` as its variant URI placeholder. Run `python scripts/test_app_update_media_server.py <evidence-root> [port] [stop-marker-name]`; read `server-port.json`. Write `release-1`, `release-2`, or `release-3` to finish the corresponding gated transfer. These are network test gates, not update-idle timers. The evidence directory must be fresh for each run.

`ui-control.json` can admit a real media task through the existing command boundary using `{"step":2,"surface":"submit","version":"0.2.0","url":"http://example.com/ameow-issue33-1.mp4"}`. The target build version is required to prevent replay after switching. This is test admission, not clipboard UX evidence; restart/wait/later actions must still use actual GPUI input. Replace the request with an About/tray surface before switching when using earlier fixture binaries.

## Verification boundaries

See [the Stage B report](evidence/issue33/stage-b-report.md) for commands, results, screenshots and process evidence. Production public keys remain empty and ordinary builds return `E_APP_UPDATE_TRUST_NOT_CONFIGURED`. No production private key, unsigned update path, public Release, commit, push, merge or Issue closure is part of this stage.

The [2026-11-09 revision report](evidence/issue33/stage-b-revision-20261109.md) records the current no-timer rule, genuine media results, shell permission/anchor diagnostics and the remaining system-icon input gap. The original report remains historical.

Remaining release work includes production signing/key rotation and signed HTTPS assets, licensing Gate B, clean standard-user installation, actual login/reboot, mixed DPI, real concurrent media downloads, power/disk fault handling, Launcher self-update and version/staging cleanup policy. Authenticode is optional for the first Rust release; Ed25519 update authorization remains mandatory.
