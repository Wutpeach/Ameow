import { describe, expect, it } from "vitest";

import {
  createMainWindowShellState,
  reduceMainWindowShell,
  type MainWindowShellState,
} from "./mainWindowShellMachine";

const apply = (
  state: MainWindowShellState,
  ...events: Parameters<typeof reduceMainWindowShell>[1][]
) => {
  let current = state;
  const effects = [];
  for (const event of events) {
    const result = reduceMainWindowShell(current, event);
    current = result.state;
    effects.push(...result.effects);
  }
  return { state: current, effects };
};

describe("mainWindowShellMachine", () => {
  it("expands immediately from compact on pointer enter", () => {
    const result = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "pointerEnter" },
    );

    expect(result.state.phase).toBe("expanding");
    expect(result.effects).toEqual([
      { type: "cancelCollapseTimer" },
      { type: "setInteractionMode", mode: "interactive" },
      { type: "requestExpand" },
    ]);
  });

  it("collapses full mode after a short leave timer fires", () => {
    const left = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "pointerLeave" },
    );
    const token = left.state.collapseTimerToken;

    expect(left.state.phase).toBe("collapsePending");
    expect(left.effects).toEqual([{ type: "startCollapseTimer", token }]);

    const collapsed = apply(left.state, { type: "collapseTimerFired", token });
    expect(collapsed.state.phase).toBe("collapsing");
    expect(collapsed.effects).toEqual([
      { type: "cancelCollapseTimer" },
      { type: "requestCollapse" },
    ]);
  });

  it("waits for expand completion before collapsing after pointer leaves during expand", () => {
    const expanding = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    const leftDuringExpand = apply(expanding, { type: "pointerLeave" });

    expect(leftDuringExpand.state.phase).toBe("expanding");
    expect(leftDuringExpand.state.pointerInside).toBe(false);
    expect(leftDuringExpand.effects).toEqual([]);

    const pending = apply(leftDuringExpand.state, { type: "expandAnimationComplete" });
    const token = pending.state.collapseTimerToken;
    expect(pending.state.phase).toBe("collapsePending");
    expect(pending.effects).toEqual([
      { type: "startCollapseTimer", token },
    ]);

    const collapsed = apply(pending.state, { type: "collapseTimerFired", token });
    expect(collapsed.state.phase).toBe("collapsing");
  });

  it("cancels pending collapse when pointer re-enters", () => {
    const pending = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "pointerLeave" },
    ).state;
    const token = pending.collapseTimerToken;
    const reentered = apply(pending, { type: "pointerEnter" });

    expect(reentered.state.phase).toBe("full");
    expect(reentered.effects).toEqual([{ type: "cancelCollapseTimer" }]);
    expect(apply(reentered.state, { type: "collapseTimerFired", token }).state.phase)
      .toBe("full");
  });

  it("preserves pointer-outside truth when forceFull expands from compact", () => {
    const result = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "forceFull" },
    );

    expect(result.state.phase).toBe("expanding");
    expect(result.state.pointerInside).toBe(false);
    expect(result.effects).toEqual([
      { type: "cancelCollapseTimer" },
      { type: "setInteractionMode", mode: "interactive" },
      { type: "requestExpand" },
    ]);
  });

  it("collapses after programmatic forceFull work finishes while pointer is outside", () => {
    const expandedForTask = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "setLock", lock: "task", active: true },
      { type: "forceFull" },
      { type: "expandAnimationComplete" },
      { type: "setLock", lock: "centerOutcome", active: true },
    );

    expect(expandedForTask.state.phase).toBe("full");
    expect(expandedForTask.state.pointerInside).toBe(false);
    expect(expandedForTask.state.locks.task).toBe(true);
    expect(expandedForTask.state.locks.centerOutcome).toBe(true);

    const taskReleased = apply(expandedForTask.state, { type: "setLock", lock: "task", active: false });
    expect(taskReleased.state.phase).toBe("full");
    expect(taskReleased.effects).toEqual([]);

    const outcomeReleased = apply(taskReleased.state, { type: "setLock", lock: "centerOutcome", active: false });
    expect(outcomeReleased.state.phase).toBe("collapsePending");
    expect(outcomeReleased.effects).toEqual([
      { type: "startCollapseTimer", token: outcomeReleased.state.collapseTimerToken },
    ]);
  });

  it("keeps programmatic forceFull open after locks clear while pointer is inside", () => {
    const expandedInside = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "pointerEnter" },
      { type: "setLock", lock: "task", active: true },
      { type: "forceFull" },
      { type: "expandAnimationComplete" },
      { type: "setLock", lock: "centerOutcome", active: true },
      { type: "setLock", lock: "task", active: false },
      { type: "setLock", lock: "centerOutcome", active: false },
    );

    expect(expandedInside.state.phase).toBe("full");
    expect(expandedInside.state.pointerInside).toBe(true);
    expect(expandedInside.effects).not.toContainEqual(expect.objectContaining({ type: "startCollapseTimer" }));
  });

  it("blocks collapse while locked and collapses after lock release outside", () => {
    const lockedOutside = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "setLock", lock: "task", active: true },
      { type: "pointerLeave" },
    );

    expect(lockedOutside.state.phase).toBe("full");
    expect(lockedOutside.effects).toEqual([]);

    const released = apply(lockedOutside.state, { type: "setLock", lock: "task", active: false });
    expect(released.state.phase).toBe("collapsePending");
    expect(released.effects).toEqual([
      { type: "startCollapseTimer", token: released.state.collapseTimerToken },
    ]);
  });

  it("blocks collapse for center outcome and collapses after the outcome finishes outside", () => {
    const lockedOutside = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "setLock", lock: "centerOutcome", active: true },
      { type: "pointerLeave" },
    );

    expect(lockedOutside.state.phase).toBe("full");
    expect(lockedOutside.state.pointerInside).toBe(false);
    expect(lockedOutside.state.locks.centerOutcome).toBe(true);
    expect(lockedOutside.effects).toEqual([]);

    const released = apply(lockedOutside.state, { type: "setLock", lock: "centerOutcome", active: false });
    expect(released.state.phase).toBe("collapsePending");
    expect(released.effects).toEqual([
      { type: "startCollapseTimer", token: released.state.collapseTimerToken },
    ]);
  });

  it("keeps full mode when center outcome finishes while pointer remains inside", () => {
    const lockedInside = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "pointerEnter" },
      { type: "setLock", lock: "centerOutcome", active: true },
    );

    const released = apply(lockedInside.state, { type: "setLock", lock: "centerOutcome", active: false });

    expect(released.state.phase).toBe("full");
    expect(released.state.pointerInside).toBe(true);
    expect(released.state.locks.centerOutcome).toBe(false);
    expect(released.effects).toEqual([]);
  });

  it("cancels pending collapse when center outcome starts", () => {
    const pending = apply(
      createMainWindowShellState({ startsCompact: false }),
      { type: "pointerLeave" },
    );
    const token = pending.state.collapseTimerToken;

    const locked = apply(pending.state, { type: "setLock", lock: "centerOutcome", active: true });

    expect(locked.state.phase).toBe("full");
    expect(locked.state.locks.centerOutcome).toBe(true);
    expect(locked.effects).toEqual([{ type: "cancelCollapseTimer" }]);
    expect(apply(locked.state, { type: "collapseTimerFired", token }).state.phase)
      .toBe("full");
  });

  it("keeps drop hover full until drop lock clears", () => {
    const dropped = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "dropEnter" },
      { type: "expandAnimationComplete" },
      { type: "pointerLeave" },
    );

    expect(dropped.state.phase).toBe("full");
    expect(dropped.state.locks.drop).toBe(true);

    const cleared = apply(dropped.state, { type: "dropLeave" });
    expect(cleared.state.phase).toBe("collapsePending");
    expect(cleared.effects).toEqual([
      { type: "startCollapseTimer", token: cleared.state.collapseTimerToken },
    ]);
  });

  it("keeps controls available when drop lock clears while pointer remains inside", () => {
    const dropped = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "dropEnter" },
      { type: "expandAnimationComplete" },
    );

    const unlockedInside = apply(dropped.state, { type: "setLock", lock: "drop", active: false });

    expect(unlockedInside.state.phase).toBe("full");
    expect(unlockedInside.state.pointerInside).toBe(true);
    expect(unlockedInside.state.locks.drop).toBe(false);
    expect(unlockedInside.effects).toEqual([]);

    const left = apply(unlockedInside.state, { type: "pointerLeave" });
    expect(left.state.phase).toBe("collapsePending");
    expect(left.effects).toEqual([
      { type: "startCollapseTimer", token: left.state.collapseTimerToken },
    ]);
  });

  it("enables compact passthrough only after collapse animation completes", () => {
    const collapsing = {
      ...createMainWindowShellState({ startsCompact: false }),
      phase: "collapsing" as const,
    };

    const settled = apply(collapsing, { type: "collapseAnimationComplete" });
    expect(settled.state.phase).toBe("compact");
    expect(settled.effects).toEqual([]);
  });
});
