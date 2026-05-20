# Frontend Development Guidelines

> Best practices for frontend development in FlowSelect.

---

## Overview

FlowSelect is a Tauri v2 desktop application with a React frontend. The UI is a compact 200x200px floating window that handles file/image/video collection via drag-drop and paste operations.

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.1.0 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 7.0.4 | Build tool |
| Motion for React | 12.35.2 | Animations |
| TailwindCSS | 4.1.18 | Styling |
| Lucide React | 0.563.0 | Icons |
| React Router DOM | 7.13.0 | Routing |
| Tauri API | 2.x | Backend communication |

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Done |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Done |
| [Design System](./design-system.md) | Core visual language, semantic tokens, and UI state patterns | Done |
| [Motion Guidelines](./motion-guidelines.md) | `motion/react` usage, compact surface motion rules, and transparent child-window animation contracts | Done |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, Tauri event patterns | Done |
| [State Management](./state-management.md) | Local state, ThemeContext, config flow | Done |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | Done |
| [Type Safety](./type-safety.md) | Type patterns, validation | Done |

---

## Key Constraints

- **Window Size**: Fixed 200x200px, non-resizable
- **Always-on-top**: Window stays above other applications
- **Drag Region**: Use `data-tauri-drag-region` attribute for draggable areas
- **Compact Hover Contract**: Entering the compact icon expands immediately; leaving an unlocked full shell collapses through a short grace path, not a 3-second idle timer

---

**Language**: All documentation should be written in **English**.
