---
description: "Use when writing or editing renderer code in src/. Covers process boundary rules, state mutation via zustand, animation conventions, and Tailwind token usage."
applyTo: "src/**"
---

# Renderer Rules

## Process boundary (most important)

- **Never import from `electron/`** in any file under `src/`. The renderer has no access to Node APIs.
- To call main-process code, use `window.braindump.<group>.<method>(...)` — these are the `contextBridge` methods exposed in [electron/preload.ts](../../electron/preload.ts).
- Config and secrets must be plumbed through main → preload → renderer. The renderer cannot read env vars or `process`.

## State

- Read state from the zustand store ([src/store/index.ts](../../src/store/index.ts)).
- All mutations go through store actions that persist via IPC (`window.braindump.setState` / `patchState`). Never write to disk directly from the renderer.

## Styling

- Use Tailwind utility classes with design tokens defined in [src/theme/tokens.css](../../src/theme/tokens.css). Prefer token-backed classes over raw hex colors or hardcoded values.

## Animations

- New animated components must use the presets in [src/motion/](../../src/motion/) (`calm`, `floaty`, `reduced`) so the user's motion preference is respected.
- Don't add `framer-motion` variants inline — extend the preset objects instead.

## Shortcuts

- In-window hotkeys are registered via [src/hooks/useHotkeys.ts](../../src/hooks/useHotkeys.ts). When adding a shortcut, also document it in Settings → Shortcuts.
