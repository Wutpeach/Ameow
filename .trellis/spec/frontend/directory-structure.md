# Directory Structure

> How frontend code is organized in FlowSelect.

---

## Overview

The frontend follows a flat, feature-light structure suitable for a small desktop application. Components are organized by type rather than feature.

---

## Directory Layout

```
src/
├── App.tsx                 # Main floating window component (~1100 lines)
├── main.tsx               # React entry point + router setup
├── index.css              # Global styles (TailwindCSS)
├── vite-env.d.ts          # Vite type declarations
│
├── pages/                 # Route-level components
│   └── SettingsPage.tsx   # Settings window UI
│
├── components/            # Reusable components
│   ├── MaterialGrid.tsx   # Grid display component
│   ├── Sidebar.tsx        # Navigation sidebar
│   └── ui/                # Custom UI primitives
│       ├── neon-button.tsx
│       ├── neon-card.tsx
│       ├── neon-input.tsx
│       ├── neon-toggle.tsx
│       └── index.ts       # Barrel export
│
├── contexts/              # React Context providers
│   └── ThemeContext.tsx   # Theme state management
│
└── utils/                 # Utility functions
    └── videoUrl.ts        # Video URL detection
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
