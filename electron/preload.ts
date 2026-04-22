import { contextBridge, ipcRenderer } from 'electron';
import type { PersistedStore, LLMMessage, LLMResult, AutoFormatStatus } from '../src/types';

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
  }
};

contextBridge.exposeInMainWorld('braindump', api);

export type BraindumpAPI = typeof api;
