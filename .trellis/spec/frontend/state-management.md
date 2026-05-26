# State Management

> How state is managed in FlowSelect.

---

## Overview

FlowSelect uses local React state for most UI state, with ThemeContext for global theme management. Configuration is persisted through the Electron desktop bridge into JSON files under the app user-data directory.

---

## State Categories

| Category | Solution | Example |
|----------|----------|---------|
| UI State | useState | `isHovering`, `isMinimized` |
| Refs | useRef | `idleTimerRef`, `containerRef` |
| Theme | ThemeContext | `theme`, `colors` |
| Config | Backend JSON | `outputPath`, `shortcut` |

---

## ThemeContext

**Provider setup** (`src/contexts/ThemeContext.tsx`):

```tsx
type Theme = 'black' | 'white';

interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  textPrimary: string;
  textSecondary: string;
  // ...
}

const ThemeContext = createContext<{
  theme: Theme;
  colors: ThemeColors;
  setTheme: (t: Theme) => void;
} | null>(null);
```

**Using theme in components:**

```tsx
import { useTheme } from './contexts/ThemeContext';

function MyComponent() {
  const { colors, setTheme } = useTheme();

  return (
    <div style={{ backgroundColor: colors.bgPrimary }}>
      <button onClick={() => setTheme('white')}>
        Light Mode
      </button>
    </div>
  );
}
```

### Transparent Child Window Theme Hydration

For transparent desktop child windows such as `/settings` and `/context-menu`, do not render the window with a hardcoded fallback theme and then asynchronously switch to the persisted theme.

Why:
- Transparent windows make first-paint theme mismatches highly visible.
- Defaulting to `black` and patching to `white` after `invoke("get_config")` causes a one-frame flash.
- Small menu windows can also appear to "flicker" if the first frame is transparent or uses the wrong theme tokens.

Preferred pattern:

```tsx
const initialTheme = await resolveInitialThemeBeforeRender();

ReactDOM.createRoot(root).render(
  <ThemeProvider initialTheme={initialTheme}>
    <App />
  </ThemeProvider>
);
```

Provider behavior rule:
- Accept an optional `initialTheme`.
- If `initialTheme` is provided, use it for the initial state and do not re-fetch theme config on mount.
- Still listen for cross-window `theme-changed` events so open windows stay synchronized.

---

## Config Flow

**Frontend → Backend:**
```
User changes setting
  → React setState
  → desktopCommands.invoke("save_config", { json })
  → Electron main writes JSON file
```

**Backend → Frontend:**
```
App mounts
  → desktopCommands.invoke("get_config")
  → Electron main reads JSON file
  → React setState
  → UI updates
```

**Example:**
```tsx
// Save config
const saveConfig = async () => {
const configStr = await desktopCommands.invoke<string>("get_config");
const config = JSON.parse(configStr);
config.outputPath = outputPath;
await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
};
```

### Renderer Config Patch Helper

For new renderer code that needs to update one or a few fields in the raw desktop config object, prefer the typed renderer helper in `src/desktop/config.ts` over repeating `get_config` / parse / mutate / `save_config` inline.

```tsx
import { saveConfigPatch } from "../desktop/config";

await saveConfigPatch({ aePortalEnabled: true });
```

The helper contract is intentionally narrow:

- it still calls `get_config` and `save_config`; do not add a new desktop command for simple field patches
- `get_config` remains a raw string and `save_config` still receives `{ json: JSON.stringify(config) }`
- invalid, empty, array, null, or non-object config input falls back to `{}`
- object patches must preserve unrelated fields in the loaded config object
- save/load failures propagate to the caller so existing optimistic UI rollback and error messages stay caller-owned
- do not use the helper when a handler needs different parse semantics, additional validation, event emission, or rollback behavior that cannot be proven equivalent

Good candidates are small Settings toggles that already follow the raw-config blob pattern. Poor candidates include handlers that intentionally use direct `JSON.parse`, validate a derived config before saving, emit cross-window events after persistence, or need a behavior fix before extraction.

### App.tsx Pure Logic Boundary

`src/App.tsx` may keep extracting pure helpers, reducers, and formatting functions when the logic can be proven side-effect free.

Keep these in `App.tsx` or the adjacent bridge/component boundary:

- event subscriptions
- timers and timer cleanup
- refs and synchronous interaction guards
- optimistic rollback behavior
- Electron bridge calls
- window ownership and lifecycle side effects

If an extraction needs any of the above, it is not a pure-logic helper and should stay with the component or the bridge layer.

### Config-backed toggle rule

For small Settings toggles backed by the raw config blob, keep one clear ownership pattern:

- read the current config string through `get_config`
- mutate only the specific config key you own
- write the full string back through `save_config`
- if the UI applies the toggle optimistically before persistence completes, revert local state on save failure

This is required for dev-only toggles such as `extensionInjectionDebugEnabled`, where the local Settings switch drives both desktop persistence and browser-extension synchronization.

---

## Compact Window Interaction State

The main floating window combines hover, drag, minimize, expand-morph, short leave grace, and short-lived status locks. Treat this as one coordinated interaction state machine, not as unrelated booleans.

Preferred ownership:

| Concern | Preferred State | Why |
|---------|-----------------|-----|
| Visual shell mode | `useState` | React needs to render icon/full/morph states |
| High-frequency interaction guards | `useRef` | Pointer-down / drag pending / drag active must update synchronously without waiting for render |
| Cancelable timers | `useRef` + shared clear helper | Leave-delay timers must be cancelable from multiple paths |
| Hover truth after transforms | Native boundary event + state sync | DOM enter/leave can be lost after transparent-window morphs |

Contracts:
- Do not let `onMouseLeave` directly own collapse decisions for the compact window. Leave is only one signal; morph completion, drag lifecycle, and task-outcome unlocks may need a second truth check.
- Compact/full switching must be owned by a single reducer/controller. Handlers dispatch explicit events such as pointer enter/leave, drop enter/leave, lock changes, startup settle, and animation completion; they must not make independent compact/full decisions.
- Do not use DOM `:hover` as a compact/full decision source. During compact-to-full morphs, transparent-window changes can leave `:hover` stale after an explicit leave. The reducer's explicit pointer/drop events are the source of truth.
- Native pointer-boundary events from Electron main are allowed as input facts for the reducer. Electron may report whether the OS cursor is inside the main BrowserWindow bounds, but it must not decide compact/full shell state.
- Collapse timers belong to the reducer effect layer and must use reducer-issued tokens. Components may execute the timer effect, but they must not create independent leave timers or clear timers outside reducer effects and teardown.
- Keep one shared clear helper per timer family. If a leave-delay timer exists, it must be canceled by re-enter, teardown, and any flow that forces full mode.
- Pointer-down, drag-threshold pending, and active drag are distinct interaction states. Leave handling must respect all three.
- When multiple transitions can hand off between each other, decide the next shell state at the handoff point instead of letting one effect finish and a second effect immediately undo it.
- If a foreground success/error outcome is rendered briefly in the main panel, treat that outcome visibility as its own synchronous guard, typically via a ref that collapse callbacks can read immediately. Do not rely on React state alone to lock compact-mode collapse for the completion checkmark/error state, because async completion callbacks can race pointer-leave or post-task collapse handoff by one frame.
- When showing a foreground task outcome after download/transcode completion, request full-mode ownership before or alongside flipping the visible outcome state. The completion glyph/message must not first appear inside the compact icon shell and then recover back to the full panel.

Common compact-window mistakes:

**WRONG: Independent timer ownership**
```tsx
onMouseLeave={() => {
  setTimeout(collapseMainWindowToIcon, 140);
}}

const resetIdleTimer = () => {
  clearTimeout(idleTimerRef.current!);
};
```

Why wrong:
- The leave timer is invisible to other reset paths and may still fire after re-enter.

**CORRECT: Shared timer ownership**
```tsx
const clearPointerLeaveCollapseTimer = () => {
  if (pointerLeaveCollapseTimerRef.current !== null) {
    clearTimeout(pointerLeaveCollapseTimerRef.current);
    pointerLeaveCollapseTimerRef.current = null;
  }
};
```

**WRONG: Drag and leave handled independently**
```tsx
onMouseLeave={() => collapseMainWindowToIcon()}
```

**CORRECT: Leave respects transient interaction state**
```tsx
if (
  isWindowPointerDownRef.current
  || pendingDragStartRef.current
  || activeWindowDragRef.current
) {
  return;
}
```

---

## Common Mistakes

**WRONG: Direct config mutation**
```tsx
// WRONG - doesn't persist
config.theme = 'white';
```

**CORRECT: Save through backend**
```tsx
// CORRECT - persists to disk
await desktopCommands.invoke("save_config", { json: JSON.stringify(config) });
```

**WRONG: Missing ThemeProvider**
```tsx
// WRONG - useTheme will throw
function App() {
  const { colors } = useTheme(); // Error!
}
```

**CORRECT: Wrap with provider**
```tsx
// CORRECT - in main.tsx
<ThemeProvider>
  <App />
</ThemeProvider>
```
