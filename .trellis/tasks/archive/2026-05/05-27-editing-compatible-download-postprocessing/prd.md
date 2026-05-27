# Optimize editing-compatible video download post-processing

## Goal

Add observability and audit coverage for Ameow's editing-compatible video download chain so the next selector/transcode optimization can be based on local evidence instead of assumptions.

This task follows `.trellis/tasks/archive/2026-05/05-27-editing-friendly-download-format-strategy`, which established the product direction:

- Default output remains editing-compatible for After Effects, Premiere Pro, and DaVinci Resolve.
- Necessary yt-dlp muxing is acceptable when sites expose separate video-only and audio-only streams.
- Do not sacrifice requested quality just to avoid mux.
- Avoid extra remux/transcode after yt-dlp mux if the final file probes as `MP4 + H.264 + AAC`.
- Keep `video-download-complete` as the source-media completion event; downstream compatibility conversion remains a transcode queue concern.

## Requirements

- Add bounded debug/telemetry evidence for yt-dlp-backed downloads, enough to distinguish:
  - quality tier requested;
  - resolved site/provider;
  - format profile/merge-output profile used;
  - final source path/container/codec probe summary;
  - compatibility decision: skip, remux-only, audio-transcode, full-transcode, or probe-failure fallback;
  - elapsed time for download-side mux and downstream compatibility preparation where currently measurable.
- Audit probe-failure behavior in `prepareVideoTranscodeTaskFromDownload(...)`:
  - document the current conservative `full_transcode` fallback;
  - decide whether the first implementation should preserve it, add clearer logging, or introduce a safer bounded heuristic;
  - do not silently skip compatibility conversion on probe failure.
- Add tests that protect the evidence/logging and probe-failure decision boundary without requiring real network downloads.
- Preserve current yt-dlp quality selectors in this task.
- Preserve current queue/event ordering in this task.
- Keep logs safe:
  - no raw cookies;
  - no long unbounded URLs;
  - no full local paths in high-level telemetry unless an existing debug trace already includes them for support purposes.
- Prefer extending the existing structured download telemetry path over adding a separate ad-hoc log stream:
  - existing source: `src/download-capabilities/telemetry.ts`;
  - existing sink: `src/electron-runtime/downloadTelemetry.ts`;
  - existing runtime hook: `AmeowElectronDownloadRuntime.recordDownloadTelemetry(...)`.
- Audit existing timing/debug logs in `src/electron-runtime/service.ts` and `src/electron-runtime/ytDlpDownload.ts` for raw URL/path exposure, and tighten only where it is directly related to this task's evidence surface.

## Acceptance Criteria

- [x] Runtime logs or telemetry can show whether a completed source skipped conversion because it probed as editing-compatible.
- [x] Runtime logs or telemetry can show when a file entered remux-only, audio-transcode, full-transcode, or probe-failure fallback.
- [x] The evidence surface is structured enough to support later local reports without scraping free-form status text.
- [x] Probe-failure behavior is explicitly tested or documented with the chosen conservative behavior.
- [x] Existing raw URL/path logging touched by this work is bounded or replaced with safer identifiers where practical.
- [x] No yt-dlp format selector changes are made.
- [x] No `video-download-complete` event-ordering changes are made.
- [x] Focused tests, `npm run type-check`, and `npm run lint` pass before implementation is reported complete.

## Notes

- This is an evidence-building implementation task, not the selector optimization task.
- The selector optimization should be a later task after this one can report real selected formats and compatibility decisions.
- Follow-up risk from Claude review on the prior task: `DownloadProgressPayload.speed` is overloaded as both network speed and activity token. If richer mux stages are added, clean up that implicit contract instead of layering more meanings into `speed`.
