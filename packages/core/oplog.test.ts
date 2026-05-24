import { describe, expect, it } from 'vitest';
import { applyOp, applyOps, type Op, type OpState } from './oplog';
import type { TaskCard } from './schema';

const baseState: OpState = { tabs: [], archive: [], tasks: [], taskOutbox: [] };
const task: TaskCard = {
  id: 'task_1',
  projectId: 'family-assistant',
  title: 'Add compact weather card',
  status: 'todo',
  priority: 3,
  tags: [],
  externalLinks: [],
  createdAt: 1000,
  updatedAt: 1000,
  sync: { state: 'local', outboxEventIds: [] }
};

function op(kind: Op['kind'], payload: Record<string, unknown>, at = 1000): Op {
  return {
    id: `${kind}_${at}`,
    clientId: 'test-client',
    lamport: at,
    spaceId: 'space_1',
    kind,
    payload,
    appliedAt: at
  };
}

describe('task op-log support', () => {
  it('adds a task card locally without sending it to Neo implicitly', () => {
    const state = applyOp(baseState, op('upsertTaskCard', { task }));

    expect(state.tasks!).toHaveLength(1);
    expect(state.tasks![0].title).toBe('Add compact weather card');
    expect(state.tasks![0].sync.state).toBe('local');
    expect(state.taskOutbox!).toEqual([]);
  });

  it('queues task.requested only when James explicitly sends the task to Neo', () => {
    const withTask = applyOp(baseState, op('upsertTaskCard', { task }, 1000));
    const state = applyOp(withTask, op('requestTaskSend', { taskId: 'task_1', reviewConfirmed: true }, 2000));

    expect(state.tasks![0].sync.state).toBe('queued');
    expect(state.tasks![0].sync.outboxEventIds).toEqual(['requestTaskSend_2000:task.requested']);
    expect(state.taskOutbox!).toEqual([
      {
        id: 'requestTaskSend_2000:task.requested',
        kind: 'task.requested',
        taskId: 'task_1',
        status: 'todo',
        at: 2000
      }
    ]);
  });

  it('updates task status and records a status-changed outbox event', () => {
    const state = applyOps(baseState, [
      op('upsertTaskCard', { task }, 1000),
      op('setTaskStatus', { taskId: 'task_1', status: 'qa_required', note: 'Preview ready' }, 2000)
    ]);

    expect(state.tasks![0]).toMatchObject({ status: 'qa_required', updatedAt: 2000 });
    expect(state.taskOutbox!.map((event) => event.kind)).toEqual(['task.status_changed']);
    expect(state.taskOutbox![0]).toMatchObject({ taskId: 'task_1', status: 'qa_required', note: 'Preview ready' });
  });

  it('applies runner sync metadata without creating a new outbound event', () => {
    const state = applyOps(baseState, [
      op('upsertTaskCard', { task }, 1000),
      op(
        'setTaskSyncState',
        {
          taskId: 'task_1',
          sync: {
            state: 'synced',
            runnerTaskId: '128',
            monitorTaskId: 'mon_128',
            monitorUrl: 'http://127.0.0.1:4177/tasks/128',
            lastSyncedAt: 2500,
            outboxEventIds: []
          }
        },
        2500
      )
    ]);

    expect(state.tasks![0].sync).toMatchObject({ state: 'synced', runnerTaskId: '128', monitorTaskId: 'mon_128' });
    expect(state.tasks![0].runnerTaskId).toBe('128');
    expect(state.tasks![0].monitorTaskId).toBe('mon_128');
    expect(state.taskOutbox!).toHaveLength(0);
  });
});
