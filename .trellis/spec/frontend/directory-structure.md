# Directory Structure

> How frontend code is organized in FlowSelect.

---

## Overview

The frontend follows a flat, feature-light structure suitable for a small desktop application. Components are organized by type rather than feature.

---

## Directory Layout

```
src/
├── App.tsx                 # Application facts + business content; issues presentation intents
├── main.tsx               # React entry point + router setup
├── index.css              # Global styles (TailwindCSS)
├── vite-env.d.ts          # Vite type declarations
│
├── presentation/          # Main Window presentation module (feature-scoped)
│   └── main-window/
│       ├── lifecycle.ts            # Pure lifecycle reducer (only writable authority)
│       ├── projections.ts          # Pure visual/interaction/native projections
│       ├── effectContracts.ts      # Effect discriminated union
│       ├── effectExecutor.ts       # Injected timer/native/focus execution
│       ├── reactAdapter.ts         # Thin React reducer binding
│       ├── MainWindowPresentationSurface.tsx  # DOM/Motion host + pointer/drop/drag wiring
│       ├── geometry.ts             # Spatial policy only
│       ├── motionRecipes.ts        # Renderer choreography only
│       └── motionRuntime.ts        # Temporary Edge Glow Motion-value adapter
│
├── pages/                 # Route-level components
│   ├── SettingsPage.tsx   # Settings window UI
│   └── UiLabPage.tsx      # UI Lab window (DEV only)
│
├── components/            # Reusable components
│   ├── CatIcon.tsx        # Compact icon
│   └── ui/                # Custom UI primitives
│       ├── shared-styles.ts
│       ├── index.ts       # Barrel export
│       └── ...
│
├── contexts/              # React Context providers
│   └── ThemeContext.tsx   # Theme state management
│
└── utils/                 # Pure utility functions
    ├── mainPanelInteractions.ts    # Panel drag/double-click helpers
    ├── compactPointerHotspot.ts    # Hotspot hysteresis
    ├── centerOverlayState.ts       # Center overlay reducer (application)
    ├── startupWindowState.ts       # Startup environment detection
    └── ...
```

---

## Module Organization

### Pages (`src/pages/`)
- One file per route/window
- Named with `Page` suffix: `SettingsPage.tsx`

### Components (`src/components/`)
- Reusable UI components
- UI primitives in `ui/` subdirectory
- PascalCase naming: `MaterialGrid.tsx`

### Contexts (`src/contexts/`)
- React Context providers
- Named with `Context` suffix: `ThemeContext.tsx`

### Utils (`src/utils/`)
- Pure utility functions
- camelCase naming: `videoUrl.ts`

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `NeonButton.tsx` |
| Pages | PascalCase + Page | `SettingsPage.tsx` |
| Contexts | PascalCase + Context | `ThemeContext.tsx` |
| Utils | camelCase | `videoUrl.ts` |
| CSS | kebab-case | `index.css` |

---

## Examples

**Well-organized component**: `src/components/ui/neon-button.tsx`
- Single responsibility
- Props interface defined
- Uses ThemeContext for theming
