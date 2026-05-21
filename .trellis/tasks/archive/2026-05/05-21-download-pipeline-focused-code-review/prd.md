# Download pipeline focused code review

## Goal

Produce a professional, evidence-based review of Ameow's download pipeline, from browser-extension video selection through Electron IPC/WebSocket bridging, runtime queue orchestration, executor dispatch, runtime dependency checks, progress events, cancellation, and terminal completion.

## Requirements

- Review is read-only by default. Do not modify production code unless the user explicitly asks for follow-up fixes.
- Findings must cite concrete files and line numbers.
- Findings must explain root cause, impact, and priority.
- Review must cover correctness defects, code smells, maintainability/readability risks, performance/resource risks, and test coverage gaps.
- Review must check the implementation against the relevant Trellis contracts for:
  - Electron download command bridge.
  - Electron download runtime core.
  - Runtime dependency/bootstrap behavior.
  - Direct download onboarding and provider routing.
  - Frontend command/event type safety where download UI surfaces are involved.
- Review scope includes:
  - Browser extension selection and detector routing.
  - Electron WebSocket/IPC command bridge.
  - Runtime command router and download queue service.
  - Site/provider planning and engine orchestration.
  - yt-dlp, gallery-dl, direct download, Douyin, transcode, and process runner executors.
  - Runtime path and dependency gate helpers.
  - Adjacent tests that should catch cross-layer regressions.

## Acceptance Criteria

- [ ] Final report is written in Chinese.
- [ ] Findings are ordered by severity/priority.
- [ ] Each high-confidence finding includes file, line, root cause, impact, and concrete remediation.
- [ ] Report distinguishes confirmed defects from lower-confidence risks or test gaps.
- [ ] Report includes prioritized improvement recommendations.
- [ ] No production code is changed as part of the review task unless separately approved.

## Notes

- This task follows the user's request for a focused download-chain audit after the broader project review.
- After the review report, the user explicitly requested direct fixes for the confirmed findings. Production code changes are therefore in scope for the follow-up repair step.
