import type { TaskCard, TaskOutboxEvent } from '../packages/core';

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
export type GroupRenderAs = 'tasks';

export type Revision = {
  id: string;
  at: number;
  source: RevisionSource;
  lines: string[];
  model?: string;
  diffSummary?: string;
  exchange?: {
    messages: LLMMessage[];
    response: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    provider?: string;
  };
};

export type NoteGroup = {
  id: string;
  lines: string[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  completedAt?: number;
  tags?: string[];
  attachments?: Attachment[];
  history: Revision[];
  formattedHashes: string[];
  autoFormatOptOut?: boolean;
  brainstormId?: string;
  category?: string;
  suggestedTabId?: string;
  renderAs?: GroupRenderAs;
  /** Per-line state by line index. Used for sub-task checkbox toggles. */
  subStates?: Record<number, { completed?: boolean }>;
  /** Set when QA has been performed (Phase 5: code-feature gate before archiving). */
  qaAt?: number | null;
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
  overview?: {
    createdCount: number;
    completedCount: number;
    qaCount: number;
    archivedCount: number;
    summary: string;
  };
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

export type TaskComplexity = 'simple' | 'complex' | 'crazy';
export type TaskComplexitySource = 'manual' | 'automatic';

export type RunnerCliConfig = {
  enabled: boolean;
  binaryPath?: string;
  model?: { simple?: string; complex?: string; crazy?: string };
  extraArgs?: string[];
};

export type RunnersConfig = {
  claudeCli?: RunnerCliConfig;
  copilotCli?: RunnerCliConfig;
};

export type RunnerStatusInfo = {
  id: 'claude-cli' | 'copilot-cli';
  enabled: boolean;
  available: boolean;
  binary?: string;
  version?: string;
  error?: string;
};

export type AppSkillCwdMode = 'active-tab-project-or-repo' | 'repo';

export type AppSkillClawExecutor = {
  kind: 'claw';
  backend?: string;
  skillId: string;
  skillFileName: string;
  skillInstructions: string;
  system?: string;
  prompt: string;
  cwdMode: AppSkillCwdMode;
};

export type AppSkillRawExecutor = {
  kind: 'raw';
  shell: 'powershell' | 'cmd';
  command: string;
  elevated?: boolean;
  cwdMode: AppSkillCwdMode;
};

export type AppSkillExecutor = AppSkillClawExecutor | AppSkillRawExecutor;

export type AppSkillDraft = {
  title: string;
  description: string;
  request: string;
  executor: AppSkillExecutor;
};

export type AppSkill = AppSkillDraft & {
  id: string;
  createdAt: number;
  updatedAt: number;
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
  report?: JobReport;
  skillId?: string;
  skillTitle?: string;
  metrics?: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
  /** Full record of what was sent to the agent for auditing / debugging. */
  invocation?: {
    executionType?: 'claw' | 'runner' | 'raw';
    runnerId?: 'claude-cli' | 'copilot-cli';
    complexity?: TaskComplexity;
    complexitySource?: TaskComplexitySource;
    binary: string;
    args: string[];
    prompt: string;
    system?: string;
    cwd?: string;
  };
};

export type JobReport = {
  status: 'success' | 'partial' | 'failed';
  summary: string;
  completed: string[];
  changes: string[];
  blockers: string[];
  next_steps: string[];
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
  lastPrioritySortAt?: number;
  groups: NoteGroup[];
  autoFormatEnabled?: boolean;
  projectContext?: string;
  projectPath?: string;
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
  formatStyle?: 'plain' | 'markdown';
  guidance?: string;
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

export type AgentRunnerIntegrationConfig = {
  enabled: boolean;
  endpoint: string;
  tokenRef?: string;
  defaultProjectId?: string;
  sendRequiresReview: boolean;
  syncMonitorSnapshots: boolean;
};

export type IntegrationsConfig = {
  agentRunner: AgentRunnerIntegrationConfig;
};

export type PersistedStore = {
  version: number;
  tabs: Tab[];
  activeTabId: string;
  archive: ArchiveEntry[];
  brainstorms: BrainstormSession[];
  tasks: TaskCard[];
  taskOutbox: TaskOutboxEvent[];
  integrations: IntegrationsConfig;
  providers: LLMProviderConfig[];
  activeProviderId: LLMProviderId;
  featureProviderOverrides: Partial<Record<'autoFormat' | 'ramble' | 'brainstorm' | 'embeddings' | 'vision' | 'tag', LLMProviderId>>;
  autoFormat: AutoFormatConfig;
  ui: {
    theme: 'dark' | 'light' | 'system';
    accentColor: string;
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
  skills?: AppSkill[];
  claw?: ClawConfig;
  clawJobs?: ClawJob[];
  runners?: RunnersConfig;
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
