export type MainWindowShellPhase = "compact" | "expanding" | "full" | "collapsePending" | "collapsing";

export type MainWindowShellLock =
  | "drag"
  | "contextMenu"
  | "task"
  | "drop"
  | "startup"
  | "foregroundOutcome"
  | "uiLab"
  | "appUpdate";

export type MainWindowShellModeEffect =
  | { type: "requestExpand" }
  | { type: "requestCollapse" }
  | { type: "startCollapseTimer"; token: number }
  | { type: "cancelCollapseTimer" }
  | { type: "setInteractionMode"; mode: "interactive" | "compact-passthrough" };

export type MainWindowShellState = {
  phase: MainWindowShellPhase;
  pointerInside: boolean;
  collapseTimerToken: number;
  locks: Record<MainWindowShellLock, boolean>;
};

export type MainWindowShellEvent =
  | { type: "pointerEnter" }
  | { type: "pointerLeave" }
  | { type: "dropEnter" }
  | { type: "dropLeave" }
  | { type: "setLock"; lock: MainWindowShellLock; active: boolean }
  | { type: "startupSettle" }
  | { type: "forceFull" }
  | { type: "collapseTimerFired"; token: number }
  | { type: "expandAnimationComplete" }
  | { type: "collapseAnimationComplete" };

export type MainWindowShellTransition = {
  state: MainWindowShellState;
  effects: MainWindowShellModeEffect[];
};

const EMPTY_LOCKS: Record<MainWindowShellLock, boolean> = {
  drag: false,
  contextMenu: false,
  task: false,
  drop: false,
  startup: false,
  foregroundOutcome: false,
  uiLab: false,
  appUpdate: false,
};

export const createMainWindowShellState = ({
  startsCompact,
  startupLocked = false,
}: {
  startsCompact: boolean;
  startupLocked?: boolean;
}): MainWindowShellState => ({
  phase: startsCompact ? "compact" : "full",
  pointerInside: false,
  collapseTimerToken: 0,
  locks: {
    ...EMPTY_LOCKS,
    startup: startupLocked,
  },
});

export const isMainWindowShellCollapseBlocked = (state: MainWindowShellState): boolean => (
  Object.values(state.locks).some(Boolean)
);

const nextTimerToken = (state: MainWindowShellState): number => state.collapseTimerToken + 1;

const withLock = (
  state: MainWindowShellState,
  lock: MainWindowShellLock,
  active: boolean,
): MainWindowShellState => {
  if (state.locks[lock] === active) {
    return state;
  }
  return {
    ...state,
    locks: {
      ...state.locks,
      [lock]: active,
    },
  };
};

const beginExpand = (state: MainWindowShellState): MainWindowShellTransition => ({
  state: {
    ...state,
    phase: "expanding",
    collapseTimerToken: nextTimerToken(state),
  },
  effects: [
    { type: "cancelCollapseTimer" },
    { type: "setInteractionMode", mode: "interactive" },
    { type: "requestExpand" },
  ],
});

const beginCollapse = (state: MainWindowShellState): MainWindowShellTransition => {
  if (isMainWindowShellCollapseBlocked(state)) {
    return {
      state: {
        ...state,
        phase: "full",
      },
      effects: [{ type: "cancelCollapseTimer" }],
    };
  }

  return {
    state: {
      ...state,
      phase: "collapsing",
      collapseTimerToken: nextTimerToken(state),
    },
    effects: [
      { type: "cancelCollapseTimer" },
      { type: "setInteractionMode", mode: "interactive" },
      { type: "requestCollapse" },
    ],
  };
};

const beginCollapseDelay = (state: MainWindowShellState): MainWindowShellTransition => {
  if (state.pointerInside || isMainWindowShellCollapseBlocked(state)) {
    return {
      state: {
        ...state,
        phase: state.phase === "collapsePending" ? "full" : state.phase,
      },
      effects: [],
    };
  }

  const token = nextTimerToken(state);
  return {
    state: {
      ...state,
      phase: "collapsePending",
      collapseTimerToken: token,
    },
    effects: [{ type: "startCollapseTimer", token }],
  };
};

export const reduceMainWindowShell = (
  state: MainWindowShellState,
  event: MainWindowShellEvent,
): MainWindowShellTransition => {
  switch (event.type) {
    case "pointerEnter": {
      const nextState = {
        ...state,
        pointerInside: true,
      };
      if (state.phase === "compact" || state.phase === "collapsing") {
        return beginExpand(nextState);
      }
      if (state.phase === "collapsePending") {
        return {
          state: {
            ...nextState,
            phase: "full",
            collapseTimerToken: nextTimerToken(state),
          },
          effects: [{ type: "cancelCollapseTimer" }],
        };
      }
      return {
        state: nextState,
        effects: [{ type: "cancelCollapseTimer" }],
      };
    }

    case "pointerLeave":
      return beginCollapseDelay({
        ...state,
        pointerInside: false,
      });

    case "dropEnter":
      return reduceMainWindowShell(withLock({
        ...state,
        pointerInside: true,
      }, "drop", true), { type: "pointerEnter" });

    case "dropLeave":
      return reduceMainWindowShell({
        ...state,
        pointerInside: false,
      }, { type: "setLock", lock: "drop", active: false });

    case "setLock": {
      const nextState = withLock(state, event.lock, event.active);
      if (!event.active && nextState.phase === "full" && !nextState.pointerInside) {
        return beginCollapseDelay(nextState);
      }
      if (event.active && nextState.phase === "collapsePending") {
        return {
          state: {
            ...nextState,
            phase: "full",
            collapseTimerToken: nextTimerToken(nextState),
          },
          effects: [{ type: "cancelCollapseTimer" }],
        };
      }
      return {
        state: nextState,
        effects: [],
      };
    }

    case "startupSettle":
      return beginCollapseDelay(state);

    case "forceFull": {
      if (state.phase === "full" || state.phase === "expanding") {
        return {
          state: {
            ...state,
            phase: "full",
            collapseTimerToken: nextTimerToken(state),
          },
          effects: [
            { type: "cancelCollapseTimer" },
            { type: "setInteractionMode", mode: "interactive" },
          ],
        };
      }
      return beginExpand({
        ...state,
        pointerInside: true,
      });
    }

    case "collapseTimerFired":
      if (state.phase !== "collapsePending" || state.collapseTimerToken !== event.token) {
        return {
          state,
          effects: [],
        };
      }
      return beginCollapse(state);

    case "expandAnimationComplete":
      if (state.phase === "collapsePending") {
        return {
          state,
          effects: [],
        };
      }
      if (state.phase !== "expanding") {
        return {
          state,
          effects: [],
        };
      }
      if (!state.pointerInside && !isMainWindowShellCollapseBlocked(state)) {
        return beginCollapseDelay({
          ...state,
          phase: "full",
        });
      }
      return {
        state: {
          ...state,
          phase: "full",
        },
        effects: [],
      };

    case "collapseAnimationComplete":
      if (state.phase !== "collapsing") {
        return {
          state,
          effects: [],
        };
      }
      return {
        state: {
          ...state,
          phase: "compact",
        },
        effects: [{ type: "setInteractionMode", mode: "compact-passthrough" }],
      };
  }
};
