# Lead research review

- Date: 2026-09-11
- Orca Run: `run_83585142edd1`
- Accepted Task / Dispatch: `task_e1c8068e11fb` / `ctx_6750bb45a214`
- Outcome: research succeeded; no implementation planning or code changes.
- Evidence: `research/diagnostic-export-ownership.md`; Lead directly reviewed the recorder, logger sink, Support Log builder, Quick Copy builder/types, runtime retention and App action/terminal handling.

## Product-target qualification of the worker recommendation

The factual chain is accepted. The worker recommends suppressing diagnostic lines in the Support Log projection as the smallest readability fix. That is insufficient for the explicit product target: minimum necessary information about one failed task. Support Log takes no incident/trace selector and still exports unrelated session lines if the diagnostic prefix is suppressed.

The preferred local direction is therefore reuse of the existing incident projection/source, not reconstruction of a report from session text. Application terminal summary -> incident report -> user egress already exists in Quick Copy. A later decision about a file-based single-failure export should preserve that same source and projection boundary. Runtime logging may remain an observational sink; it must not become the authoritative source for an incident report. This is option 4 (reuse existing local seam), with projection responsibility clarified; it does not justify a new store or changing Application diagnostic semantics.

The Application already owns a narrow sink port and the runtime adapter implements it. This is not proof of a reversed Application-to-Electron dependency. The concrete responsibility overlap is the runtime adapter flattening typed events into a general session log that Support Log exports.

## Lifecycle qualification

The recorder retains up to eight attempt summaries and one terminal summary, with typed error attachment held in a WeakMap, not a persistent incident archive. In App, a download failure requests a 5000 ms foreground outcome; background terminals can be suppressed, a new primary task can dismiss the reveal, and successful copy dismisses it (`src/App.tsx:761`, `:1340`, `:1359`). Thus existing Quick Copy proves an incident egress path, not durable access to every historical failed task. Any later planning should settle the desired incident selection and availability boundary before assuming storage changes.

## Research completion boundary

Only task artifacts were added. Existing `.trellis/tmp/` was preserved. No code tests were run because this was static repository research. No design or implementation plan was created. Later planning is not authorized by this report.
