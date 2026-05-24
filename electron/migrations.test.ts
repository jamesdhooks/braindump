import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, runMigrations } from './migrations';

describe('task integration migration', () => {
  it('adds offline task and Agent Runner integration defaults to existing stores', () => {
    const migrated = runMigrations({
      version: 5,
      tabs: [],
      activeTabId: 'inbox',
      archive: [],
      brainstorms: [],
      providers: [],
      activeProviderId: 'openai',
      featureProviderOverrides: {},
      autoFormat: {},
      ui: {},
      categories: [],
      skills: [],
      usage: { perDay: {} }
    });

    expect(CURRENT_VERSION).toBe(6);
    expect(migrated.tasks).toEqual([]);
    expect(migrated.taskOutbox).toEqual([]);
    expect(migrated.integrations.agentRunner).toEqual({
      enabled: false,
      endpoint: '',
      tokenRef: undefined,
      defaultProjectId: undefined,
      sendRequiresReview: true,
      syncMonitorSnapshots: false
    });
  });

  it('preserves existing task integration state', () => {
    const migrated = runMigrations({
      version: 5,
      tabs: [],
      activeTabId: 'inbox',
      archive: [],
      brainstorms: [],
      providers: [],
      activeProviderId: 'openai',
      featureProviderOverrides: {},
      autoFormat: {},
      ui: {},
      categories: [],
      skills: [],
      tasks: [{ id: 'task_1' }],
      taskOutbox: [{ id: 'evt_1' }],
      integrations: {
        agentRunner: {
          enabled: true,
          endpoint: 'http://127.0.0.1:4177',
          sendRequiresReview: false,
          syncMonitorSnapshots: true
        }
      },
      usage: { perDay: {} }
    });

    expect(migrated.tasks).toEqual([{ id: 'task_1' }]);
    expect(migrated.taskOutbox).toEqual([{ id: 'evt_1' }]);
    expect(migrated.integrations.agentRunner).toMatchObject({
      enabled: true,
      endpoint: 'http://127.0.0.1:4177',
      sendRequiresReview: false,
      syncMonitorSnapshots: true
    });
  });
});
