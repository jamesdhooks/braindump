import Store from 'electron-store';
import type { PersistedStore } from '../src/types';

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

const DEFAULT_STATE: PersistedStore = {
  version: 1,
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
    privacy: {
      neverSendPinned: true,
      redactEmails: true,
      redactApiLikeStrings: true
    },
    dailyDigestEnabled: false,
    semanticSearchEnabled: true
  },
  usage: {
    perDay: {}
  }
};

const store = new Store<PersistedStore>({
  name: 'braindump',
  defaults: DEFAULT_STATE,
  clearInvalidConfig: false,
  migrations: {}
});

export function getState(): PersistedStore {
  return store.store;
}

export function setState(next: PersistedStore) {
  store.store = next;
}

export function patchState(patch: Partial<PersistedStore>) {
  store.store = { ...store.store, ...patch };
}

export function resetState() {
  store.clear();
  store.store = DEFAULT_STATE;
}

export { DEFAULT_STATE };
