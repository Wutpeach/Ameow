## Scenario: Electron Renderer Command Controller Registry Contract

### 1. Scope / Trigger

- Trigger: Any task that adds or changes a low-risk renderer command controller in `electron/main.mts`.
- Why this needs code-spec depth: The command dispatch path is shared by renderer IPC, controller extraction, and the remaining switch fallback. Order and error behavior must stay stable.

### 2. Signatures

```ts
type RendererCommandController = {
  supports(command: AmeowRendererCommand): boolean;
  invoke<TResult>(
    command: AmeowRendererCommand,
    payload?: Record<string, unknown>,
  ): Promise<TResult>;
};

type RendererCommandControllerGetter = () => RendererCommandController;
```

### 3. Contracts

- `electron/main.mts` remains the composition root and owns controller construction plus dependency injection.
- The registry must evaluate controller getters in order and stop at the first controller that supports the command.
- The first supporting controller wins when command families overlap.
- If no controller supports the command, dispatch must fall through to the existing `switch (command)` logic unchanged.
- Controllers must not catch or rewrap errors unless the current command behavior already requires that shape.
- Controllers must not create hidden global state.
- The registry should remain a small ordered loop, not a new framework layer.

### 4. Validation & Error Matrix

| Condition | Expected Behavior |
|---|---|
| First controller supports the command | Invoke it and stop searching |
| Earlier controller rejects support | Continue to the next getter |
| No controller supports the command | Fall through to the existing switch |
| Controller throws or rejects | Propagate the same error object unchanged |
| Overlapping controller support | First supporting controller wins |

### 5. Good / Base / Bad Cases

- Good: a support-log controller handles `export_support_log`, and a later getter is never consulted.
- Good: a non-controllerized command such as `get_config` skips the registry and uses the existing switch.
- Base: a single-controller registry still works as a small ordered loop.
- Bad: a controller silently swallows an error and throws a new wrapper error.
- Bad: a controller keeps its own hidden singleton registry outside `electron/main.mts`.
