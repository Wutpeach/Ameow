# Spec finalization: incident diagnostic egress

Date: 2026-09-11  
Scope: documentation-only convergence follow-up

## Completed

Reorganized the existing `.trellis/spec/backend/logging-guidelines.md` Incident Diagnostic Egress Contract in place into the mandatory seven-part cross-layer form:

1. Scope / Trigger
2. Signatures
3. Contracts
4. Validation & Error Matrix
5. Good / Base / Bad Cases
6. Tests / Assertions
7. Wrong vs Correct

The contract now states executable command, payload, normalization, builder, sink, boolean, cancellation, rejection, and unsupported-command behavior. It explicitly distinguishes:

- Download: allowlisted structured facts only; sparse enqueue failures stay sparse; no `rawMessage` evidence or text-derived classification.
- Transcode: the only surface allowed one bounded sanitized evidence line when structured attempts are absent.
- Both commands: one normalizer and one text builder before the sink branch; no session/runtime-log reader, Support Log data, open context, or separate formatting path.

The existing Support Log Export Contract and all product code, other specs, tests, locales, manifests, and lockfiles were left untouched.

## Native fixture qualification

The accepted Windows native smoke remains valid for actual Electron native dialog/save/cancel behavior, UTF-8 file output, OS clipboard egress, retry retention, stale-completion UI guarding, compact/full UI lifecycle, hit targets, keyboard, themes, and reduced motion.

Its diagnostic intake fixture was deliberately sparse and synthetic: `native-ui-smoke-driver.mjs` emitted failure-shaped renderer events, and values such as classification `execution` and diagnostic category `unknown` were fixture strings rather than canonical typed enum evidence from a real Download engine. Therefore native smoke did **not** validate a live yt-dlp run or a rich ordered typed-attempt terminal summary. The rich Download path—including ordered attempts, retries/fallback/auth-recovery/terminal facts, sanitization, and Transcode-only evidence—is validated by `electron/errorDiagnosticCopy.test.mts`; Copy/Save equivalence and boolean/error behavior are validated by `electron/errorDiagnosticCommands.test.mts`.

No native or automated checks were rerun for this bounded follow-up. The established Windows save/cancel results and the previously reported native write-error/macOS/Linux limits are unchanged.

## Verification

```powershell
git diff --check
# PASS
```

Verdict: the backend logging spec now converges with the implemented incident egress boundary and existing tests, with no semantic or product change.
