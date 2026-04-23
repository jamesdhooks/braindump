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

export type DailyDigest = {
  date: string;
  headline: string;
  byTab: { tabId: string; summary: string; highlights: string[] }[];
  carryForward: string[];
  stale: string[];
};

export type ClawConfig = {
  binaryPath?: string;
  defaultBackend: string;
  autoSendCategories: string[];
  allowOutsideCwd: boolean;
  allowGitPush: boolean;
  allowRm: boolean;
};

export type ClawDraft = {
  goal: string;
  constraints: string[];
  acceptance_criteria: string[];
  artifacts_to_produce: string[];
  safety_notes: string[];
};

export type ClawJobArtifact = {
  id: string;
  kind: 'diff' | 'file' | 'link' | 'analytics' | 'text';
  path?: string;
  title?: string;
  text?: string;
  unifiedDiff?: string;
  rows?: Record<string, unknown>[];
  url?: string;
  action?: 'created' | 'modified' | 'deleted';
};

export type ClawJobEvent =
  | { at: number; kind: 'thinking'; text: string }
  | { at: number; kind: 'log'; level: 'info' | 'warn' | 'error'; text: string }
  | { at: number; kind: 'tool-call'; tool: string; args: Record<string, unknown>; id: string }
  | { at: number; kind: 'tool-result'; id: string; ok: boolean; text?: string }
  | { at: number; kind: 'status'; state: 'running' | 'waiting-input' | 'done' | 'error'; progress?: number }
  | { at: number; kind: 'prompt'; promptId: string; question: string; options?: string[] }
  | { at: number; kind: 'user-reply'; promptId: string; text: string }
  | { at: number; kind: 'safety-block'; reason: string };

export type ClawJob = {
  sessionId: string;
  tabId: string;
  groupId: string;
  startedAt: number;
  endedAt?: number;
  backend: string;
  state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
  draft: ClawDraft;
  skills: string[];
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
  pendingPrompts: { promptId: string; question: string; options?: string[] }[];
  summary?: string;
  metrics?: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
};

export type SavedSearch = {
  id: string;
  label: string;
  query: string;
  scope: ('all' | 'activeTab' | 'pinned' | 'archive' | 'brainstorms' | 'ocr')[];
  createdAt: number;
};

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
    autoSort: boolean;
    dailyReportHour: number;
  };
  categories: Category[];
  digests?: DailyDigest[];
  savedSearches?: SavedSearch[];
  claw?: ClawConfig;
  clawJobs?: ClawJob[];
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
