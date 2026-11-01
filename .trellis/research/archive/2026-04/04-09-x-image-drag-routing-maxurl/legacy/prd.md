# Fix X Image Drag Routing And Enhance Maxurl

## Goal
Fix X image drag handling so dragged images are routed through the image download path instead of the video download path, and improve X image URLs to request the highest available quality when possible.

## Requirements
- Detect dragged X media correctly and classify image payloads into the image download branch.
- Preserve existing X video drag behavior.
- Upgrade X image URLs to a higher quality variant when a deterministic maxurl-style enhancement is available.
- Keep the change scoped to X/Twitter drag handling and shared media URL resolution code that is directly involved.

## Acceptance Criteria
- [ ] Dragging an image from X no longer triggers the video download flow.
- [ ] Dragging a video from X still triggers the video download flow.
- [ ] X image URLs are normalized to a higher quality form before download when supported.
- [ ] Lint and type checks pass.

## Technical Notes
- Likely spans browser extension drag payload generation and desktop-side media routing.
- Reuse existing high-quality media URL upgrade patterns from other sites where possible.
