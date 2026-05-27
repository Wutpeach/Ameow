# Research: Editing-Friendly Download Format Strategy

## Starting Point

The current product model has three quality tiers (`best`, `balanced`, `data_saver`) plus a legacy concept described as "AE Friendly". That language is too narrow. The practical target is broader editing-software compatibility, with After Effects treated as the strictest common target because users have seen downloaded videos fail to import into AE.

The user's newer product priority is also clear: the default output should remain editing-compatible, but daily downloads should not spend a long time on avoidable processing. The desired default should get the requested-quality, editing-compatible video as quickly as practical.

Clarification from 2026-05-27: this task is not about adding an output-mode switch. The default output mode remains editing-compatible. The research must focus on what yt-dlp/gallery-dl actually receive from sites like Bilibili and YouTube, whether those formats are already muxed or split into video-only/audio-only streams, and how Ameow can minimize unnecessary merge/remux/transcode time while preserving the editing-compatible default.

## Source Notes

Primary/near-primary references consulted during this planning pass:

- yt-dlp README format selection documentation: describes `/` fallback selectors, `+` multi-format selectors, default high-quality behavior, and `--merge-output-format`.
- gallery-dl configuration documentation: gallery-dl can integrate with ytdl-style downloaders for some extractors/configurations, but Ameow's current architecture treats gallery-dl as provider-specific extraction rather than the primary controllable video format selector.
- Adobe After Effects supported file formats documentation: lists MPEG-4/MP4, H.264, H.265/HEVC in specific containers, ProRes, DNxHD/DNxHR, and other professional formats; it does not list WebM, VP9, or AV1 as supported import formats.
- Adobe Premiere Pro supported file formats documentation: lists MP4, H.264 AVC, HEVC/H.265, DNxHD/DNxHR, MOV, MXF, and other professional formats; it does not list WebM, VP9, or AV1 as supported import formats.
- Blackmagic DaVinci Resolve 19 supported codec list: lists broader modern codec/container support than Adobe, including H.264/H.265 in MP4/MOV/MKV, VP9 in MOV/MP4/MKV, AV1 in MOV/MP4/MKV, AAC/M4A, and Opus in MOV/MP4.

## Current Ameow Chain

### yt-dlp Format Selection

Current selectors live in `src/electron-runtime/engineManifest.ts`.

- `best` uses `bestvideo+bestaudio/best`, sorted by resolution and codec/container preferences, and allows `--merge-output-format mp4/mkv`.
- `balanced` prefers exact 1080p MP4/H.264 video plus M4A/AAC audio, then falls back through 1080p/<=1080p MP4 options, then broader MP4 and finally `best`.
- `data_saver` prefers 360p or lower MP4/M4A options before falling back.

Important implication: `balanced` is not "no merge". It often selects separate DASH video and audio streams such as `bv*[height=1080][ext=mp4]+ba[ext=m4a]`. yt-dlp must then invoke FFmpeg to mux them into a single MP4. For long or high-bitrate videos, this can spend noticeable time in local disk I/O even though network download is finished.

Local spot checks with `yt-dlp 2026.03.17` support this:

| Site | URL | Observed selected format with current balanced-style selector | Shape |
|---|---|---|---|
| YouTube | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `137+140`, MP4, 1920x1080, `avc1.640028` + `mp4a.40.2` | separate video-only + audio-only; requires mux |
| Bilibili | `https://www.bilibili.com/video/BV1jxaXeUEGG/` | `30032+30280`, MP4, 852x480, `avc1.640033` + `mp4a.40.2` | separate video-only + audio-only; requires mux |
| Bilibili | `https://www.bilibili.com/video/BV1c341157dD/` | `30032+30280`, MP4, 852x480, `avc1.64001F` + `mp4a.40.2` | separate video-only + audio-only; requires mux |

The Bilibili examples were anonymous-access checks. yt-dlp reported that higher qualities such as 720p/1080p/4K were missing without authenticated cookies for these samples. Logged-in cookies may expose additional formats, but Bilibili still commonly exposes DASH-like separated audio/video formats for higher quality.

### Selector Experiment Matrix

Local commands used `yt-dlp 2026.03.17`, `--skip-download`, `--ignore-config`, and `--print before_dl:...`. They did not download media.

| Site | Sample | Selector intent | Result | Interpretation |
|---|---|---|---|---|
| YouTube | `dQw4w9WgXcQ` | yt-dlp broad best: `bestvideo+bestaudio/best` | `401+251`, WebM, 2160p, AV1 + Opus | Best quality is not editing-compatible without full transcode/remux strategy; uses split streams. |
| YouTube | `dQw4w9WgXcQ` | complete MP4 only: `best[ext=mp4]/best` | `18`, MP4, 360p, H.264 + AAC | Complete MP4 exists but only low quality; using it would violate balanced/high-quality intent. |
| YouTube | `dQw4w9WgXcQ` | current balanced-style selector | `137+140`, MP4, 1080p, H.264 + AAC | Good editing-compatible target, but split streams require mux. |
| YouTube | `jNQXAC9IVRw` | H.264 MP4 + AAC/M4A first | `18`, MP4, 240p, H.264 + AAC | Very old/low-res sample has only low complete MP4; no useful high-tier mux avoidance. |
| Bilibili | `BV1jxaXeUEGG` | yt-dlp broad best | `30033+30280`, MP4, 852x480, HEVC + AAC | Best available anonymous stream can choose HEVC, which is less safe for AE-style compatibility. |
| Bilibili | `BV1jxaXeUEGG` | current balanced-style selector | `30032+30280`, MP4, 852x480, H.264 + AAC | Good compatibility target, but split streams require mux. |
| Bilibili | `BV1c341157dD` | current balanced-style selector | `30032+30280`, MP4, 852x480, H.264 + AAC | Same pattern: compatible after mux, not pre-muxed. |
| Bilibili | `BV1jxaXeUEGG` | complete MP4 only: `best[ext=mp4]/best` | extractor reported no usable video formats | Complete-MP4-only strategy is not reliable for Bilibili. |
| Bilibili | `BV1c341157dD` | complete MP4 only: `b[ext=mp4]/best[ext=mp4]/best` | requested format unavailable | Complete-MP4-only strategy is not reliable for Bilibili. |

Early conclusion: for YouTube and Bilibili, an editing-compatible default cannot generally avoid muxing at useful quality tiers. The key optimization target is not "avoid all merging"; it is "avoid unnecessary full transcode or second-pass remux after the required mux has already produced MP4/H.264/AAC", plus make the required muxing status clear.

### Progress Display

`src/electron-runtime/ytDlpProgress.ts` maps any yt-dlp line containing `merging` to `stage: "merging"`. When yt-dlp does not provide a percent for that line, the parser emits `percent: 100`.

This makes the UI look like it is stuck at 100% while "merging", even when the backend is actively muxing. That is a status precision issue, not necessarily a runtime hang.

### Post-Download Editing Compatibility

`src/electron-runtime/transcode.ts` probes completed files and currently treats `mp4 + h264 + aac` as safe enough to skip follow-up work.

If not safe:

- `h264 + aac` in a non-MP4 container -> remux only;
- `h264 + non-aac audio` -> copy video, transcode audio to AAC;
- non-H.264 video -> full transcode to H.264/AAC MP4 using `libx264` in current code.

This is compatibility-oriented, but full transcode is expensive. Future optimization should keep the editing-compatible default while avoiding full transcode when mux/remux/audio-only transcode is sufficient.

### gallery-dl Role

Project architecture uses gallery-dl for gallery/extractor-first sites and yt-dlp for dedicated video providers such as YouTube, Twitter/X, and Bilibili. gallery-dl is less of a general video format selector in Ameow's current chain; for many video cases it either retrieves site-provided assets or falls back/defers to yt-dlp-capable flows. Any future format strategy should treat yt-dlp as the primary controllable video format surface and gallery-dl as provider-specific.

## Editing Software Format Model

There are three separate concepts that product copy should not collapse:

1. Import-compatible: the editor can open the file.
2. Editing-friendly delivery: the file imports broadly and avoids common codec/container failures, while preserving reasonable download speed.
3. Timeline/intermediate-friendly: intraframe mezzanine codecs such as ProRes or DNxHR that edit smoothly but require heavy transcoding and much larger files.

Practical baseline for downloaded web video:

- MP4 container
- H.264/AVC video
- AAC audio
- yuv420p pixel format for broad compatibility

This is not the best timeline performance format, but it is the best compromise for web downloads when speed and file size matter.

### Can Editors Accept Other Site Formats?

Short answer: some can, but not as a safe default across After Effects + Premiere Pro + DaVinci Resolve.

| Format family often exposed by sites | Avoids mux? | After Effects | Premiere Pro | DaVinci Resolve | Default-policy implication |
|---|---:|---|---|---|---|
| Complete MP4, H.264 + AAC | Yes, if the site provides it | Supported baseline | Supported baseline | Supported baseline | Best no-mux option, but often only low quality on YouTube and unreliable/missing on sampled Bilibili. |
| Split MP4 video-only H.264 + M4A/AAC audio | No; needs mux | Final muxed MP4 supported | Final muxed MP4 supported | Final muxed MP4 supported | Current balanced target. Required mux is acceptable and often unavoidable. |
| WebM, VP9 + Opus | Maybe if already complete, but often split on YouTube | Not listed in Adobe AE supported formats | Not listed in Adobe Premiere supported formats | Resolve supports VP9 in MOV/MP4/MKV and Opus in MOV/MP4, but WebM itself is not the strongest common target | Not safe for default cross-editor compatibility. |
| AV1 + Opus/WebM or AV1 MP4 | Maybe if already complete, but often split | Not listed in AE supported formats | Not listed in Premiere supported formats | Resolve 19 lists AV1 in MOV/MP4/MKV | Not safe for AE/Premiere default. |
| HEVC/H.265 + AAC | Usually may still be split | AE support is narrower; documentation calls out HEVC in QuickTime MOV | Premiere supports H.265 media | Resolve supports H.265 with platform/edition caveats | Too risky as the default, especially because AE was the original failure case. |
| MKV with H.264/H.265/VP9 | Requires mux/remux from split streams | Not a reliable Adobe target | Not listed as Premiere import format | Resolve lists MKV with H.264/H.265/VP9 | Resolve-friendly, not Adobe-friendly. |

Important distinction: editor support for a codec/container does not remove the need to mux when the downloader receives separate video-only and audio-only streams. It only changes what container/codec Ameow can mux into. For the AE/Premiere/Resolve intersection, muxing split H.264 MP4 video + AAC/M4A audio into MP4 remains the safest strategy.

Therefore, "other formats" can reduce downstream full transcode in Resolve-only workflows, but they do not satisfy the current default product promise across all three editors. They may be useful as diagnostic data or an advanced future policy, not as the default.

Potential heavier output profile:

- ProRes 422 / ProRes 422 LT / DNxHR
- likely MOV or MXF/MOV depending on encoder/platform
- much larger files and unavoidable transcode time
- probably not appropriate as a default download behavior

## Downloader Capabilities To Verify Further

### yt-dlp

yt-dlp supports explicit format selectors (`-f`), format sorting (`--format-sort`), and merge container preference (`--merge-output-format`). It can select separate video/audio streams, which often maximizes quality but requires local merging.

Relevant upstream model:

- yt-dlp format selection uses `/` as fallback and `+` to combine multiple formats.
- A selector such as `bestvideo+bestaudio` downloads the best video-only format and best audio-only format, then muxes them with FFmpeg.
- Adaptive streaming sites commonly expose separate representations for video and audio. YouTube's public format lists usually show high-resolution video rows as `video only`, with separate `m4a`/`webm` audio rows. Bilibili format lists often show `audio only` plus `video only` rows as well, depending on login/account entitlement and the specific video.
- Therefore, for Bilibili/YouTube, "editing-compatible MP4" often still means "download split H.264 MP4 video + AAC/M4A audio, then mux to MP4". The merge step is structurally required unless a complete muxed MP4 exists at an acceptable quality tier.

Commands used for local spot checks:

```powershell
yt-dlp -F --no-warnings --ignore-config "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
yt-dlp -F --no-warnings --ignore-config "https://www.bilibili.com/video/BV1jxaXeUEGG/"
yt-dlp --skip-download --no-warnings --ignore-config -f "<Ameow balanced selector>" --print "before_dl:%(format_id)s|%(ext)s|%(resolution)s|%(vcodec)s|%(acodec)s" "<url>"
```

Observed YouTube shape:

- Low combined MP4 exists, for example format `18` at 360p with both H.264 video and AAC audio.
- Higher qualities are separate video-only rows, for example 1080p H.264 MP4 video format `137`, plus separate M4A audio format `140`.
- The current balanced-style selector selected `137+140`, which is editing-compatible after muxing but requires merge.

Observed Bilibili anonymous-access shape:

- Some samples only exposed low preview/anonymous tiers and reported that 720p/1080p/4K required authenticated cookies or premium access.
- Available formats often included separate M4A audio-only rows and MP4 video-only rows.
- The current balanced-style selector selected `30032+30280` in two samples, which is MP4/H.264 video plus M4A/AAC audio after muxing, but still requires merge.

Useful future investigation:

- For each target site, how often does a complete muxed MP4 (`b[...]` / `best[ext=mp4]`) exist at the desired tier?
- When a muxed MP4 exists, is it meaningfully lower quality than the split MP4 video + M4A audio pair?
- For editing-compatible default output, should selectors prefer:
  - split H.264 MP4 video + AAC/M4A audio, preserving quality but requiring mux; or
  - complete muxed MP4 when close enough in resolution/bitrate, avoiding mux wait?
- For Bilibili, what is the real availability of single-file 1080p MP4 vs DASH split streams across logged-in and anonymous sessions?
- Can `--print before_dl` capture selected format ids/codecs before download to support telemetry without simulate-mode pitfalls?

### gallery-dl

gallery-dl is primarily extractor/output orchestration rather than a universal video format optimizer. Research should confirm whether the relevant sites expose any gallery-dl options or ytdl integration hooks that let Ameow pass equivalent format preferences. If not, the strategy should document that gallery-dl outputs are provider-owned and post-download compatibility checks are the main control point.

Local CLI note: `gallery-dl` was not on PATH in this shell, so empirical gallery-dl video-format experiments were not run yet. The later task should either use Ameow's managed gallery-dl runtime path or inspect gallery-dl behavior through existing runtime tests/fixtures.

## Candidate Default Strategy Directions

### Direction A: Compatibility-Preserving Current Selector, Better Status

Keep current selectors mostly intact because they choose H.264 MP4 video + AAC/M4A audio before broader fallbacks. Improve status to say "merging audio and video" or "packaging MP4" rather than looking stuck at 100%.

Pros:
- Low risk to output compatibility.
- Explains the long merge without changing selected quality.

Cons:
- Does not reduce actual waiting time.

### Direction B: Prefer Close-Enough Muxed MP4 When Available

Keep the default editing-compatible promise, but teach selectors or site-specific strategy to prefer a complete muxed MP4 when it is close enough to the requested tier, falling back to split video/audio when the muxed option is missing or materially worse.

Pros:
- Can reduce merge wait for sites/videos that expose complete MP4 assets.
- Still outputs editing-compatible MP4/H.264/AAC when available.

Cons:
- Needs careful quality threshold definition.
- On YouTube, high-quality muxed MP4 is often unavailable above 360p, so benefit may be limited.
- On Bilibili, availability likely depends on login, membership, and extractor results.
- Early local samples show this can fail or degrade too far if applied naively.

### Direction C: Keep Split Streams But Optimize Post-Merge/Transcode

Accept that high-quality web video often arrives as separate streams. Focus optimization on not doing any extra post-merge work when the muxed result is already MP4/H.264/AAC, and avoid full transcode unless strictly required.

Pros:
- Preserves quality and compatibility.
- Targets the avoidable part of the pipeline.

Cons:
- Required mux time remains for split streams.

Recommended research direction: gather a real format availability matrix before choosing between Direction B and Direction C. The early evidence suggests YouTube high-quality outputs are typically split streams, and Bilibili often is too, so some merge time may be structurally unavoidable.

Updated recommendation after initial spot checks: Direction C is the safer default implementation direction. Keep selecting split H.264 MP4 video + AAC/M4A audio when that is the best editing-compatible quality tier, accept required muxing, and optimize around:

- no extra compatibility conversion when the muxed MP4 already probes as H.264/AAC;
- avoiding HEVC/AV1/VP9 for default editing-compatible output unless a later full transcode is explicitly acceptable;
- clearer UI/status for muxing vs network download vs post-download conversion;
- telemetry to measure actual merge/remux/transcode costs by site and selector.

Confirmed product direction from 2026-05-27:

- Default output remains editing-compatible across AE, Premiere Pro, and DaVinci Resolve.
- Necessary muxing is acceptable when the site/downloader exposes separate video-only and audio-only streams.
- The implementation should prevent extra remux/transcode after mux if the resulting file already probes as `MP4 + H.264 + AAC`.
- UI/status should make "merging audio/video" or "packaging MP4" explicit so users understand the app is doing local mux work, not stuck downloading.

Implications for the follow-up implementation task:

- Audit whether `video-download-complete` is currently emitted before or after compatibility follow-up, because the project spec and current runtime behavior may be out of sync.
- Add or verify tests for `prepareVideoTranscodeTaskFromDownload` returning `null` on muxed `MP4 + H.264 + AAC`.
- Add or verify tests that a yt-dlp `merging` line produces user-facing wording that describes packaging/muxing rather than a misleading 100% stuck state.
- Consider capturing selected format ids/codecs and final probe result in debug telemetry so future regressions can distinguish required mux from avoidable conversion.

## Validation Experiments For Later Task

- Collect representative URLs for Bilibili and YouTube across:
  - anonymous vs logged-in where relevant;
  - short vs long videos;
  - 1080p, higher-than-1080p, and fallback-limited videos.
- For each quality tier and candidate selector:
  - record selected format ids;
  - record container/video/audio codecs;
  - record download time;
  - record merge time;
  - record post-download remux/transcode time;
  - record final file size.
- Include at least these selector families:
  - current Ameow `best`, `balanced`, `data_saver`;
  - complete-MP4-only fallback, to quantify quality loss/failure rate;
  - H.264/AAC split-first selector, to quantify necessary mux cost;
  - broad yt-dlp best, to quantify how often it chooses HEVC/AV1/VP9/Opus and would require conversion.
- Import smoke tests:
  - AE import success;
  - Premiere import success;
  - DaVinci Resolve import success;
  - note whether playback/timeline is smooth enough for common use.
- UI/status tests:
  - distinguish network downloading from muxing;
  - avoid showing a static 100% progress bar during long merge;
  - show optional conversion as a separate, understandable phase.

## Resolved Product Question

The default should not sacrifice requested quality just to avoid mux. Necessary mux is acceptable. The optimization target is avoiding unnecessary extra processing after mux and explaining the mux stage clearly.
