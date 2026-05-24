---
description: "Use when adding, editing, or reviewing LLM skill files in electron/llm/skills/. Covers runSkill contract, Zod schema requirements, SkillFeature registration, and graceful no-provider fallback."
applyTo: "electron/llm/skills/**"
---

# LLM Skill Rules

All skills must go through [runSkill.ts](../../electron/llm/skills/runSkill.ts). Use [format.ts](../../electron/llm/skills/format.ts) as the canonical example.

## Checklist for every new skill

1. Define a **Zod output schema** in the skill file — the runner validates against it and retries once on malformed JSON.
2. Call `runSkill({ feature, schema, buildMessages, input })` — never call `complete()` directly.
3. Use an existing `SkillFeature` value from [types.ts](../../electron/llm/skills/types.ts). If you need a new one:
   - Add it to the `SkillFeature` union in `types.ts`
   - Add the `featureMap` entry in `runSkill.ts`
   - Add the `featureProviderOverrides` key in [electron/store.ts](../../electron/store.ts) `DEFAULT_STATE`
4. System prompt must end with **"Output ONLY a JSON object matching the schema: { … }"** — any prose before the JSON breaks the retry path.
5. Return early with a safe default when `result.ok === false` (no provider configured, network error, etc.). Never throw from a skill caller.

## Anti-patterns

- Don't call `complete()` / `embed()` / `vision()` directly from a skill — provider selection, privacy redaction, and token accounting live in `runSkill`.
- Don't add a new `SkillFeature` without updating all three places (types, featureMap, store defaults).
- Don't assume a provider exists — the app must work with zero API keys configured.
