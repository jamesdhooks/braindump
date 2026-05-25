import { describe, expect, it } from 'vitest';
import { buildSendToNeoReview, promoteNoteGroupToTaskCard } from './taskCard';
import type { NoteGroup, Tab } from './schema';

const group: NoteGroup = {
  id: 'group_1',
  lines: ['Add explicit Send to Neo review', 'Show title, description, project, tags, and note source before queueing.'],
  createdAt: 1000,
  updatedAt: 1200,
  pinned: true,
  tags: ['neo', 'workflow'],
  history: [],
  formattedHashes: []
};

const tab: Tab = {
  id: 'tab_braindump',
  name: 'Brain Dump',
  order: 0,
  groups: [group],
  projectContext: 'braindump',
  aliases: ['braindump', 'tasks']
};

describe('promoteNoteGroupToTaskCard', () => {
  it('derives a local TaskCard from a selected note group without queueing sync implicitly', () => {
    const task = promoteNoteGroupToTaskCard({
      group,
      tab,
      id: 'task_group_1',
      projectId: 'braindump',
      now: 2000
    });

    expect(task).toMatchObject({
      id: 'task_group_1',
      projectId: 'braindump',
      title: 'Add explicit Send to Neo review',
      description: 'Show title, description, project, tags, and note source before queueing.',
      status: 'todo',
      priority: 1,
      source: { kind: 'note-group', tabId: 'tab_braindump', groupId: 'group_1' },
      tags: ['neo', 'workflow'],
      sync: { state: 'local', outboxEventIds: [] }
    });
    expect(task.createdAt).toBe(2000);
    expect(task.updatedAt).toBe(2000);
  });
});

describe('buildSendToNeoReview', () => {
  it('creates the explicit human review payload before an outbox send', () => {
    const task = promoteNoteGroupToTaskCard({ group, tab, id: 'task_group_1', projectId: 'braindump', now: 2000 });

    const review = buildSendToNeoReview(task);

    expect(review).toEqual({
      taskId: 'task_group_1',
      projectId: 'braindump',
      title: 'Add explicit Send to Neo review',
      description: 'Show title, description, project, tags, and note source before queueing.',
      status: 'todo',
      tags: ['neo', 'workflow'],
      source: { kind: 'note-group', tabId: 'tab_braindump', groupId: 'group_1' },
      requiresConfirmation: true
    });
  });
});
