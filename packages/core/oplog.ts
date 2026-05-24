import { z } from 'zod';
import {
  NoteGroupSchema,
  TaskCardSchema,
  type NoteGroup,
  type Tab,
  type TaskCard,
  type TaskStatus,
  type TaskSync
} from './schema';

export const OpKindSchema = z.enum([
  'addTab',
  'renameTab',
  'deleteTab',
  'reorderTabs',
  'setProjectContext',
  'addGroup',
  'updateGroupLines',
  'togglePin',
  'setCategory',
  'moveGroup',
  'archiveGroup',
  'restoreGroup',
  'appendGroupLines',
  'setAutoFormatOptOut',
  'setGroupTags',
  'deleteGroup',
  'upsertTaskCard',
  'setTaskStatus',
  'setTaskSyncState'
]);
export type OpKind = z.infer<typeof OpKindSchema>;

export const OpSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  lamport: z.number(),
  spaceId: z.string(),
  kind: OpKindSchema,
  payload: z.record(z.unknown()),
  appliedAt: z.number()
});
export type Op = z.infer<typeof OpSchema>;

export type TaskOutboxEvent = {
  id: string;
  kind: 'task.requested' | 'task.status_changed';
  taskId: string;
  status: TaskStatus;
  at: number;
  note?: string;
};

export type OpState = {
  tabs: Tab[];
  archive: { group: NoteGroup; completedAt: number; tabId: string }[];
  tasks?: TaskCard[];
  taskOutbox?: TaskOutboxEvent[];
};

// Compare two ops for LWW: higher lamport wins; tie broken by clientId string.
export function opAfter(a: Op, b: Op): boolean {
  if (a.lamport !== b.lamport) return a.lamport > b.lamport;
  return a.clientId > b.clientId;
}

function findTab(state: OpState, id: string): Tab | undefined {
  return state.tabs.find((t) => t.id === id);
}

function findGroup(state: OpState, tabId: string, groupId: string): NoteGroup | undefined {
  return findTab(state, tabId)?.groups.find((g) => g.id === groupId);
}

function findTask(state: OpState, taskId: string): TaskCard | undefined {
  return state.tasks?.find((t) => t.id === taskId);
}

function makeTaskOutboxEvent(
  op: Op,
  kind: TaskOutboxEvent['kind'],
  taskId: string,
  status: TaskStatus,
  note?: string
): TaskOutboxEvent {
  return {
    id: `${op.id}:${kind}`,
    kind,
    taskId,
    status,
    at: op.appliedAt,
    ...(note ? { note } : {})
  };
}

export function applyOp(state: OpState, op: Op): OpState {
  const next: OpState = {
    tabs: state.tabs.map((t) => ({ ...t, groups: t.groups.map((g) => ({ ...g })) })),
    archive: state.archive.map((a) => ({ ...a, group: { ...a.group } })),
    tasks: (state.tasks ?? []).map((t) => ({ ...t, sync: { ...t.sync }, tags: [...t.tags], externalLinks: [...t.externalLinks] })),
    taskOutbox: (state.taskOutbox ?? []).map((event) => ({ ...event }))
  };
  const p = op.payload as Record<string, unknown>;
  switch (op.kind) {
    case 'addTab': {
      const t = p.tab as Tab;
      if (!findTab(next, t.id)) next.tabs.push({ ...t, groups: t.groups ?? [] });
      break;
    }
    case 'renameTab': {
      const t = findTab(next, String(p.tabId));
      if (t) t.name = String(p.name);
      break;
    }
    case 'deleteTab': {
      next.tabs = next.tabs.filter((t) => t.id !== String(p.tabId));
      break;
    }
    case 'reorderTabs': {
      const order = (p.order as string[]) ?? [];
      next.tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      next.tabs.forEach((t, i) => (t.order = i));
      break;
    }
    case 'setProjectContext': {
      const t = findTab(next, String(p.tabId));
      if (t) {
        t.projectContext = (p.context as string) || undefined;
        if (Array.isArray(p.aliases)) t.aliases = p.aliases as string[];
      }
      break;
    }
    case 'addGroup': {
      const t = findTab(next, String(p.tabId));
      const gParsed = NoteGroupSchema.safeParse(p.group);
      if (t && gParsed.success && !t.groups.find((g) => g.id === gParsed.data.id)) {
        t.groups.unshift(gParsed.data);
      }
      break;
    }
    case 'updateGroupLines': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) {
        g.lines = (p.lines as string[]) ?? g.lines;
        g.updatedAt = op.appliedAt;
      }
      break;
    }
    case 'appendGroupLines': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) {
        g.lines = [...g.lines, ...((p.lines as string[]) ?? [])];
        g.updatedAt = op.appliedAt;
      }
      break;
    }
    case 'togglePin': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) {
        g.pinned = Boolean(p.pinned);
        g.updatedAt = op.appliedAt;
      }
      break;
    }
    case 'setCategory': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) g.category = (p.category as string) || undefined;
      break;
    }
    case 'moveGroup': {
      const src = findTab(next, String(p.fromTabId));
      const dst = findTab(next, String(p.toTabId));
      if (src && dst) {
        const i = src.groups.findIndex((g) => g.id === String(p.groupId));
        if (i >= 0) {
          const [g] = src.groups.splice(i, 1);
          g.suggestedTabId = undefined;
          dst.groups.unshift(g);
        }
      }
      break;
    }
    case 'archiveGroup': {
      const t = findTab(next, String(p.tabId));
      if (!t) break;
      const i = t.groups.findIndex((g) => g.id === String(p.groupId));
      if (i < 0) break;
      const [g] = t.groups.splice(i, 1);
      next.archive.unshift({ group: g, tabId: t.id, completedAt: Number(p.completedAt) || op.appliedAt });
      break;
    }
    case 'restoreGroup': {
      const i = next.archive.findIndex((a) => a.group.id === String(p.groupId));
      if (i < 0) break;
      const entry = next.archive[i];
      const t = findTab(next, entry.tabId);
      if (!t) break;
      next.archive.splice(i, 1);
      t.groups.unshift(entry.group);
      break;
    }
    case 'setAutoFormatOptOut': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) g.autoFormatOptOut = Boolean(p.optOut);
      break;
    }
    case 'setGroupTags': {
      const g = findGroup(next, String(p.tabId), String(p.groupId));
      if (g) g.tags = (p.tags as string[]) ?? g.tags;
      break;
    }
    case 'deleteGroup': {
      const t = findTab(next, String(p.tabId));
      if (t) t.groups = t.groups.filter((g) => g.id !== String(p.groupId));
      break;
    }
    case 'upsertTaskCard': {
      const parsed = TaskCardSchema.safeParse(p.task);
      if (!parsed.success) break;
      const existing = findTask(next, parsed.data.id);
      const queuedTask: TaskCard = {
        ...parsed.data,
        updatedAt: op.appliedAt,
        sync: { ...parsed.data.sync, state: parsed.data.sync.state === 'local' ? 'queued' : parsed.data.sync.state }
      };
      if (existing) {
        Object.assign(existing, queuedTask);
      } else {
        next.tasks!.push(queuedTask);
      }
      next.taskOutbox!.push(makeTaskOutboxEvent(op, 'task.requested', queuedTask.id, queuedTask.status));
      break;
    }
    case 'setTaskStatus': {
      const task = findTask(next, String(p.taskId));
      const parsedStatus = TaskCardSchema.shape.status.safeParse(p.status);
      if (!task || !parsedStatus.success) break;
      task.status = parsedStatus.data;
      task.updatedAt = op.appliedAt;
      task.sync = { ...task.sync, state: 'queued' };
      next.taskOutbox!.push(
        makeTaskOutboxEvent(op, 'task.status_changed', task.id, task.status, typeof p.note === 'string' ? p.note : undefined)
      );
      break;
    }
    case 'setTaskSyncState': {
      const task = findTask(next, String(p.taskId));
      if (!task) break;
      const syncPatch = (p.sync ?? {}) as Partial<TaskSync>;
      task.sync = { ...task.sync, ...syncPatch };
      if (typeof syncPatch.runnerTaskId === 'string') task.runnerTaskId = syncPatch.runnerTaskId;
      if (typeof syncPatch.monitorTaskId === 'string') task.monitorTaskId = syncPatch.monitorTaskId;
      task.updatedAt = op.appliedAt;
      break;
    }
  }
  return next;
}

export function applyOps(state: OpState, ops: Op[]): OpState {
  let s = state;
  for (const op of ops) s = applyOp(s, op);
  return s;
}
