import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from './index';
import type { PersistedStore } from '../types';

function installBraindumpMock() {
  vi.useFakeTimers();
  const setState = vi.fn();
  const enqueue = vi.fn();
  vi.stubGlobal('window', {
    braindump: {
      setState,
      sync: { enqueue },
      skill: undefined,
      embeddings: { drop: vi.fn() },
      attachments: { delete: vi.fn() },
      autoFormat: { toggle: vi.fn() }
    }
  });
  return { setState, enqueue };
}

const baseStore: PersistedStore = {
  version: 1,
  tabs: [
    {
      id: 'tab_braindump',
      name: 'Brain Dump',
      order: 0,
      projectContext: 'braindump',
      aliases: ['tasks'],
      groups: [
        {
          id: 'group_1',
          lines: ['Ship Send to Neo review', 'Require explicit confirmation before queueing runner work.'],
          createdAt: 1000,
          updatedAt: 1200,
          pinned: true,
          tags: ['neo'],
          history: [],
          formattedHashes: []
        }
      ]
    }
  ],
  activeTabId: 'tab_braindump',
  archive: [],
  brainstorms: [],
  tasks: [],
  taskOutbox: [],
  integrations: {
    agentRunner: {
      enabled: true,
      endpoint: 'http://127.0.0.1:4177',
      sendRequiresReview: true,
      syncMonitorSnapshots: true
    }
  },
  providers: [],
  activeProviderId: 'openai',
  featureProviderOverrides: {},
  autoFormat: {
    enabled: false,
    aggressiveness: 'tidy',
    touchPinned: false,
    excludedTabIds: [],
    minAgeSeconds: 60,
    maxRequestsPerMinute: 10,
    maxGroupsPerBatch: 3,
    preserveVoice: true,
    requireConfidenceAbove: 0.6,
    dailyRequestCap: 500
  },
  ui: {
    theme: 'dark',
    accentColor: '#7c8cff',
    focus: false,
    archiveOpen: false,
    brainstormOpen: false,
    motion: 'calm',
    privacy: { neverSendPinned: true, redactEmails: true, redactApiLikeStrings: true },
    dailyDigestEnabled: false,
    semanticSearchEnabled: true,
    autoSort: false,
    dailyReportHour: 8
  },
  categories: [],
  claw: {
    defaultBackend: 'claude-code',
    autoSendCategories: [],
    allowOutsideCwd: false,
    allowGitPush: false,
    allowRm: false
  },
  clawJobs: [],
  runners: {},
  usage: { perDay: {} }
};

describe('task store actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    installBraindumpMock();
    useStore.setState({
      ...baseStore,
      tasks: [],
      taskOutbox: [],
      highlightedLines: {},
      pulseOpen: false,
      pulseData: null,
      dailyReportOpen: false,
      clawPanelOpen: false,
      clawFilterGroupId: null,
      clawDraftFor: null,
      clawBrokerState: { status: 'disconnected', backends: [], skills: [], transport: 'none', sessions: [] },
      clawSkillsEditorOpen: false,
      runnerStatuses: [],
      unreadCompletedClawJobIds: [],
      selectedGroupIds: [],
      selectMode: false,
      focusedGroupId: null,
      searchOpen: false,
      searchQuery: '',
      settingsOpen: false,
      rambleOpen: false,
      historyForGroupId: null,
      autoFormatStatus: { state: 'idle', queued: 0, lastAction: null },
      recentlyFormatted: {},
      undoStack: [],
      toast: null,
      hydrated: true
    });
  });

  it('promotes a note group into a local TaskCard without queueing an outbox event', () => {
    const taskId = useStore.getState().promoteGroupToTask('tab_braindump', 'group_1');

    expect(taskId).toMatch(/^task_group_1_/);
    expect(useStore.getState().tasks[0]).toMatchObject({
      id: taskId,
      projectId: 'braindump',
      title: 'Ship Send to Neo review',
      sync: { state: 'local', outboxEventIds: [] },
      source: { kind: 'note-group', tabId: 'tab_braindump', groupId: 'group_1' }
    });
    expect(useStore.getState().taskOutbox).toEqual([]);
  });

  it('queues task.requested only after explicit Send to Neo confirmation', () => {
    const taskId = useStore.getState().promoteGroupToTask('tab_braindump', 'group_1')!;

    const review = useStore.getState().sendTaskToNeo(taskId);

    expect(review).toMatchObject({ taskId, projectId: 'braindump', requiresConfirmation: true });
    expect(useStore.getState().tasks[0].sync.state).toBe('queued');
    expect(useStore.getState().tasks[0].sync.outboxEventIds).toHaveLength(1);
    expect(useStore.getState().taskOutbox[0]).toMatchObject({
      kind: 'task.requested',
      taskId,
      status: 'todo'
    });
  });
});
