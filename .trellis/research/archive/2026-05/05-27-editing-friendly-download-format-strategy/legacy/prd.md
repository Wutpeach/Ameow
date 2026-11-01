# Research editing-friendly download format strategy

## Goal

Research and define a better default download format strategy for video workflows that need both:

- fast downloads at the requested quality tier; and
- broad editing-software compatibility across After Effects, Premiere Pro, DaVinci Resolve, and similar tools as the default output promise.

This task started as a prerequisite research task. After the product direction was reviewed, the user approved continuing into a first low-risk implementation slice that adds regression coverage and improves mux-stage copy without changing runtime format selectors, transcode behavior, or queue/event ordering.

## Requirements

- Reframe the current "AE Friendly" concept into a broader "editing-friendly" model that recognizes AE as the strictest common consumer, while still considering Premiere Pro and DaVinci Resolve.
- Treat editing-compatible output as the default product promise, not as an alternate output mode.
- Distinguish between:
  - upstream media shape exposed by each site/downloader, such as complete muxed video files vs separate video-only/audio-only streams;
  - required post-processing, such as muxing, remuxing, audio transcode, or full video transcode;
  - avoidable post-processing that adds wait time without improving editing-software compatibility.
- Inventory the current Ameow behavior:
  - yt-dlp quality selectors for `best`, `balanced`, and `data_saver`;
  - yt-dlp merge behavior and why `balanced` can still spend time in merge;
  - post-download probe/transcode decisions in `src/electron-runtime/transcode.ts`;
  - gallery-dl role in the sidecar-first architecture and where it can or cannot influence video format.
- Research external constraints from primary/official sources where possible:
  - supported import formats/codecs for After Effects, Premiere Pro, and DaVinci Resolve;
  - yt-dlp format selector, format sorting, and merge-output semantics;
  - gallery-dl video handling and any ytdl-backed format controls.
- Empirically inspect representative Bilibili and YouTube `yt-dlp -F` / `--print before_dl` outputs to learn whether the selected formats are muxed files or separate video/audio streams.
- Produce a recommendation matrix that compares candidate strategies by:
  - download speed;
  - local merge/remux/transcode time;
  - final file size;
  - import reliability in AE/Premiere/Resolve;
  - quality preservation;
  - implementation complexity.
- Identify telemetry or local experiments needed before implementation, such as representative Bilibili/YouTube samples, selected format ids, output codecs, merge time, remux/transcode time, and import compatibility.
- Keep high-blast-radius implementation out of scope for this task:
  - no yt-dlp selector changes;
  - no transcode runtime behavior changes;
  - no `video-download-complete` event-ordering changes.
- Allow the approved first implementation slice:
  - compatibility decision regression tests;
  - mux/progress status regression tests;
  - merge-stage locale copy that clarifies audio/video muxing.

## Acceptance Criteria

- [x] `research.md` documents the current Ameow download/format/transcode chain and explains why `balanced` can still require long merging.
- [x] `research.md` summarizes editing-software format compatibility using cited official or primary sources where possible.
- [x] `research.md` summarizes yt-dlp and gallery-dl format-selection capabilities and limitations.
- [x] The task identifies candidate default editing-compatible selector/transcode strategies that reduce unnecessary waiting without changing the default output promise.
- [x] The task lists implementation risks and validation experiments for the later optimization task.
- [x] The first implementation slice adds tests and mux-stage copy only, without runtime selector/transcode/event-order changes.

## Notes

- Current user feedback: the default output should remain suitable for editing software, but daily download efficiency matters; the user wants the required quality as quickly as practical without unnecessary processing.
- Current terminology concern: "AE Friendly" is too narrow and should likely become "editing-friendly" or "compatible with editing software", with clearer explanation of speed trade-offs.
- Important clarification: this task is not about adding a separate output-mode switch. It is about understanding upstream site/downloader media shapes and optimizing the default editing-compatible chain.
- Product decision from 2026-05-27: accept necessary muxing when sites provide separate audio/video streams, but avoid any extra remux/transcode after muxing if the result already probes as `MP4 + H.264 + AAC`; also make the UI wording distinguish "merging audio/video" or "packaging MP4" from a stalled download.
- Related project spec: `.trellis/spec/guides/video-download-patterns.md`.
