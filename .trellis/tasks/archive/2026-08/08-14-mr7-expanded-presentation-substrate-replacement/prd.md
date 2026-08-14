# MR7 Expanded Presentation Substrate Replacement and Dot Field Retirement

## Goal

Plan the replacement of Expanded Presentation's retiring Dot Field with the
smallest repository-supported fullscreen Presentation substrate, while
preserving the progress, terminal, lifecycle, and authority semantics already
established by MR0-MR6.

This task produces a repository-grounded Planning Report for GPT Architecture
Lead review. It does not authorize implementation.

## Background

- The authoritative implementation baseline is the clean
  `motion/presentation-integration@710fe5e113731e783b80b4bb8a4ebdfb755f6181`
  worktree. Root `main` remains the Trellis planning/task-record line.
- Dot Field is planned for retirement and must not be extended for new
  Presentation features.
- The Expanded visual direction is a shader-driven fullscreen energy takeover.
  MR7 uses that direction only to define architecture capability boundaries; it
  does not freeze shader technology or visual recipes.

## Requirements

- Map Dot Field's current production responsibilities, dependencies, and wiring.
- Separate durable Presentation semantics from Dot Field-specific renderer
  recipes for MR3 Progress and MR4 Terminal.
- Preserve progress semantics: idle, determinate, indeterminate, trace
  replacement, authoritative downward revision, and current-primary selection.
- Preserve terminal semantics: success, failure, cancelled, bounded retention,
  current-primary priority, stale-generation invalidation, and
  `centerOutcome` lifecycle-lock ownership.
- Preserve the dependency direction Product/Application facts -> Presentation
  projection -> renderer-local execution.
- Keep Main Window lifecycle reducer as the sole full/compact/transition
  authority and Download/Application as progress/terminal correctness authority.
- Define the minimum ownership, lifecycle, dependency, and execution boundary
  for the replacement Expanded Presentation substrate.
- Decide from repository evidence whether a renderer-local abstraction is
  needed. Do not create a generic Motion framework, shared runtime, scheduler,
  state machine, or priority bus without evidence and Architecture Lead review.
- Provide a safe Dot Field retirement path that prevents long-lived old/new
  substrates or duplicate sources of truth.
- Expose only the stable Presentation capability needed later by Download Intake
  Reveal and Folder Confirmation Reveal; do not design or implement those
  features here.
- Define a minimal phased replacement and retirement plan plus architecture and
  semantic validation strategy.

## Constraints

- No product-code implementation, final visual-effect design, Compact Character
  redesign, MR9+ visual refinement, archive, commit, or task activation.
- A shader, Canvas/WebGL runtime, or Motion callback may execute renderer-local
  visuals but may not own Product, terminal, lifecycle, or native correctness.

## Acceptance Criteria

- [x] The Planning Report contains an exact Dot Field responsibility/dependency
  map anchored to production code and relevant tests.
- [x] Every current responsibility is classified as delete, preserve, or migrate,
  with semantic authority kept separate from renderer recipes.
- [x] The replacement boundary names its owner, inputs, lifecycle, outputs,
  cancellation/disposal rules, and forbidden authorities.
- [x] The plan includes an enforceable cutover condition preventing indefinite
  Dot Field/new-substrate coexistence.
- [x] Later Intake Reveal and Folder Confirmation Reveal receive a stable,
  minimal Presentation capability without speculative feature implementation.
- [x] Architecture and semantic validations cover the preserved MR3/MR4
  contracts and substrate retirement.
- [x] The plan states explicitly whether an independent substrate abstraction is
  justified; if not, it selects the smaller component-local replacement.
- [x] `prd.md`, `design.md`, and `implement.md` are ready for GPT Architecture
  Lead Planning Architecture Review, with no blocking open question.
