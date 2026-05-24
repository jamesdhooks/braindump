# Agent Guide — Braindump

A Windows-first, tray-resident **Electron + React + Vite** notes app with optional LLM features and an opt-in self-hosted sync server. Local-first; the desktop app works with zero API keys and zero network.

Read [README.md](README.md) for product overview and [CONTRIBUTING.md](CONTRIBUTING.md) for the dev loop and the canonical "add a skill / add a provider" walkthroughs. This file only covers what those don't.

## Commands

```bash
npm install
npm run dev          # Vite + Electron with HMR
npm run typecheck    # tsc on tsconfig.json AND tsconfig.node.json — both must pass
npm run build        # tsc + vite build (also produces dist-electron/)
npm run test         # vitest run
npm run lint         # eslint .ts/.tsx
npm run build:win    # NSIS + portable installer under release/
```

Before proposing a PR, run **`npm run typecheck` and `npm run build`** — both are required to be green ([CONTRIBUTING.md](CONTRIBUTING.md)).

## Process boundaries (read this before editing)

Three execution contexts live in this repo. Mixing them is the most common source of bugs.

| Layer | Where | Talks to |
|---|---|---|
| **Main** (Node, Electron) | [electron/](electron/) | OS, filesystem, secrets, all LLM HTTP, all sync HTTP |
| **Preload** (bridge) | [electron/preload.ts](electron/preload.ts) | exposes `window.braindump.*` via `contextBridge` |
| **Renderer** (React) | [src/](src/) | reads/writes state via the preload bridge only |

Hard rules:
- **API keys, `safeStorage`, `fs`, `net` access live in main only.** Renderer must never import from `electron/` directly.
- Renderer state changes go through the zustand store ([src/store/index.ts](src/store/index.ts)); persistence happens via IPC, not by the renderer touching disk.
- Adding renderer ↔ main capability = add an `ipcMain.handle` in [electron/main.ts](electron/main.ts), expose it in [electron/preload.ts](electron/preload.ts) under `api.*`, then call `window.braindump.<group>.<method>(...)` in the renderer. Keep the three in sync.

## LLM skills

All intelligent features go through one runner: [electron/llm/skills/runSkill.ts](electron/llm/skills/runSkill.ts). It handles provider selection (per-feature overrides in `featureProviderOverrides`), privacy redaction, Zod validation with **one automatic JSON-repair retry**, token accounting, and appends to `llm-log.jsonl` in `userData`.

When adding a skill, follow the 5-step recipe in [CONTRIBUTING.md](CONTRIBUTING.md#adding-an-llm-skill). Use [electron/llm/skills/format.ts](electron/llm/skills/format.ts) as the canonical example. The skill must:
- Define a Zod schema and pass it to `runSkill({ feature, schema, buildMessages, input })`.
- Pick an existing `SkillFeature` value (see [electron/llm/skills/types.ts](electron/llm/skills/types.ts)) — do **not** invent a new feature without also extending `featureProviderOverrides` in [electron/store.ts](electron/store.ts) and the `featureMap` in `runSkill.ts`.
- Instruct the model to output JSON only; commentary breaks the retry path.

Providers ([electron/llm/](electron/llm/)) implement `complete` and optionally `embed` / `vision` / `listModels`. Wire new ones via [electron/llm/index.ts](electron/llm/index.ts).

## Persistence

[electron/persistence.ts](electron/persistence.ts) does atomic writes + 3 rolling backups + a snapshot for boot recovery. Don't write to `userData` files directly from elsewhere — go through the helpers it exports. State shape lives in [src/types.ts](src/types.ts) and [packages/core/schema.ts](packages/core/schema.ts) (Zod). When adding a field, update both, plus `DEFAULT_STATE` in [electron/store.ts](electron/store.ts), and consider a migration in [electron/migrations.ts](electron/migrations.ts).

## Sync (optional)

The desktop app talks to the optional [apps/api/](apps/api/) (Hono + Drizzle) over an op-log: [electron/sync/](electron/sync/) buffers ops in an outbox, the API persists them, and [apps/web/](apps/web/) re-applies them via the shared reducer in [packages/core/oplog.ts](packages/core/oplog.ts). Reducer changes must stay deterministic — both desktop and web replay the same op stream.

## Path aliases

Configured in [vite.config.ts](vite.config.ts) and [tsconfig.json](tsconfig.json):

- `@/…` → `src/`
- `@bd/core` → `packages/core/index.ts`
- `@bd/claw` → `packages/claw/protocol.ts`

## Conventions

- TypeScript strict on both sides; no `any` in new code.
- Tailwind + design tokens in [src/theme/tokens.css](src/theme/tokens.css). Prefer token classes over raw hex.
- Animations belong in [src/motion/](src/motion/) so the `calm / floaty / reduced` presets stay consistent.
- Global hotkeys (registered in main) and in-window hotkeys ([src/hooks/useHotkeys.ts](src/hooks/useHotkeys.ts)) are the user-facing surface — when adding shortcuts, also document them in Settings → Shortcuts.

## Things that look like bugs but aren't

- `dist-electron/` is committed-looking output from the Electron Vite plugin; it is rebuilt on every `npm run dev` / `npm run build`. Don't hand-edit.
- The renderer can't see env vars or `process`. If a feature needs config, plumb it through main + preload.
- The app **must run with no API keys configured**. Every LLM-touching code path needs a graceful "no provider" fallback — check existing skills for the pattern.

## AI attribution

If a contribution is AI-drafted, note it in the PR. The README's "made with Claude" footer depends on this staying accurate ([CONTRIBUTING.md](CONTRIBUTING.md#disclosure)).
