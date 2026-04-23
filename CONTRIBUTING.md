# Contributing to Braindump

Braindump is small and opinionated. These notes explain how to be productive quickly.

## Dev loop

```bash
npm install
npm run dev
```

That starts Vite + Electron with HMR for the renderer and rebuilds the main process on change.

## Adding an LLM skill

1. Create `electron/llm/skills/<yourSkill>.ts` with a Zod schema and a `runSkill` call.
2. Export it from `electron/llm/skills/index.ts`.
3. Register an IPC handler in `electron/main.ts` under the existing `skill:*` block.
4. Surface it via `electron/preload.ts` inside `api.skill`.
5. Call `window.braindump.skill.<yourSkill>(...)` from the renderer.

That's it. The skill runner takes care of provider selection, privacy redaction, JSON validation with one automatic retry, token accounting, and audit-log writes.

## Adding a provider

`electron/llm/<provider>.ts` implements `complete`, optional `embed`, optional `vision`, optional `listModels`. Wire it in `electron/llm/index.ts`. Add defaults in `electron/store.ts` → `DEFAULT_STATE.providers`.

## Code style

- TypeScript strict on both sides.
- The main process is the only place where API keys or secrets are ever handled.
- UI reads from the zustand store; mutations go through actions that persist via IPC.
- Prefer Tailwind tokens over hex colors. See `src/theme/tokens.css`.
- New animations go through `src/motion/` so the `calm / floaty / reduced` presets stay consistent.

## Testing

`npm run typecheck` and `npm run build` must both pass before a PR.

## Disclosure

If you submit code that was drafted by an AI tool, please note it in your PR. We're trying to stay honest about what the tools did so the attribution in the README remains accurate.
