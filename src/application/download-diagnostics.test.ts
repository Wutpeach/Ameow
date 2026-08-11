import { describe, expect, it } from "vitest";
import type { ResolvedDownloadPlan } from "../core/index.js";
import {
  MAX_ATTEMPT_HISTORY,
  NOOP_DIAGNOSTIC_SINK,
  createDownloadDiagnosticRecorder,
  recordDiagnosticSafely,
  type AttemptDiagnosticSummary,
  type DownloadDiagnosticEvent,
  type DownloadDiagnosticSink,
} from "./download-diagnostics.js";

/**
 * P6B B1 recorder semantics: closed safe events, monotonic attempt identity
 * created per real execution, bounded sanitized history, cycle tracking, and
 * best-effort isolation of sink sync throws and async rejections.
 */

const createPlan = (engineIds: string[]): ResolvedDownloadPlan => ({
  providerId: "test-provider",
  label: "Test plan",
  intent: {
    type: "video",
    siteId: "generic",
    originalUrl: "https://example.com/watch/42",
    pageUrl: "https://example.com/watch/42",
    priority: 100,
    candidates: [],
    preferredFormat: "best",
  },
  engines: engineIds.map((engine, index) => ({
    engine,
    priority: 100 - index,
    when: "primary" as const,
    reason: "test",
  })),
});

const recordingSink = (): {
  sink: DownloadDiagnosticSink;
  events: DownloadDiagnosticEvent[];
} => {
  const events: DownloadDiagnosticEvent[] = [];
  return {
    events,
    sink: { record: (event) => void events.push(event) },
  };
};

const terminalAttemptsOf = (
  events: DownloadDiagnosticEvent[],
): { attemptCount: number; attempts: readonly AttemptDiagnosticSummary[] } | null => {
  const terminal = events.find(
    (event) =>
      event.type === "download.succeeded"
      || event.type === "download.failed"
      || event.type === "download.cancelled",
  );
  if (!terminal) {
    return null;
  }
  return { attemptCount: terminal.attemptCount, attempts: terminal.attempts };
};

describe("DownloadDiagnosticRecorder", () => {
  it("records download.prepared with safe plan facts only", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordPrepared(createPlan(["yt-dlp", "gallery-dl"]));

    expect(events).toEqual([
      {
        type: "download.prepared",
        traceId: "trace-1",
        providerId: "test-provider",
        siteId: "generic",
        candidateEngineIds: ["yt-dlp", "gallery-dl"],
      },
    ]);
  });

  it("creates monotonic attempt identity only for started attempts", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordAttemptStarted("yt-dlp", "initial");
    recorder.recordAttemptSucceeded("yt-dlp");
    recorder.recordAttemptStarted("gallery-dl", "auth_recovery");
    recorder.recordAttemptSucceeded("gallery-dl");

    expect(events.filter((event) => event.type === "attempt.started")).toEqual([
      expect.objectContaining({ attemptIndex: 1, attemptId: "trace-1:1", engineId: "yt-dlp", cycle: "initial" }),
      expect.objectContaining({ attemptIndex: 2, attemptId: "trace-1:2", engineId: "gallery-dl", cycle: "auth_recovery" }),
    ]);
  });

  it("records attempt failures with the stable error code", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordAttemptStarted("yt-dlp", "initial");
    recorder.recordAttemptFailed(
      "yt-dlp",
      "E_EXECUTION_FAILED",
      "fallback_to_other_engine",
      "engine_execution",
    );

    expect(events).toContainEqual({
      type: "attempt.failed",
      traceId: "trace-1",
      attemptIndex: 1,
      attemptId: "trace-1:1",
      engineId: "yt-dlp",
      cycle: "initial",
      errorCode: "E_EXECUTION_FAILED",
      classification: "fallback_to_other_engine",
      category: "engine_execution",
      network: undefined,
    });
  });

  it("records fallback and auth recovery facts", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordFallbackStarted("yt-dlp", "gallery-dl");
    recorder.recordAuthRecoveryStarted();
    recorder.recordAuthRecoveryFinished("retry");

    expect(events).toContainEqual({
      type: "fallback.started",
      traceId: "trace-1",
      fromEngineId: "yt-dlp",
      toEngineId: "gallery-dl",
    });
    expect(events).toContainEqual({
      type: "auth_recovery.started",
      traceId: "trace-1",
    });
    expect(events).toContainEqual({
      type: "auth_recovery.finished",
      traceId: "trace-1",
      result: "retry",
    });
  });

  it("keeps the terminal snapshot bounded while the attempt counter is uncapped", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
      maxAttemptHistory: 2,
    });

    recorder.recordAttemptStarted("e1", "initial");
    recorder.recordAttemptFailed("e1", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
    recorder.recordAttemptStarted("e2", "initial");
    recorder.recordAttemptFailed("e2", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
    recorder.recordAttemptStarted("e3", "initial");
    recorder.recordAttemptFailed("e3", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
    recorder.recordTerminal({
      outcome: "failed",
      errorCode: "E_EXECUTION_FAILED",
      classification: "fallback_to_other_engine",
      category: "engine_execution",
    });

    const terminal = terminalAttemptsOf(events);
    expect(terminal).not.toBeNull();
    expect(terminal!.attemptCount).toBe(3);
    expect(terminal!.attempts).toHaveLength(2);
    expect(terminal!.attempts.map((attempt) => attempt.engineId)).toEqual(["e2", "e3"]);
  });

  it("derives the terminal cycle from the last attempt", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordAttemptStarted("yt-dlp", "auth_recovery");
    recorder.recordAttemptFailed("yt-dlp", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
    recorder.recordTerminal({
      outcome: "failed",
      errorCode: "E_EXECUTION_FAILED",
      classification: "fallback_to_other_engine",
      category: "engine_execution",
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "download.failed",
        cycle: "auth_recovery",
      }),
    );
  });

  it("emits exactly one terminal event of the requested kind", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    recorder.recordAttemptStarted("yt-dlp", "initial");
    recorder.recordAttemptSucceeded("yt-dlp");
    recorder.recordTerminal({ outcome: "succeeded" });

    expect(events.filter((event) => event.type.startsWith("download."))).toEqual([
      {
        type: "download.succeeded",
        traceId: "trace-1",
        attemptCount: 1,
        attempts: [
          {
            attemptIndex: 1,
            attemptId: "trace-1:1",
            engineId: "yt-dlp",
            cycle: "initial",
            outcome: "succeeded",
            errorCode: null,
            classification: null,
            category: null,
            network: undefined,
          },
        ],
        finalEngineId: "yt-dlp",
      },
    ]);
  });

  it("never leaks raw message, URL or context fields into attempt summaries", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
      maxAttemptHistory: 2,
    });

    recorder.recordAttemptStarted("yt-dlp", "initial");
    recorder.recordAttemptFailed(
      "yt-dlp",
      "E_AUTH_REQUIRED",
      "auth_required",
      "authentication_required",
    );
    recorder.recordTerminal({
      outcome: "cancelled",
      errorCode: "E_ABORTED",
      classification: "cancelled",
      category: "cancelled",
    });

    const terminal = terminalAttemptsOf(events);
    const summary = terminal!.attempts[0];
    expect(Object.keys(summary).sort()).toEqual(
      [
        "attemptIndex",
        "attemptId",
        "engineId",
        "cycle",
        "outcome",
        "errorCode",
        "classification",
        "category",
        "network",
      ].sort(),
    );
  });

  it("isolates a synchronously throwing sink", async () => {
    const throwingSink: DownloadDiagnosticSink = {
      record() {
        throw new Error("sink exploded");
      },
    };
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink: throwingSink,
    });

    expect(() => {
      recorder.recordPrepared(createPlan(["yt-dlp"]));
      recorder.recordAttemptStarted("yt-dlp", "initial");
      recorder.recordAttemptSucceeded("yt-dlp");
      recorder.recordTerminal({ outcome: "succeeded" });
    }).not.toThrow();
    await expect(recordDiagnosticSafely(throwingSink, {
      type: "download.prepared",
      traceId: "trace-1",
      providerId: "p",
      siteId: "s",
      candidateEngineIds: [],
    })).resolves.toBeUndefined();
  });

  it("isolates a rejecting sink", async () => {
    const rejectingSink: DownloadDiagnosticSink = {
      record() {
        return Promise.reject(new Error("sink rejected"));
      },
    };
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink: rejectingSink,
    });

    expect(() => {
      recorder.recordAttemptStarted("yt-dlp", "initial");
      recorder.recordTerminal({
        outcome: "failed",
        errorCode: "E_EXECUTION_FAILED",
        classification: "fallback_to_other_engine",
        category: "engine_execution",
      });
    }).not.toThrow();
    await expect(recordDiagnosticSafely(rejectingSink, {
      type: "attempt.started",
      traceId: "trace-1",
      attemptIndex: 1,
      attemptId: "trace-1:1",
      engineId: "yt-dlp",
      cycle: "initial",
    })).resolves.toBeUndefined();
  });

  it("ignores an outcome report without a started attempt", () => {
    const { sink, events } = recordingSink();
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink,
    });

    expect(() => {
      recorder.recordAttemptSucceeded("yt-dlp");
      recorder.recordAttemptFailed("yt-dlp", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
    }).not.toThrow();
    expect(events).toHaveLength(0);
  });

  it("tolerates the no-op sink", () => {
    const recorder = createDownloadDiagnosticRecorder({
      traceId: "trace-1",
      sink: NOOP_DIAGNOSTIC_SINK,
    });

    expect(() => {
      recorder.recordPrepared(createPlan(["yt-dlp"]));
      recorder.recordAttemptStarted("yt-dlp", "initial");
      recorder.recordAttemptFailed("yt-dlp", "E_EXECUTION_FAILED", "fallback_to_other_engine", "engine_execution");
      recorder.recordTerminal({
        outcome: "failed",
        errorCode: "E_EXECUTION_FAILED",
        classification: "fallback_to_other_engine",
        category: "engine_execution",
      });
    }).not.toThrow();
    expect(MAX_ATTEMPT_HISTORY).toBeGreaterThan(0);
  });
});
