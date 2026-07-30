## Scenario: Electron ESM Main Initialization-Order Contract

### 1. Scope / Trigger

- Trigger: Any task that changes top-level imports, singleton/controller creation, or dependency wiring in `electron/main.mts`.
- Why this needs code-spec depth: Electron executes the emitted ESM main file before any renderer is available. Initialization-order mistakes compile successfully but crash the desktop app during load.

### 2. Signatures

Top-level dependency patterns:

```ts
// Safe before declaration because this is a function declaration.
function emitAppEvent(event: string, payload: unknown): void;

// Not safe before declaration because this is a const binding.
const readConfigObject = configStore.readConfigObject;
const updateTrayMenu = trayMenuController.updateTrayMenu;
```
