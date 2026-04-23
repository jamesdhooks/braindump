import type { PersistedStore } from '../src/types';
import { loadWithRecovery, writeStore, writeStartupSnapshot, type LoadResult } from './persistence';
import { runMigrations, CURRENT_VERSION } from './migrations';

const DEFAULT_AUTO_FORMAT = {
  enabled: false,
  aggressiveness: 'tidy' as const,
  touchPinned: false,
  excludedTabIds: [] as string[],
  minAgeSeconds: 60,
  maxRequestsPerMinute: 10,
  maxGroupsPerBatch: 3,
  preserveVoice: true,
  requireConfidenceAbove: 0.6,
  dailyRequestCap: 500
};

export const DEFAULT_STATE: PersistedStore = {
  version: CURRENT_VERSION,
  tabs: [
    { id: 'inbox', name: 'Inbox', order: 0, groups: [] },
    { id: 'today', name: 'Today', order: 1, groups: [] },
    { id: 'ideas', name: 'Ideas', order: 2, groups: [] }
  ],
  activeTabId: 'inbox',
  archive: [],
  brainstorms: [],
  providers: [
    {
      id: 'openai',
      label: 'OpenAI',
      model: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      temperature: 0.4
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.4
    },
    {
      id: 'gemini',
      label: 'Google Gemini',
      model: 'gemini-1.5-flash',
      embeddingModel: 'text-embedding-004',
      temperature: 0.4
    },
    {
      id: 'ollama',
      label: 'Ollama (local)',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'llama3.2',
      temperature: 0.4
    }
  ],
  activeProviderId: 'openai',
  featureProviderOverrides: {},
  autoFormat: DEFAULT_AUTO_FORMAT,
  ui: {
    theme: 'dark',
    focus: false,
    archiveOpen: false,
    brainstormOpen: false,
    motion: 'calm',
    privacy: {
      neverSendPinned: true,
      redactEmails: true,
      redactApiLikeStrings: true
    },
    dailyDigestEnabled: false,
    semanticSearchEnabled: true,
    autoSort: false,
    dailyReportHour: 8
  },
  categories: [
    { id: 'quick-thought', label: 'Quick thought', color: '#8ab4ff' },
    { id: 'code-feature', label: 'Code feature', color: '#9effc7' },
    { id: 'household-todo', label: 'Household todo', color: '#ffd38a' }
  ],
  claw: {
    defaultBackend: 'claude-code',
    autoSendCategories: [],
    allowOutsideCwd: false,
    allowGitPush: false,
    allowRm: false
  },
  clawJobs: [],
  usage: {
    perDay: {}
  }
};

let cached: PersistedStore | null = null;
let loadInfo: LoadResult | null = null;

export function initStore(): LoadResult {
  const res = loadWithRecovery();
  if (res.store) {
    cached = runMigrations(res.store as unknown as Record<string, unknown>);
  } else {
    cached = DEFAULT_STATE;
  }
  writeStartupSnapshot(cached);
  loadInfo = res;
  return res;
}

export function getLoadInfo(): LoadResult | null {
  return loadInfo;
}

export function getState(): PersistedStore {
  if (!cached) {
    initStore();
  }
  return cached!;
}

export function setState(next: PersistedStore) {
  cached = next;
  void writeStore(next);
}

export function patchState(patch: Partial<PersistedStore>) {
  cached = { ...getState(), ...patch };
  void writeStore(cached);
}

export function resetState() {
  cached = DEFAULT_STATE;
  void writeStore(cached);
}
