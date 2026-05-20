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
      { type: "setInteractionMode", mode: "interactive" },
      { type: "requestCollapse" },
    ]);
  });

  it("deterministically collapses when pointer leaves during expand", () => {
    const expanding = apply(
      createMainWindowShellState({ startsCompact: true }),
      { type: "pointerEnter" },
    ).state;
    const pending = apply(expanding, { type: "pointerLeave" });
    const token = pending.state.collapseTimerToken;

    expect(pending.state.phase).toBe("collapsePending");
    expect(apply(pending.state, { type: "expandAnimationComplete" }).state.phase)
      .toBe("collapsePending");

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

  it("enables compact passthrough only after collapse animation completes", () => {
    const collapsing = {
      ...createMainWindowShellState({ startsCompact: false }),
      phase: "collapsing" as const,
    };

    const settled = apply(collapsing, { type: "collapseAnimationComplete" });
    expect(settled.state.phase).toBe("compact");
    expect(settled.effects).toEqual([
      { type: "setInteractionMode", mode: "compact-passthrough" },
    ]);
  });
});
