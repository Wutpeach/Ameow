# Tune FFmpeg Parameters For Highest-Quality Transcode Output

## Goal
Improve the visual quality of FlowSelect's "highest" download mode after compatible MP4 transcoding, while preserving the current AE-safe output contract and the existing download/transcode queue behavior.

## Requirements
- Replace the current full-transcode "use encoder defaults" behavior with explicit encoder-specific FFmpeg quality parameters.
- Keep the current output compatibility contract for the transcode queue:
  - MP4 container
  - H.264 video
  - AAC audio
  - `+faststart`
- Preserve the current no-reencode branches when they are already sufficient:
  - remux-only for `mp4 + h264 + aac`
  - audio-only transcode when video is already `h264`
- Keep the current encoder fallback order on Windows unless a concrete compatibility issue requires change:
  - `h264_nvenc`
  - `h264_qsv`
  - `h264_amf`
  - `libx264`
- Add or retain backend logging that makes encoder selection, parameter strategy, and hardware-to-CPU fallback diagnosable without logging sensitive data.
- Do not change current queue/event semantics for:
  - `video-download-complete`
  - `video-transcode-*`
  - transcode queue concurrency and retry/remove flows
- Do not reduce output resolution or frame rate unless the source itself requires it for compatibility.
- Treat source selection and URL candidate ranking as out of scope for this task; this task is about transcode quality after the source file is already downloaded.

## Acceptance Criteria
- [ ] `normalize_video_output_for_ae(...)` no longer relies on bare encoder defaults for full video transcode.
- [ ] Each supported encoder path uses an explicit quality strategy appropriate to that encoder family.
- [ ] Hardware encoder failure still falls back to CPU `libx264` without breaking the transcode queue.
- [ ] Remux-only and audio-only paths remain available and do not regress into unnecessary full re-encode.
- [ ] Output remains AE-safe and compatible with the current "Compatible MP4 ready" flow.
- [ ] Existing transcode/download event payload shapes and ordering remain unchanged.
- [ ] Backend builds cleanly with `cargo check`.
- [ ] A manual sample transcode confirms the new output is visibly closer to the source than the current default-parameter path.

## Technical Notes
- User-provided comparison evidence to preserve in problem framing:
  - CapCut/Jianying output sample: `2880x1440`, total bitrate about `1709 kbps`
  - FlowSelect output sample: `3840x1920`, total bitrate about `2692 kbps`
  - FlowSelect's output carries about `1.78x` as many pixels as the CapCut sample, but only about `1.58x` the total bitrate.
  - If frame rates are otherwise comparable, that implies lower bitrate density per pixel for the FlowSelect output, which can make it look softer even when total bitrate is higher.
  - FlowSelect currently fixes transcoded audio to `AAC 320k`, so total bitrate comparisons overstate how much bitrate is actually available to the video stream.
- Working design hypothesis:
  - The user-visible softness is likely caused more by insufficient video bitrate density and default encoder decisions at the chosen output resolution than by raw total bitrate alone.
  - Preserving a larger output frame size without explicit quality control can produce worse subjective clarity than a smaller output with a better tuned encode.
- Current full-transcode construction lives in `src-tauri/src/lib.rs` inside `normalize_video_output_for_ae(...)`.
- Current full-transcode FFmpeg args are effectively:
  - `-c:v <encoder>`
  - `-pix_fmt yuv420p`
  - `-c:a aac -b:a 320k`
  - `-movflags +faststart`
- Current implementation does not set explicit video quality controls such as `-crf`, `-cq`, `-qp`, `-preset`, `-profile:v`, `-rc-lookahead`, or adaptive quantization knobs.
- Windows currently prefers hardware encoders first, so tuning must not assume one generic parameter set works for `nvenc`, `qsv`, `amf`, and `libx264`.
- Candidate tuning direction to evaluate during implementation:
  - `libx264`: explicit `preset`, `crf`, and `profile:v`
  - `h264_nvenc`: explicit `preset`, rate-control mode, `cq`, lookahead, AQ, and profile
  - `h264_qsv`: explicit preset/quality path using QSV-supported options
  - `h264_amf`: explicit quality/rate-control path using AMF-supported options
- Implementation should explicitly evaluate whether "keep source resolution at all costs" is appropriate for highest-quality compatible MP4 output, or whether a quality-preserving resolution cap/downscale path is needed when bitrate density would otherwise collapse.
- `yuv420p` is likely still required for compatibility and should be treated as compatible-by-default unless testing proves a better safe alternative.
- If implementation introduces new persisted settings, command/event fields, or frontend-visible transcode states, update `.trellis/spec/backend/type-safety.md` before or during implementation.
- Research note: `ace-tool` was unavailable in this session, so repository research used focused `rg` fallback plus direct file inspection.
