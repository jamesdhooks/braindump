import { describe, expect, it } from 'vitest';
import { TaskCardSchema, TaskStatusSchema } from './schema';

const baseTask = {
  id: 'task_1',
  projectId: 'family-assistant',
  title: 'Add compact weather card',
  description: 'Build a smaller dashboard card for mobile.',
  status: 'todo',
  priority: 3,
  source: {
    kind: 'note-group',
    tabId: 'tab_1',
    groupId: 'group_1'
  },
  tags: ['ui', 'weather'],
  assignee: 'neo',
  externalLinks: [],
  createdAt: 1000,
  updatedAt: 1000,
  sync: {
    state: 'local',
    outboxEventIds: []
  }
};

describe('TaskStatusSchema', () => {
  it('accepts the canonical Brain Dump / Agent Runner status model', () => {
    expect(TaskStatusSchema.options).toEqual([
      'todo',
      'in_progress',
      'qa_required',
      'user_action_required',
      'blocked',
      'done',
      'archived'
    ]);
  });
});

describe('TaskCardSchema', () => {
  it('validates durable task cards linked back to note groups and runner ids', () => {
    const parsed = TaskCardSchema.parse({
      ...baseTask,
      runnerTaskId: '128',
      monitorTaskId: 'mon_128',
      sync: {
        state: 'synced',
        runnerTaskId: '128',
        monitorTaskId: 'mon_128',
        lastSyncedAt: 2000,
        outboxEventIds: []
      }
    });

    expect(parsed.status).toBe('todo');
    expect(parsed.source).toEqual({ kind: 'note-group', tabId: 'tab_1', groupId: 'group_1' });
    expect(parsed.sync.runnerTaskId).toBe('128');
  });

  it('defaults optional arrays and local sync state for offline-first desktop tasks', () => {
    const parsed = TaskCardSchema.parse({
      id: 'task_2',
      projectId: 'braindump',
      title: 'Draft Kanban layout',
      status: 'in_progress',
      priority: 2,
      createdAt: 1000,
      updatedAt: 1500
    });

    expect(parsed.tags).toEqual([]);
    expect(parsed.externalLinks).toEqual([]);
    expect(parsed.sync).toEqual({ state: 'local', outboxEventIds: [] });
  });
});
