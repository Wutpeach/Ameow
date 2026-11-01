# Core UI Design Audit

## Anti-Patterns Verdict

Pass with caveats. The app does not read as generic AI UI, because the floating-window form factor and compact neon utility styling are specific. The main problems were systemic consistency issues: token drift, repeated hard-coded accent values, and small utility controls relying on ad-hoc hover styling.

## Executive Summary

- Critical: 0
- High: 3
- Medium: 5
- Low: 3

Top issues before this pass:

1. Shared UI primitives and page-level controls mixed token-based theming with raw hex values.
2. Settings repeated the same field/selection patterns without systemizing them.
3. Main-window utility controls depended on DOM style mutation instead of state-driven UI.

## High-Severity Findings

### 1. Theme token drift across shared controls

- Location: `src/components/ui/*`, `src/pages/SettingsPage.tsx`
- Category: Theming / System consistency
- Impact: Repeated raw accent/danger values make the app harder to maintain and easier to visually drift over time.
- Recommendation: Create semantic accent, danger, field, and utility-control tokens in `ThemeContext` and consume them from shared UI.
- Suggested commands: `/extract`, `/normalize`

### 2. Settings reused patterns without shared recipes

- Location: `src/pages/SettingsPage.tsx`
- Category: Hierarchy / System consistency
- Impact: The screen felt assembled from repeated one-off style blocks, which weakens rhythm and makes future edits risky.
- Recommendation: Standardize section labels, field surfaces, segmented options, nested labels, and panel cards.
- Suggested commands: `/polish`, `/extract`

### 3. Utility controls were visually correct but implemented unsafely

- Location: `src/App.tsx`, `src/pages/SettingsPage.tsx`
- Category: Interaction / Code quality
- Impact: Hover feedback depended on direct DOM mutation, which is brittle and breaks the intended React pattern.
- Recommendation: Replace direct DOM style mutations with state-driven styles.
- Suggested commands: `/polish`, `/harden`

## Medium-Severity Findings

### 4. Danger and loading states were not consistently tokenized

- Impact: Update dots, spinners, and destructive affordances looked related but were not defined as one system.

### 5. Context menu looked adjacent to, not part of, the same surface system

- Impact: It worked, but its border and hover treatment were looser than the main surfaces.

### 6. Shared toggle animation used layout movement

- Impact: Small, but avoidable; transform-based motion is more robust.

### 7. Settings hierarchy was readable but slightly noisy

- Impact: Repeated labels and boxes competed for attention instead of following a stable rhythm.

### 8. Legacy shared components were partially disconnected from current theme semantics

- Impact: Future reuse would spread more inconsistency unless corrected now.

## Low-Severity Findings

### 9. Some inactive/demo components still contain hard-coded dark values

- Location: `Sidebar`, `MaterialGrid`
- Impact: Not user-critical for this task, but worth revisiting if those surfaces become active.

### 10. Main-window accent rendering still contains intentional hard-coded glow values

- Impact: Acceptable for now because these are part of a bespoke effect, not a reusable control primitive.

### 11. Typography remains functional rather than distinctive

- Impact: Acceptable for current scope because this pass is polish, not a broader rebrand.

## Positive Findings

- The app already had a coherent compact-product shape and recognizable interaction density.
- Queue badge, floating window framing, and gradient surfaces provided a usable design foundation.
- ThemeContext already existed, making semantic token extraction feasible without architectural churn.

## Recommendations by Priority

1. Immediate: consolidate semantic tokens and shared control states.
2. Short-term: refactor Settings into reusable section/field/selectable patterns.
3. Medium-term: document the resulting design language in frontend spec.
4. Long-term: decide whether inactive shared/demo surfaces should be aligned or removed.
