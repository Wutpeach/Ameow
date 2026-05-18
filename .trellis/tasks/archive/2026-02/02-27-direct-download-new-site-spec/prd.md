# Add Direct-Download New-Site Onboarding Spec

## Goal
Define an executable code-spec so future "new direct-download site" requests can be implemented consistently, including button injection and direct URL parsing contracts.

## Requirements
- Add a dedicated code-spec document for direct-site onboarding under backend specs.
- Include explicit cross-layer contracts: extension detector, background payload, backend router/direct downloader.
- Include concrete implementation templates for button injection and candidate extraction.
- Include validation/error matrix, Good/Base/Bad cases, required tests, and Wrong vs Correct examples.
- Link the new code-spec from backend index.
- Keep existing video download guide aligned by referencing the new onboarding contract.

## Acceptance Criteria
- [x] New code-spec file exists with mandatory sections (Scope/Signatures/Contracts/Matrix/Cases/Tests/Wrong-vs-Correct).
- [x] Spec includes a reusable detector template covering button injection + candidate parsing.
- [x] Spec includes backend routing integration checklist for adding a new direct site.
- [x] `.trellis/spec/backend/index.md` includes the new spec.
- [x] `.trellis/spec/guides/video-download-patterns.md` points to the new onboarding spec.

## Technical Notes
- This task updates specs only; no runtime behavior changes.
- The contract should preserve current `video_selected` backward compatibility.
