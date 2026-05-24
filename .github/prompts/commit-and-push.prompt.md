---
description: "Stage all changes, craft a Conventional Commits message, commit, and push to the current remote branch."
argument-hint: "Briefly describe what changed, e.g. 'add QA tray button and selection mode'"
agent: "agent"
---

Stage every changed file, write a **Conventional Commits** message based on what changed, then commit and push to the current branch.

## Commit message rules

Follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short summary>

<optional body — wrap at 72 chars>

<optional footers>
```

**Types** (pick the single best fit):

| Type | When |
|---|---|
| `feat` | New user-visible feature |
| `fix` | Bug fix |
| `refactor` | Code restructure with no behaviour change |
| `perf` | Performance improvement |
| `style` | Formatting, tokens, CSS only |
| `test` | Adding or fixing tests |
| `chore` | Tooling, deps, config (no prod code change) |
| `docs` | Documentation only |
| `build` | Build system / scripts |
| `ci` | CI pipeline changes |

**Rules:**
- Summary line ≤ 72 characters, lowercase, no period at end.
- Scope is optional; use the affected subsystem if helpful (e.g. `llm`, `store`, `renderer`, `ipc`, `persistence`).
- Body explains *why*, not *what* — omit if the summary is self-evident.
- If the change fixes a bug reference it: `Fixes #<issue>`.
- Breaking changes: append `!` after type/scope and add `BREAKING CHANGE:` footer.

## Steps to execute

1. `git add -A`
2. Inspect `git diff --cached --stat` to understand what changed.
3. Compose the commit message following the rules above.
4. `git commit -m "<message>"` (use `-m` twice for body if needed).
5. `git push`

If there is nothing staged after step 1, report that and stop.
If `git push` is rejected (non-fast-forward), report the error and do **not** force-push — ask the user how to proceed.
