# NeoLocal / Agent Runner Integration

Brain Dump should become the human-facing planning and task surface for NeoLocal work while staying local-first and private by default.

## Responsibility split

| System | Owns | Must not own |
|---|---|---|
| Brain Dump | Capture, project organization, Kanban/task UX, explicit “Send to Neo” intent, local outbox state | Shell execution, worktree lifecycle, direct monitor database writes |
| Agent Runner | Queue/task lifecycle, project configs, branches/worktrees, previews, tests, PRs, promotion gates | Brain Dump notes, private capture corpus, raw attachment storage |
| Monitor | Run events, logs, worker telemetry, todo snapshots, redacted task status API | Primary task editing UX, canonical Brain Dump storage |
| Hermes / NeoLocal | Intent classification, safe routing, approvals, bidirectional summaries | Silent destructive actions, unredacted secret/note exposure |

The integration should be a loose contract between systems, not a tight coupling to Agent Runner internals.

## Human loop

1. James captures tasks, ideas, or project notes in Brain Dump.
2. Brain Dump can promote selected note groups into durable `TaskCard` records.
3. James organizes tasks by project and status.
4. James explicitly sends a task to Neo / Agent Runner.
5. Brain Dump records an outbox event and sync state.
6. Agent Runner/Monitor returns runner IDs, status updates, redacted summaries, and artifacts.
7. Brain Dump displays those updates beside the task and lets James advance/check off status.

## Canonical status model

Brain Dump should use a small stable status enum that maps cleanly onto Agent Runner and Monitor states:

| Brain Dump status | Runner/Monitor examples | Meaning |
|---|---|---|
| `todo` | queued / not submitted | Human task exists; not actively worked |
| `in_progress` | claimed / running / building | Agent or human work is underway |
| `qa_required` | preview_ready / pr_open / review-required | Needs QA or James review |
| `user_action_required` | waiting-input / approval-needed | Needs a credential, approval, answer, or scope decision |
| `blocked` | failed / blocked | Cannot proceed until dependency/problem is resolved |
| `done` | completed / merged / manually checked | Work is complete |
| `archived` | cancelled / archived | Hidden from active board but retained |

## First implementation slice

This repo should start with local durable data structures before UI or network work:

1. Add `TaskStatus` and `TaskCard` schema/types in `packages/core/schema.ts`.
2. Add task-related op-log operations so the optional web/API stack can replay task state.
3. Add persisted desktop store fields for `tasks`, `taskOutbox`, and `integrations.agentRunner` defaults.
4. Keep network calls disabled until James configures an endpoint/token and clicks an explicit send action.

## Safety and privacy rules

- Do not sync all notes just because an integration exists.
- “Send to Neo” must show exactly which title, description, project, tags, and links will be sent.
- Monitor data shown in Brain Dump should be redacted/summarized by default.
- Raw LLM logs, Electron safeStorage secrets, attachments, note databases, and API keys must never be exposed through generic integration endpoints unless James explicitly enables it.
- Production deploys, merges, destructive cleanup, cancellation, and promotion remain Agent Runner approval-gated.

## Generic event shape

Brain Dump should emit versioned events that an adapter can translate to Agent Runner/Monitor:

```json
{
  "id": "evt_123",
  "kind": "task.requested",
  "source": "braindump",
  "source_task_id": "task_123",
  "project_id": "family-assistant",
  "title": "Add compact weather card",
  "description": "Selected note text or task body.",
  "status": "todo",
  "requested_by": "james",
  "created_at": "2026-05-24T00:00:00Z"
}
```

Agent Runner/Monitor should reply with task mappings and redacted snapshots rather than asking Brain Dump to read their private files directly.
