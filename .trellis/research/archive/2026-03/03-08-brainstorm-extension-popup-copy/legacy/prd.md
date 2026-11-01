# brainstorm: slim extension popup copy

## Goal

Reduce information density in the browser extension popup so it feels compact, refined, and intentional. The popup should show only essential information in the interface, while longer explanations move to a separate usage guide/document.

## What I already know

* The current popup includes several long explanatory strings in the header, connection card, quality section, and AE-friendly toggle section.
* The current popup structure is in `browser-extension/popup.html`, `browser-extension/popup.js`, and `browser-extension/popup.css`.
* The user's priority is not adding features; it is trimming copy and reducing visual bloat while preserving clarity.
* The user plans to create a separate usage document, so the popup no longer needs to teach every feature inline.
* The current popup repeats guidance in multiple places:
  * header subtitle explains what the popup is for
  * offline card explains how to reconnect in two different sentences
  * quality section explains routing behavior in a long hint
  * AE-friendly section explains both purpose and performance tradeoff, then repeats state in a full sentence

## Assumptions (temporary)

* We should preserve the current functionality, but compress copy aggressively.
* We should keep enough text for first-use comprehension without requiring the external guide for basic operation.
* The direction is now `Hybrid`: the interface keeps only short helper text, while detailed explanations move out of the popup.
* The AE-friendly toggle should be visually normalized to the existing FlowSelect popup language instead of looking like a generic foreign control.
* The preferred clarity level is `minimal but understandable`: each major area may keep a very short cue, but long explanatory copy should be removed.

## Open Questions

* None currently.

## Requirements (evolving)

* Identify the most suitable impeccable skills for reducing popup verbosity and improving compactness.
* Keep the popup visually small and polished.
* Remove redundant explanatory text and repeated state messages.
* Preserve essential meaning for connection status, quality selection, and AE-friendly toggle.
* Use a hybrid copy strategy: short inline cues only, with no long explanatory blocks in the popup.
* Restyle the AE-friendly toggle so it matches the current FlowSelect popup design language.
* Use a medium-scope pass: keep the current feature set, but also tighten header/status hierarchy and spacing.
* Keep the popup minimally self-explanatory for first use, rather than fully label-only.
* Keep the only remaining functional guidance in the status area, not the header.

## Acceptance Criteria (evolving)

* [ ] A clear skill recommendation is chosen for this refinement task.
* [ ] The target popup copy style is defined as hybrid before implementation.
* [ ] The reduced-copy direction still leaves the popup understandable at a glance.
* [ ] The AE-friendly toggle no longer feels visually inconsistent with the rest of the popup.
* [ ] The medium-scope pass improves compactness beyond copy-only cleanup.
* [ ] Each major area keeps at most a very short cue rather than a paragraph-length explanation.
* [ ] Header becomes cleaner by removing the explanatory subtitle burden.

## Definition of Done (team quality bar)

* Requirements clarified before implementation
* Lint / typecheck / verification still expected once implementation begins
* Any resulting cross-layer or UI behavior changes documented if needed

## Out of Scope (explicit)

* Rebuilding the popup from scratch
* Adding the external usage guide in this brainstorm task
* Changing extension download logic or websocket behavior

## Technical Notes

* Inspected files:
  * `browser-extension/popup.html`
  * `browser-extension/popup.js`
  * `browser-extension/popup.css`
* The biggest density issue is stacked helper copy, not control count.
* Most relevant available skills from the current skill list appear to be:
  * `distill`
  * `clarify`
  * `normalize`
  * `polish`
  * optionally `critique`
* Chosen scope direction:
  * `Hybrid` copy strategy
  * `Medium` simplification pass
  * `Minimal but understandable` guidance level
  * Remaining single usage hint lives in the status card, not the header
* Working skill sequence:
  * `distill` to remove repeated and non-essential popup copy
  * `clarify` to rewrite what remains into short, precise microcopy
  * `normalize` to restyle the AE toggle so it belongs to the existing FlowSelect popup system
  * `polish` for spacing, hierarchy, and small visual corrections after the copy reduction
