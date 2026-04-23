export type LLMProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'custom';

export type LLMProviderConfig = {
  id: LLMProviderId;
  label: string;
  baseUrl?: string;
  model: string;
  embeddingModel?: string;
  temperature: number;
  maxTokens?: number;
};

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LLMResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export type Attachment = {
  id: string;
  kind: 'image';
  path: string;
  ext?: string;
  size?: number;
  ocrText?: string;
  caption?: string;
};

export type RevisionSource = 'user' | 'auto-format' | 'ramble' | 'brainstorm' | 'llm-edit' | 'import';

export type Revision = {
  id: string;
  at: number;
  source: RevisionSource;
  lines: string[];
  model?: string;
  diffSummary?: string;
};

export type NoteGroup = {
  id: string;
  lines: string[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  tags?: string[];
  attachments?: Attachment[];
  history: Revision[];
  formattedHashes: string[];
  autoFormatOptOut?: boolean;
  brainstormId?: string;
  category?: string;
  suggestedTabId?: string;
};

export type Category = {
  id: string;
  label: string;
  color: string;
  icon?: string;
};

export type MotionPreset = 'calm' | 'floaty' | 'reduced';

export type ArchiveEntry = {
  group: NoteGroup;
  completedAt: number;
  tabId: string;
};

export type Tab = {
  id: string;
  name: string;
  color?: string;
  order: number;
  groups: NoteGroup[];
  autoFormatEnabled?: boolean;
  projectContext?: string;
  aliases?: string[];
};

export type BrainstormMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: number;
};

export type BrainstormSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: BrainstormMessage[];
  captured?: { tabId: string; groupId: string };
};

export type AutoFormatAggressiveness = 'tidy' | 'restructure' | 'rewrite';

export type AutoFormatConfig = {
  enabled: boolean;
  aggressiveness: AutoFormatAggressiveness;
  touchPinned: boolean;
  excludedTabIds: string[];
  minAgeSeconds: number;
  maxRequestsPerMinute: number;
  maxGroupsPerBatch: number;
  preserveVoice: boolean;
  requireConfidenceAbove: number;
  dailyRequestCap: number;
};

export type AutoFormatStatus = {
  state: 'idle' | 'queued' | 'formatting' | 'error';
  queued: number;
  lastAction: string | null;
};

export type UsageDay = {
  autoFormat: number;
  ramble: number;
  brainstorm: number;
  other: number;
  inputTokens: number;
  outputTokens: number;
};

export type PersistedStore = {
  version: number;
  tabs: Tab[];
  activeTabId: string;
  archive: ArchiveEntry[];
  brainstorms: BrainstormSession[];
  providers: LLMProviderConfig[];
  activeProviderId: LLMProviderId;
  featureProviderOverrides: Partial<Record<'autoFormat' | 'ramble' | 'brainstorm' | 'embeddings' | 'vision' | 'tag', LLMProviderId>>;
  autoFormat: AutoFormatConfig;
  ui: {
    theme: 'dark' | 'light' | 'system';
    focus: boolean;
    archiveOpen: boolean;
    brainstormOpen: boolean;
    motion: MotionPreset;
    privacy: {
      neverSendPinned: boolean;
      redactEmails: boolean;
      redactApiLikeStrings: boolean;
    };
    dailyDigestEnabled: boolean;
    semanticSearchEnabled: boolean;
  };
  categories: Category[];
  usage: {
    perDay: Record<string, UsageDay>;
    monthlyCapUsd?: number;
  };
};

declare global {
  interface Window {
    braindump: import('../electron/preload').BraindumpAPI;
  }
}
