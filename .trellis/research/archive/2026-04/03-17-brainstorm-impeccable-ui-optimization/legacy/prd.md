# brainstorm: optimize app ui with impeccable skills

## Goal

Design a practical skill-usage plan for improving the FlowSelect desktop UI with the installed impeccable skill set, while preserving the product's compact utility-focused identity and staying aligned with the repository's frontend design system.

## What I already know

* The project already has the impeccable skill group installed in `.agents/skills/`.
* The user wants a design optimization plan, not a blind full redesign.
* The user provided the impeccable cheatsheet content directly, including the recommended relationships between diagnostic, quality, intensity, adaptation, enhancement, and system commands.
* The user's core need is not a large-scale overhaul of every screen.
* The optimization target is specifically:
  * typography / layout detail refinement
  * better color pairing
  * improved interaction details
* The product is defined as a refined, compact, multi-purpose downloader.
* The user has now reviewed the first completed UI refinement round and provided six concrete follow-up correction items.
* These six items are second-round revision feedback on the just-modified version, not first-pass baseline requirements.
* They should be treated as binding iteration-two refinement requirements for the next implementation task.
* Core product interaction principles from the user:
  * operation should stay simple and convenient
  * information hints should stay restrained
  * the UI does not need to explain every button in detail
  * short, minimal guidance is preferred when copy is necessary
  * the interface should guide users through interaction design and visual cues rather than detailed textual explanation
  * the product should remain intuitive and easy to understand even with very little on-screen copy
* The main floating window and settings page must share a unified design language, so both surfaces need changes in the same pass.
* The app has two core desktop surfaces that matter most for UI optimization:
  * `src/App.tsx` - the main `200x200` transparent floating window
  * `src/pages/SettingsPage.tsx` - the settings window
* The repository design system explicitly says to preserve the current compact, tactile, gradient-based look instead of reinventing the aesthetic.
* The semantic theme/token source is `src/contexts/ThemeContext.tsx`.
* Shared UI primitives already exist in `src/components/ui/` (`NeonButton`, `NeonToggle`, `NeonFieldButton`, `NeonSection`, etc.).
* The main floating window already contains rich state handling, queue overlays, drag glow, and motion-heavy transitions.
* The settings page uses shared UI primitives in some places, but still includes page-local styling and repeated field patterns.
* The impeccable cheatsheet page was referenced, but static fetch currently exposes only a loading shell, so the installed local skill files are the reliable source for actual command behavior in this session.
* Iteration-two implementation has already landed in code for these items:
  * theme switch selected state was quieted
  * transcode-state queue button was made more theme-integrated
  * the `源素材已获取，已加入转码队列` notice was removed
  * transcode exit/cancel flow was added
  * queue popover heading was simplified to keep only `队列`
* The user has now reviewed that iteration-two build and reported four additional follow-up issues.
* The current theme-switch selected style is now the preferred design baseline for future selected / active button treatments in settings.
* The settings-page global-shortcut confirm button still uses the older glow-heavy `NeonButton` default treatment and now looks out of family with the newer restrained selected style.
* The main floating-window close button alignment issue is still not solved in the user's QA pass, even after the previous radius-based hover-background adjustment.
* The settings-page external-downloader cards still have layout defects, especially the `yt-dlp` card's update button, update-available dot, and `可更新到：{{version}}` status line alignment.
* The main floating window can still auto-collapse back to icon mode during download / transcode startup in some cases; the user's desired behavior is that any download/transcode task keeps the app in full floating-window mode until all tasks are settled.

## Assumptions (temporary)

* The first optimization target should be desktop UI only, specifically the main floating window and settings window as one paired system.
* The desired result is a phased workflow that can later be executed in implementation tasks, not a one-shot speculative redesign.
* The preferred direction is a refinement pass rather than a structural redesign.
* The first pass should strengthen clarity, consistency, and perceived quality before adding stronger expressive motion or decoration.

## Open Questions

* None currently blocking.

## Current Status

### Iteration-Two Items

* Completed in code:
  * theme switch selected state is quieter and edge-highlight based
  * transcode-state queue badge is less visually loud
  * the transcode handoff notice was removed
  * active transcode exit/cancel flow exists
  * queue heading duplication was reduced to `队列`
* Partially resolved and still failing visual QA:
  * main floating-window close button hover/background alignment

### Iteration-Three Follow-Up Scope

* Pending:
  * normalize the global-shortcut confirm button to the new restrained selected-state language
  * fix the close-button alignment issue for real, not only by changing radius
  * re-layout the external-downloader cards, especially the `yt-dlp` update cluster
  * fix the main-window auto-collapse bug so active/pending task states keep the full floating window open

## Requirements (evolving)

* Produce a staged impeccable skill usage plan tailored to FlowSelect.
* Map recommended skills to concrete UI problems in the current app.
* Respect existing repository constraints:
  * preserve the current product personality
  * use semantic tokens and shared UI primitives
  * keep motion compact and non-theatrical
* Identify which surfaces should be optimized first.
* Separate MVP optimization work from later polish/expressive passes.
* Treat the main floating window and settings page as a shared desktop design system problem, not two unrelated screens.
* Optimize typography, spacing rhythm, control hierarchy, color pairing, and interaction details.
* Keep the overall structure recognizable; avoid a large-scale layout or product-personality reset.
* Use an "elegant restrained" visual tone:
  * preserve the compact utility feel
  * reduce visual noise
  * improve rhythm and emphasis through typography, spacing, and state treatment
  * keep motion and accents subtle rather than theatrical
* Preserve the product's simple-and-convenient operating model.
* Keep information cues terse and restrained; prefer short supporting lines over detailed button explanations.
* Use interaction design, hierarchy, affordance, state styling, and feedback to teach the interface instead of explanatory text.
* If motion is adjusted, use the existing `motion/react` package and stay aligned with `.trellis/spec/frontend/motion-guidelines.md`.
* The main floating window top-right close button hover background must stay visually aligned with the actual button bounds; the hover background cannot appear offset from the circular control.
* The settings-page theme switch selected state must be quieter:
  * weaken or remove the current strong glow
  * keep a restrained edge highlight / border-based selected state
  * stay aligned with the chosen "elegant restrained" tone
* When the app enters transcode state, the queue button container color must integrate more cleanly with both black and white themes.
  * The queue button itself should become less attention-seeking during transcode.
  * Download/transcode differentiation should continue to rely primarily on the existing count plus colored status dots, not a loud badge container treatment.
* When a video enters transcode state, remove the transient summary copy `源素材已获取，已加入转码队列`.
  * The transcode shell treatment and amber progress feedback are already sufficient state communication.
* Add a transcode-state exit/cancel action analogous to the existing download cancel affordance.
  * Clicking it should let the user actively leave the current video's transcode flow.
  * Exiting should happen immediately without a secondary confirmation dialog.
  * Exiting should cancel the current video's transcode process and delete the MKV plus intermediate source files associated with that transcode flow.
* The queue detail page/popover must reduce redundant heading copy.
  * Keep only `队列`.
  * Remove `任务队列`.
  * Avoid duplicate title semantics that waste limited compact-surface space.
* The current settings theme-switch selected treatment is now the canonical selected-state recipe for restrained settings actions.
  * New button states on the same surface should prefer border / edge emphasis and compact surface contrast over large outer glow.
  * The first required follow-up is the global-shortcut confirm button, which should be brought into the same family as the theme switch instead of using the older glow-heavy primary button recipe.
* The main floating-window close button still needs an optical-alignment fix.
  * The final fix must solve the perceived misalignment between the visible close glyph, the hover background, the hit area, and the top-right panel spacing.
  * A radius-only change is not sufficient if the button still looks off in hover QA.
* The settings-page external-downloader deck needs a tighter, more disciplined card layout.
  * The `yt-dlp` card should define the rhythm for version text, update dot, update-available copy, and action button placement.
  * The update dot, `可更新到：{{version}}` copy, and update button must no longer appear贴边, vertically off-axis, or baseline-misaligned.
  * `yt-dlp`, `pin-dlp`, and `runtime` cards should follow one shared internal alignment structure rather than ad-hoc per-card spacing.
  * The footer area should use a stable two-line layout instead of forcing status text and action buttons into one horizontal row.
  * Status copy should sit on its own line with predictable truncation, while the action button aligns consistently on the next line / footer row.
  * The result must stay compact enough for the current deck height and should not increase visual noise.
* The main floating window must remain in expanded floating-window mode whenever any download or transcode task exists.
  * This includes queued, preparing, active, cancelling, and transcode-processing states, not only post-progress states.
  * The app may auto-collapse back to icon mode only after there are no remaining download/transcode tasks and the normal idle delay has elapsed.
  * Idle/minimize timers must be cleared or suppressed as soon as a task is queued or restarted, rather than waiting for the first progress event.

## Acceptance Criteria (evolving)

* [ ] The plan identifies the primary UI surfaces to optimize first.
* [ ] The plan recommends a concrete sequence of impeccable skills rather than a loose list.
* [ ] The plan explains why each selected skill is used for this repo.
* [ ] The plan distinguishes baseline consistency work from optional later polish.
* [ ] The plan stays aligned with FlowSelect's existing design system rather than proposing a disconnected visual reset.
* [ ] The plan explicitly covers both the main floating window and settings page under one unified visual language.
* [ ] The plan prioritizes detail refinement over large structural redesign.
* [ ] The plan reflects the chosen "elegant restrained" tone rather than a bold or highly expressive redesign.
* [ ] The PRD records that the main-window close button hover background must be optically aligned with the control in hover state.
* [ ] The PRD records that the settings theme selected state should no longer use an overly strong glow and should rely on a restrained edge-highlight treatment instead.
* [ ] The PRD records that the queue button should harmonize with both themes during transcode and should not become visually louder than necessary.
* [ ] The PRD records that the `源素材已获取，已加入转码队列` transcode handoff message should be removed.
* [ ] The PRD records that active transcoding needs a user-visible exit/cancel action, not only passive completion/failure handling.
* [ ] The PRD records that the queue detail header/title copy must be de-duplicated to reduce information noise.
* [ ] The PRD records that the theme-switch selected style becomes the reference selected-state treatment for comparable settings actions, and explicitly calls out the global-shortcut confirm button as a required follow-up.
* [ ] The PRD records that the close-button alignment issue remains open after iteration two and must be solved at the level of optical alignment, not only border radius.
* [ ] The PRD records that the external-downloader card layout needs normalization across version text, update status, status dot, and action buttons.
* [ ] The PRD records that the main window must not collapse to icon mode while any download/transcode task is queued or in flight, and may only auto-collapse after task count returns to zero and idle delay expires.

## Definition of Done (team quality bar)

* Requirements are concrete enough to start an implementation task
* Skill sequence and decision points are documented
* Frontend constraints and affected files are recorded
* Scope boundaries are explicit

## Out of Scope (explicit)

* Immediate code implementation in this brainstorm task
* Backend or installer UX changes
* A total visual rebrand that breaks the current FlowSelect design language
* Broad redesign of every app surface in this pass
* Large information architecture rewrites unless a small local adjustment is necessary for consistency

## Technical Notes

* Relevant files inspected:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
  * `src/components/ui/neon-button.tsx`
  * `src/components/ui/neon-card.tsx`
  * `src/components/ui/neon-toggle.tsx`
  * `src/contexts/ThemeContext.tsx`
  * `.trellis/spec/frontend/design-system.md`
  * `.trellis/spec/frontend/motion-guidelines.md`
* Current design-system constraints:
  * preserve compact, intentional, utility-first look
  * use semantic tokens from `ThemeContext`
  * avoid loud visual reinvention
  * keep motion small, fast, and readable
* Additional product constraints from user:
  * refined compact multi-purpose downloader positioning must remain obvious
  * interaction should stay friction-light and fast to understand
  * interface copy should be minimal and non-instruction-heavy
  * affordance should come primarily from visual design and interaction feedback
  * animation changes must use `motion/react`
  * chrome hover states must stay optically aligned and not feel detached from their hit areas
  * selected-state emphasis should favor edge definition over strong glows when the control is part of a restrained settings surface
  * transcode-state communication should avoid duplicate cues when color, progress, and queue markers already carry the meaning
  * compact queue UI should minimize redundant titling and let structure communicate hierarchy
  * transcode exit should be direct and lightweight, without a confirmation interrupt
  * the queue popover header should retain `队列` as the single surviving heading label
  * the restrained selected-state language now established by the theme switch should be reused for comparable settings actions
  * downloader-maintenance cards in settings should feel aligned, deliberate, and compact rather than improvised
  * the main floating window should never retreat to icon mode while media tasks still exist anywhere in the queue lifecycle
* Relevant current code ownership for the implemented iteration-two work and iteration-three follow-ups:
  * `src/App.tsx`
    * close button uses `NeonIconButton` near the top-right window chrome
    * queue badge container/background and queue-popover title stack are rendered here
    * transcode exit buttons now exist both in the queue rows and in the primary transcode progress shell
    * idle auto-collapse behavior is controlled here through `scheduleIdleAfterTaskSettlement`, `resetIdleTimer`, `isMinimized`, `windowResized`, and task/progress listeners
    * current auto-collapse risk appears to be that minimize timers are primarily cancelled by progress events / primary-task state, leaving a window before task-progress events arrive
  * `src/pages/SettingsPage.tsx`
    * theme selection buttons use `getSelectableOptionStyle(colors, active, highlighted)`
    * global shortcut confirmation currently uses `NeonButton variant="default"` and still inherits the older glow-heavy primary-button recipe
    * downloader cards are assembled inline here; the `yt-dlp` card currently composes version row, update dot, status line, and update button with per-card flex layout
    * the confirmed next-step direction is to move downloader-card footer content toward a stable two-line layout for cleaner button and status alignment
  * `src/pages/settings/DownloaderDeck.tsx`
    * card viewport height is fixed and compact, so card internals need a disciplined shared rhythm
    * inconsistent card-body alignment is likely amplified by the deck's tight height and animated stacked-card presentation
  * `src/components/ui/neon-button.tsx`
    * `variant=\"default\"` and `variant=\"outline\"` still use the older stronger glow language
    * this component is a likely follow-up target if the restrained selected-state treatment should become reusable beyond the theme switch
  * `src/components/ui/shared-styles.ts`
    * `getSelectableOptionStyle` now reflects the quieter selected-state treatment established in iteration two
    * `getChromeButtonStyle` controls hover background/border treatment for chrome icon buttons such as the main close button
  * `src-tauri/resources/locales/zh-CN/desktop.json`
    * contains downloader-card status copy such as `可更新到：{{version}}`
    * contains queue-copy updates introduced during iteration two
  * `src-tauri/src/lib.rs`
    * backend now exposes `cancel_transcode`, `retry_transcode`, and `remove_transcode`
    * transcode queue processing and cancel cleanup landed in iteration two
    * the new user-reported issues in this round are frontend / interaction / window-state problems rather than new backend-transcode requirements
* Cheatsheet relationships supplied by user:
  * `critique` -> `polish`, `distill`, `bolder`, `quieter`, `typeset`, `arrange`
  * `audit` -> `normalize`, `harden`, `optimize`, `adapt`, `clarify`
  * `distill` combines well with `quieter`, `normalize`
  * `bolder` pairs with `quieter`
  * `colorize` combines with `bolder`, `delight`
  * `animate` combines with `delight`
  * `onboard` combines with `clarify`, `delight`
  * `extract` is the system-level follow-up for reusable patterns/tokens/components
* Notable UI risks already visible in code:
  * the main floating surface is visually dense and handles many concurrent states
  * some motion curves in `App.tsx` are more playful/bouncy than the current motion spec recommends
  * the settings page mixes reusable shared primitives with page-local patterns, which may weaken consistency
  * several control recipes still appear to be duplicated or manually styled instead of fully normalized through shared primitives

## Research Notes

### Installed skills that appear most relevant

* `frontend-design` - establishes a deliberate aesthetic direction and guards against generic AI design choices
* `critique` - evaluates visual hierarchy, information architecture, and emotional fit
* `audit` - performs systematic quality checks across theming, accessibility, performance, and responsive behavior
* `normalize` - aligns implementation with the repo design system and shared patterns
* `distill` - removes clutter and sharpens the main task flow
* `clarify` - cleans microcopy and labels after structure issues are known
* `adapt` - useful for ensuring settings and extension-adjacent surfaces stay coherent across contexts
* `colorize` - adds strategic color where hierarchy is too muted
* `animate` - improves motion and micro-interactions intentionally
* `delight` - adds restrained personality after core clarity is solved
* `polish` - final alignment/spacing/state refinement pass
* `optimize` - trims animation/rendering overhead after the visual shape is stable
* `harden` - catches overflow, i18n, and edge-case UI failures
* `extract` - consolidates repeated field/control recipes back into reusable UI building blocks when the new patterns settle
* `before-frontend-dev` / `check-frontend` - enforce repository frontend guidance before and after implementation

### Cheatsheet-informed orchestration

* Diagnostic layer:
  * start with `critique` for design-direction judgment
  * use `audit` for systematic issue inventory
* Core quality layer:
  * `normalize` first when design-system drift is visible
  * `harden` and `optimize` after the new structure settles
* Intensity layer:
  * use `bolder` only if the UI still feels too safe after normalization
  * use `quieter` if a later pass over-accentuates the compact floating surfaces
* Adaptation layer:
  * use `distill` to simplify dense surfaces before adding expression
  * add `clarify` where labels/hints/status copy are overloaded or too implementation-centric
* Enhancement layer:
  * add `animate` and `delight` only once hierarchy and consistency are already correct
* System layer:
  * use `extract` if the redesign reveals reusable patterns worth promoting into shared UI primitives or tokens

### Feasible approaches here

**Approach A: Normalize-first utility refinement** (Recommended)

* How it works:
  * `frontend-design` to frame a tight direction
  * `critique` + `audit` to identify the biggest design/system issues
  * `normalize` + `distill` for the first implementation pass
  * `polish` + `harden` at the end
* Pros:
  * Lowest regression risk
  * Best fit with the repo design-system guidance
  * Improves consistency across the main window and settings page quickly
  * Matches the user's selected "elegant restrained" direction
* Cons:
  * Visual change may feel incremental rather than dramatic

**Approach B: Balanced refinement with one signature interaction**

* How it works:
  * same baseline as Approach A
  * add one focused expressive pass using `animate` or `colorize`
  * optionally use `clarify` if the UX copy turns out to be part of the friction
* Pros:
  * Better perceived improvement for users
  * Still respects current UI identity
* Cons:
  * Requires tighter prioritization so motion or color changes do not spread everywhere

**Approach C: Flagship redesign within the current shell**

* How it works:
  * stronger use of `bolder`, `colorize`, `animate`, and `delight` after diagnosis
  * may require `extract` to keep the result maintainable
* Pros:
  * Highest visible impact
  * Can make the product feel much more distinctive
* Cons:
  * Highest risk of drifting away from the current design-system contract
  * More likely to create rework on small dense surfaces like the `200x200` window

### Commands referenced by cheatsheet but not currently available in this session

* `typeset`
* `arrange`
* `overdrive`

For this repo/session, their intent would need to be covered by nearby available skills:

* `typeset` -> mostly `normalize` + `polish`
* `arrange` -> mostly `distill` + `normalize` + `adapt`
* `overdrive` -> mostly `animate` + `delight`, but only if the compact utility surfaces can actually support it without violating repo constraints

## Converged Direction So Far

* Scope:
  * `src/App.tsx`
  * `src/pages/SettingsPage.tsx`
* Optimization intent:
  * unify design language
  * improve typography and spacing detail
  * improve color pairing and emphasis control
  * improve interaction detail without a large-scale visual rewrite
* Likely baseline skill chain:
  * `critique -> audit -> normalize -> distill -> polish -> harden`
* Likely optional enhancement layer after baseline:
  * `clarify`
  * `colorize`
  * `animate`
  * `extract`

## Technical Approach

Use the impeccable skills as a phased refinement workflow rather than isolated commands:

1. Diagnostic phase
   * `frontend-design`
     * lock the intended direction as elegant, restrained, compact, and utility-first
   * `critique`
     * evaluate visual hierarchy, spacing rhythm, control emphasis, and whether the two desktop surfaces feel like one product
   * `audit`
     * inventory theming, accessibility, motion, consistency, and resilience issues that materially affect the main window and settings page

2. Core design unification phase
   * `normalize`
     * align both surfaces to the same token usage, field recipes, button hierarchy, section spacing, and chrome behavior
   * `distill`
     * remove local clutter, repeated visual treatment, and over-signaled states that compete inside dense compact surfaces

3. Refinement phase
   * `polish`
     * fix typography hierarchy, optical alignment, spacing cadence, hover/focus/active consistency, and final detail quality
   * `harden`
     * ensure the refined UI survives long labels, translated text, status variation, and edge-case states

4. Optional restrained enhancement phase
   * `clarify`
     * improve labels, helper copy, and status wording if diagnosis shows copy friction
   * `colorize`
     * only for selective hierarchy reinforcement such as active state, queue/status cues, and section emphasis
   * `animate`
     * only for subtle state transitions and micro-feedback that fit the compact motion spec
   * `extract`
     * consolidate any newly proven shared patterns back into reusable UI primitives or semantic tokens

## Decision (ADR-lite)

**Context**: The user wants both the main floating window and settings page improved, but explicitly does not want a broad redesign. The repo design system also says to preserve the existing compact, tactile, gradient-based FlowSelect language.

**Decision**: Use Approach A (`normalize`-first utility refinement) with an elegant restrained tone. Treat the two surfaces as one shared design-language problem. Prioritize typography, spacing rhythm, color pairing, interaction detail, and restrained copy before any expressive enhancement. Keep operation simple, hints minimal, and any motion changes inside the existing `motion/react` system.

**Consequences**:
* Design changes should increase intuitive understanding without increasing textual explanation.
* Buttons, states, emphasis, spacing, and transitions must carry more of the explanatory burden.
* Helper copy should be used sparingly and only where the interface itself cannot make intent obvious.
* The first implementation pass should change many small details rather than introduce a new visual concept.
* Shared token usage and reusable field/control patterns become more important than isolated page-local styling.
* Optional color/motion enhancements remain available later, but only if they clearly improve hierarchy without making the UI louder.

## Final Suggested Skill Workflow

### Phase 1: Diagnosis

* `frontend-design`
  * Purpose: establish the target tone and avoid generic AI redesign patterns.
* `critique`
  * Focus: hierarchy, spacing rhythm, visual balance, and whether `App.tsx` and `SettingsPage.tsx` feel unified.
* `audit`
  * Focus: token drift, accessibility, motion mismatches, interaction-state gaps, and consistency problems.

### Phase 2: Shared Language Pass

* `normalize`
  * Target:
    * shared field/button/toggle treatment
    * shared section/header rhythm
    * shared muted-vs-accent emphasis rules
    * shared token usage across both surfaces
* `distill`
  * Target:
    * reduce duplicate emphasis
    * reduce noise inside the main floating window
    * simplify settings page group presentation without removing capability

### Phase 3: Detail Refinement

* `polish`
  * Target:
    * typography consistency
    * spacing and alignment
    * hover/focus/pressed detail quality
    * icon/control optical balance
* `harden`
  * Target:
    * long text
    * translated strings
    * overflow/truncation
    * status and error-state resilience

### Phase 4: Optional Light Enhancement

* `clarify`
  * Use if labels/hints/status text are too implementation-oriented.
* `colorize`
  * Use lightly for hierarchy and state communication, not decoration.
* `animate`
  * Use only for subtle, spec-compliant state motion.
* `extract`
  * Use if the work creates reusable shared desktop UI patterns worth promoting.
