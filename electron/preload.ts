import { contextBridge, ipcRenderer } from 'electron';
import type { PersistedStore, LLMMessage, LLMResult, AutoFormatStatus } from '../src/types';

type SkillResult<T> = {
  ok: boolean;
  value: T | null;
  raw: string;
  error?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

type ClawBrokerState = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  clawVersion?: string;
  backends: string[];
  skills: string[];
  transport: 'stdio' | 'none';
  binary?: string;
  lastError?: string;
  sessions: string[];
};

type ClawInbound =
  | { seq: number; type: 'welcome'; clawVersion: string; backends: string[]; skills: string[] }
  | { seq: number; type: 'pong' }
  | { seq: number; type: 'log'; sessionId: string; level: 'info' | 'warn' | 'error'; text: string }
  | { seq: number; type: 'thinking'; sessionId: string; text: string }
  | { seq: number; type: 'tool-call'; sessionId: string; tool: string; args: Record<string, unknown>; id: string }
  | { seq: number; type: 'tool-result'; sessionId: string; id: string; ok: boolean; text?: string; artifacts?: unknown[] }
  | { seq: number; type: 'prompt'; sessionId: string; promptId: string; question: string; options?: string[] }
  | { seq: number; type: 'status'; sessionId: string; state: 'running' | 'waiting-input' | 'done' | 'error'; progress?: number }
  | {
      seq: number;
      type: 'done';
      sessionId: string;
      summary: string;
      metrics: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
    };

type StreamHandle = {
  id: string;
  cancel: () => void;
};

const api = {
  getState: (): Promise<PersistedStore> => ipcRenderer.invoke('store:get'),
  setState: (next: PersistedStore) => ipcRenderer.invoke('store:set', next),
  patchState: (patch: Partial<PersistedStore>) => ipcRenderer.invoke('store:patch', patch),
  resetState: () => ipcRenderer.invoke('store:reset'),
  onStateChanged: (cb: (s: PersistedStore) => void): (() => void) => {
    const l = (_e: unknown, s: PersistedStore) => cb(s);
    ipcRenderer.on('state:changed', l);
    return () => {
      ipcRenderer.removeListener('state:changed', l);
    };
  },

  minimizeToTray: () => ipcRenderer.invoke('window:minimize-to-tray'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (cb: (maximized: boolean) => void): (() => void) => {
    const l = (_e: unknown, v: boolean) => cb(v);
    ipcRenderer.on('window:maximized-change', l);
    return () => { ipcRenderer.removeListener('window:maximized-change', l); };
  },
  hideQuickCapture: () => ipcRenderer.invoke('window:hide-quick'),

  onOpenSettings: (cb: () => void): (() => void) => {
    const l = () => cb();
    ipcRenderer.on('ui:open-settings', l);
    return () => {
      ipcRenderer.removeListener('ui:open-settings', l);
    };
  },
  onOpenRamble: (cb: () => void): (() => void) => {
    const l = () => cb();
    ipcRenderer.on('ui:open-ramble', l);
    return () => {
      ipcRenderer.removeListener('ui:open-ramble', l);
    };
  },
  onOpenBrainstorm: (cb: () => void): (() => void) => {
    const l = () => cb();
    ipcRenderer.on('ui:open-brainstorm', l);
    return () => {
      ipcRenderer.removeListener('ui:open-brainstorm', l);
    };
  },
  onCaptureSubmit: (cb: (payload: { tabId: string | null; text: string }) => void): (() => void) => {
    const l = (_e: unknown, p: { tabId: string | null; text: string }) => cb(p);
    ipcRenderer.on('capture:submit', l);
    return () => {
      ipcRenderer.removeListener('capture:submit', l);
    };
  },
  submitQuickCapture: (tabId: string | null, text: string) =>
    ipcRenderer.invoke('capture:submit', { tabId, text }),
  onQuickTarget: (cb: (payload: { tabId: string | null }) => void): (() => void) => {
    const l = (_e: unknown, p: { tabId: string | null }) => cb(p);
    ipcRenderer.on('quick-capture:target', l);
    return () => {
      ipcRenderer.removeListener('quick-capture:target', l);
    };
  },

  secrets: {
    setKey: (key: string, value: string) => ipcRenderer.invoke('secrets:set-key', { key, value }),
    hasKey: (key: string) => ipcRenderer.invoke('secrets:has-key', { key }) as Promise<boolean>,
    list: () => ipcRenderer.invoke('secrets:list') as Promise<string[]>
  },

  llm: {
    complete: (args: {
      providerId: string;
      messages: LLMMessage[];
      jsonMode?: boolean;
      feature: string;
      temperature?: number;
      maxTokens?: number;
    }): Promise<LLMResult> => ipcRenderer.invoke('llm:complete', args),
    completeStream: (args: {
      providerId: string;
      messages: LLMMessage[];
      jsonMode?: boolean;
      feature: string;
      temperature?: number;
      maxTokens?: number;
      onToken: (t: string) => void;
      onDone?: (r: LLMResult) => void;
    }): StreamHandle => {
      const streamId = Math.random().toString(36).slice(2);
      const tokenChan = `llm:stream:${streamId}`;
      const endChan = `llm:stream-end:${streamId}`;
      const onT = (_e: unknown, t: string) => args.onToken(t);
      const onE = (_e: unknown, r: LLMResult) => {
        args.onDone?.(r);
        ipcRenderer.removeListener(tokenChan, onT);
        ipcRenderer.removeListener(endChan, onE);
      };
      ipcRenderer.on(tokenChan, onT);
      ipcRenderer.on(endChan, onE);
      ipcRenderer.invoke('llm:complete', { ...args, streamId }).catch(() => {
        ipcRenderer.removeListener(tokenChan, onT);
        ipcRenderer.removeListener(endChan, onE);
      });
      return {
        id: streamId,
        cancel: () => {
          ipcRenderer.removeListener(tokenChan, onT);
          ipcRenderer.removeListener(endChan, onE);
        }
      };
    },
    embed: (args: { providerId?: string; texts: string[] }) => ipcRenderer.invoke('llm:embed', args) as Promise<number[][]>,
    vision: (args: { providerId?: string; imagePath: string; imageBase64?: string; prompt: string }) =>
      ipcRenderer.invoke('llm:vision', args) as Promise<string>,
    listModels: (providerId: string) => ipcRenderer.invoke('llm:list-models', { providerId }) as Promise<string[]>,
    testConnection: (providerId: string) => ipcRenderer.invoke('llm:test-connection', { providerId }) as Promise<{ ok: boolean; latencyMs: number; text: string; model: string; inputTokens: number; outputTokens: number }>,
    providerSecretKeyName: (providerId: string) => ipcRenderer.invoke('llm:provider-secret-keyname', { providerId }) as Promise<string>
  },

  autoFormat: {
    toggle: (enabled?: boolean) => ipcRenderer.invoke('autoformat:toggle', enabled) as Promise<boolean>,
    status: () => ipcRenderer.invoke('autoformat:status') as Promise<AutoFormatStatus>,
    tick: () => ipcRenderer.invoke('autoformat:tick'),
    onStatus: (cb: (s: AutoFormatStatus) => void): (() => void) => {
      const l = (_e: unknown, s: AutoFormatStatus) => cb(s);
      ipcRenderer.on('autoformat:status', l);
      return () => {
        ipcRenderer.removeListener('autoformat:status', l);
      };
    },
    onBadge: (cb: (p: { tabId: string; groupId: string }) => void): (() => void) => {
      const l = (_e: unknown, p: { tabId: string; groupId: string }) => cb(p);
      ipcRenderer.on('autoformat:badge', l);
      return () => {
        ipcRenderer.removeListener('autoformat:badge', l);
      };
    }
  },

  attachments: {
    saveClipboard: () => ipcRenderer.invoke('attachments:save-clipboard') as Promise<{ id: string; path: string; ext: string; size: number }>,
    saveBase64: (dataUrl: string) => ipcRenderer.invoke('attachments:save-base64', { dataUrl }) as Promise<{ id: string; path: string; ext: string; size: number }>,
    savePath: (path: string) => ipcRenderer.invoke('attachments:save-path', { path }) as Promise<{ id: string; path: string; ext: string; size: number }>,
    read: (rel: string) => ipcRenderer.invoke('attachments:read', { rel }) as Promise<string | null>,
    delete: (rel: string) => ipcRenderer.invoke('attachments:delete', { rel })
  },

  embeddings: {
    ensure: (items: { id: string; text: string; hash: string }[], providerId?: string) => ipcRenderer.invoke('embeddings:ensure', { items, providerId }),
    search: (query: string, candidates: { id: string; hash: string }[], providerId?: string) =>
      ipcRenderer.invoke('embeddings:search', { query, candidates, providerId }) as Promise<{ id: string; score: number }[]>,
    drop: (ids: string[]) => ipcRenderer.invoke('embeddings:drop', { ids })
  },

  app: {
    setLoginItem: (open: boolean) => ipcRenderer.invoke('app:set-login-item', { open }),
    getLoginItem: () => ipcRenderer.invoke('app:get-login-item') as Promise<boolean>,
    openFileDialog: () => ipcRenderer.invoke('dialog:open-file') as Promise<string | null>,
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
  },

  skill: {
    ramble: (args: { monologue: string; projectContext?: string }) => ipcRenderer.invoke('skill:ramble', args) as Promise<SkillResult<{ lines: string[] }>>,
    capture: (args: { transcript: string; projectContext?: string }) =>
      ipcRenderer.invoke('skill:capture', args) as Promise<SkillResult<{ lines: string[]; suggested_tab?: string | null; suggested_title?: string | null }>>,
    tag: (lines: string[]) => ipcRenderer.invoke('skill:tag', { lines }) as Promise<SkillResult<{ tags: string[] }>>,
    tasks: (lines: string[]) => ipcRenderer.invoke('skill:tasks', { lines }) as Promise<SkillResult<{ tasks: string[] }>>,
    explainBack: (lines: string[]) => ipcRenderer.invoke('skill:explain-back', { lines }) as Promise<SkillResult<{ summary: string; questions?: string[] }>>,
    categorize: (args: {
      lines: string[];
      categories: { id: string; label: string }[];
      tabs: { id: string; name: string; projectContext?: string; aliases?: string[] }[];
      currentTabId: string;
    }) => ipcRenderer.invoke('skill:categorize', args) as Promise<SkillResult<{ category: string; suggestedTabId: string | null; confidence: number }>>,
    projectContext: (args: { tabName: string; recentLines: string[] }) =>
      ipcRenderer.invoke('skill:project-context', args) as Promise<SkillResult<{ summary: string; aliases?: string[] }>>,
    dailyReport: (args: unknown) => ipcRenderer.invoke('skill:daily-report', args) as Promise<SkillResult<unknown>>,
    stalePulse: (args: unknown) => ipcRenderer.invoke('skill:stale-pulse', args) as Promise<SkillResult<unknown>>,
    template: (id: 'meeting' | 'decision' | 'postmortem') => ipcRenderer.invoke('skill:template', { id }) as Promise<SkillResult<{ lines: string[] }>>
  },

  claw: {
    start: () => ipcRenderer.invoke('claw:start') as Promise<ClawBrokerState>,
    stop: () => ipcRenderer.invoke('claw:stop') as Promise<ClawBrokerState>,
    restart: () => ipcRenderer.invoke('claw:restart') as Promise<ClawBrokerState>,
    state: () => ipcRenderer.invoke('claw:state') as Promise<ClawBrokerState>,
    startSession: (args: { sessionId?: string; backend: string; cwd: string; skills: string[]; system?: string }) =>
      ipcRenderer.invoke('claw:start-session', args) as Promise<{ sessionId: string }>,
    message: (sessionId: string, content: string) => ipcRenderer.invoke('claw:message', { sessionId, content }),
    reply: (sessionId: string, promptId: string, text: string) => ipcRenderer.invoke('claw:reply', { sessionId, promptId, text }),
    interrupt: (sessionId: string) => ipcRenderer.invoke('claw:interrupt', { sessionId }),
    endSession: (sessionId: string) => ipcRenderer.invoke('claw:end-session', { sessionId }),
    interruptAll: () => ipcRenderer.invoke('claw:interrupt-all'),
    isDangerous: (text: string) => ipcRenderer.invoke('claw:is-dangerous', { text }) as Promise<{ dangerous: boolean }>,
    showLogs: () => ipcRenderer.invoke('claw:show-logs') as Promise<{ path: string }>,
    draft: (args: { groupLines: string[]; tabName: string; projectContext?: string; appSkills: string[]; priorHistory?: string[] }) =>
      ipcRenderer.invoke('skill:claw-draft', args) as Promise<SkillResult<{
        goal: string;
        constraints: string[];
        acceptance_criteria: string[];
        artifacts_to_produce: string[];
        safety_notes: string[];
      }>>,
    onState: (cb: (state: ClawBrokerState) => void): (() => void) => {
      const l = (_e: unknown, s: ClawBrokerState) => cb(s);
      ipcRenderer.on('claw:state', l);
      return () => ipcRenderer.removeListener('claw:state', l);
    },
    onMessage: (cb: (msg: ClawInbound) => void): (() => void) => {
      const l = (_e: unknown, m: ClawInbound) => cb(m);
      ipcRenderer.on('claw:message', l);
      return () => ipcRenderer.removeListener('claw:message', l);
    },
    skills: {
      list: () => ipcRenderer.invoke('claw-skills:list') as Promise<{ name: string; path: string; content: string; id: string; scope: string }[]>,
      write: (args: { name: string; content: string }) =>
        ipcRenderer.invoke('claw-skills:write', args) as Promise<{ name: string; path: string; content: string; id: string; scope: string }[]>,
      remove: (name: string) =>
        ipcRenderer.invoke('claw-skills:delete', { name }) as Promise<{ name: string; path: string; content: string; id: string; scope: string }[]>,
      openFolder: () => ipcRenderer.invoke('claw-skills:open-folder') as Promise<string>
    }
  },

  sync: {
    status: () => ipcRenderer.invoke('sync:status') as Promise<{
      configured: boolean;
      online: boolean;
      lastPush?: number;
      lastPull?: number;
      outboxDepth: number;
      error?: string;
    }>,
    settings: () => ipcRenderer.invoke('sync:settings') as Promise<{
      serverUrl: string;
      deviceId?: string;
      signedInEmail?: string;
      hasToken: boolean;
    }>,
    signIn: (args: { serverUrl: string; email: string; password: string; deviceName: string }) =>
      ipcRenderer.invoke('sync:signin', args) as Promise<{ ok: boolean; error?: string }>,
    signOut: () => ipcRenderer.invoke('sync:signout'),
    enqueue: (kind: string, payload: unknown) => ipcRenderer.invoke('sync:enqueue', { kind, payload }),
    resetAndRepull: () => ipcRenderer.invoke('sync:reset-and-repull') as Promise<{ ok: boolean }>,
    onStatus: (cb: (s: { configured: boolean; online: boolean; outboxDepth: number; error?: string; lastPush?: number; lastPull?: number }) => void): (() => void) => {
      const l = (_e: unknown, s: Parameters<typeof cb>[0]) => cb(s);
      ipcRenderer.on('sync:status', l);
      return () => ipcRenderer.removeListener('sync:status', l);
    },
    onOps: (cb: (ops: { seq: number; clientId: string; lamport: number; kind: string; payload: unknown; appliedAt: number }[]) => void): (() => void) => {
      const l = (_e: unknown, ops: Parameters<typeof cb>[0]) => cb(ops);
      ipcRenderer.on('sync:ops', l);
      return () => ipcRenderer.removeListener('sync:ops', l);
    }
  },

  persistence: {
    status: () => ipcRenderer.invoke('persistence:status') as Promise<{
      loadInfo: { source: 'primary' | 'backup' | 'none'; backupIndex?: number; recovered: boolean } | null;
      writeStatus: { lastWriteOk: number; lastWriteError: string | null };
      dataFolder: string;
      backups: { index: number; path: string; mtime: number | null; size: number | null }[];
    }>,
    setFsync: (on: boolean) => ipcRenderer.invoke('persistence:set-fsync', { on }),
    openFolder: () => ipcRenderer.invoke('persistence:open-folder') as Promise<string>,
    exportAll: () => ipcRenderer.invoke('persistence:export') as Promise<{ canceled: boolean; path?: string }>,
    importAll: () => ipcRenderer.invoke('persistence:import') as Promise<{ canceled: boolean; ok?: boolean; error?: string }>,
    revertBackup: (index: number) => ipcRenderer.invoke('persistence:revert-backup', { index }) as Promise<{ ok: boolean }>,
    revertSnapshot: () => ipcRenderer.invoke('persistence:revert-snapshot') as Promise<{ ok: boolean }>,
    onRecovered: (cb: (p: { source: string; backupIndex: number | null }) => void): (() => void) => {
      const l = (_e: unknown, p: { source: string; backupIndex: number | null }) => cb(p);
      ipcRenderer.on('persistence:recovered', l);
      return () => {
        ipcRenderer.removeListener('persistence:recovered', l);
      };
    }
  }
};

contextBridge.exposeInMainWorld('braindump', api);

export type BraindumpAPI = typeof api;
