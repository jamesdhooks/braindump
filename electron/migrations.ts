import type { PersistedStore } from '../src/types';

export const CURRENT_VERSION = 6;

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2: add category field and ui.motion; fill defaults
  1: (s) => {
    const tabs = Array.isArray(s.tabs) ? (s.tabs as Record<string, unknown>[]) : [];
    for (const t of tabs) {
      const groups = Array.isArray(t.groups) ? (t.groups as Record<string, unknown>[]) : [];
      for (const g of groups) {
        if (typeof g.category !== 'string') g.category = undefined;
        if (typeof g.suggestedTabId !== 'string') g.suggestedTabId = undefined;
      }
    }
    const ui = (s.ui as Record<string, unknown> | undefined) ?? {};
    if (typeof ui.motion !== 'string') ui.motion = 'calm';
    s.ui = ui;
    if (!Array.isArray(s.categories)) {
      s.categories = [
        { id: 'quick-thought', label: 'Quick thought', color: '#8ab4ff' },
        { id: 'code-feature', label: 'Code feature', color: '#9effc7' },
        { id: 'household-todo', label: 'Household todo', color: '#ffd38a' }
      ];
    }
    return { ...s, version: 2 };
  },
  // 2 -> 3: migrate deprecated `gh copilot` binary overrides to standalone `copilot` CLI
  2: (s) => {
    const runners = (s.runners as Record<string, unknown> | undefined) ?? {};
    const copilotCli = (runners.copilotCli as Record<string, unknown> | undefined) ?? {};
    const binaryPath = copilotCli.binaryPath;
    if (typeof binaryPath === 'string') {
      const normalized = binaryPath.replace(/\\/g, '/').toLowerCase();
      if (normalized.endsWith('/gh') || normalized.endsWith('/gh.exe') || normalized.endsWith('/gh.cmd')) {
        delete copilotCli.binaryPath;
      }
    }
    runners.copilotCli = copilotCli;
    s.runners = runners;
    return { ...s, version: 3 };
  },
  // 3 -> 4: ensure Claude runner has explicit per-complexity model mappings
  3: (s) => {
    const runners = (s.runners as Record<string, unknown> | undefined) ?? {};
    const claudeCli = (runners.claudeCli as Record<string, unknown> | undefined) ?? {};
    const model = (claudeCli.model as Record<string, unknown> | undefined) ?? {};
    const copilotCli = (runners.copilotCli as Record<string, unknown> | undefined) ?? {};
    const copilotModel = (copilotCli.model as Record<string, unknown> | undefined) ?? {};

    if (typeof model.simple !== 'string' || !model.simple.trim()) {
      model.simple = 'claude-haiku-4-5-20251001';
    }
    if (typeof model.complex !== 'string' || !model.complex.trim()) {
      model.complex = 'claude-sonnet-4-6';
    }
    if (typeof model.crazy !== 'string' || !model.crazy.trim()) {
      model.crazy = 'claude-opus-4-7';
    }

    claudeCli.model = model;
    if (typeof copilotModel.simple !== 'string' || !copilotModel.simple.trim()) {
      copilotModel.simple = 'gpt-4o-mini';
    }
    if (typeof copilotModel.complex !== 'string' || !copilotModel.complex.trim()) {
      copilotModel.complex = 'gpt-4.1';
    }
    if (typeof copilotModel.crazy !== 'string' || !copilotModel.crazy.trim()) {
      copilotModel.crazy = 'o3';
    }

    copilotCli.model = copilotModel;
    runners.claudeCli = claudeCli;
    runners.copilotCli = copilotCli;
    s.runners = runners;
    return { ...s, version: 4 };
  },
  // 4 -> 5: add persisted execution skills collection
  4: (s) => {
    if (!Array.isArray(s.skills)) {
      s.skills = [];
    }
    return { ...s, version: 5 };
  },
  // 5 -> 6: add local task cards, task outbox, and Agent Runner integration defaults
  5: (s) => {
    if (!Array.isArray(s.tasks)) {
      s.tasks = [];
    }
    if (!Array.isArray(s.taskOutbox)) {
      s.taskOutbox = [];
    }

    const integrations = (s.integrations as Record<string, unknown> | undefined) ?? {};
    const agentRunner = (integrations.agentRunner as Record<string, unknown> | undefined) ?? {};
    integrations.agentRunner = {
      enabled: typeof agentRunner.enabled === 'boolean' ? agentRunner.enabled : false,
      endpoint: typeof agentRunner.endpoint === 'string' ? agentRunner.endpoint : '',
      tokenRef: typeof agentRunner.tokenRef === 'string' ? agentRunner.tokenRef : undefined,
      defaultProjectId: typeof agentRunner.defaultProjectId === 'string' ? agentRunner.defaultProjectId : undefined,
      sendRequiresReview:
        typeof agentRunner.sendRequiresReview === 'boolean' ? agentRunner.sendRequiresReview : true,
      syncMonitorSnapshots:
        typeof agentRunner.syncMonitorSnapshots === 'boolean' ? agentRunner.syncMonitorSnapshots : false
    };
    s.integrations = integrations;
    return { ...s, version: 6 };
  }
};

export function runMigrations(raw: Record<string, unknown>): PersistedStore {
  let cur: Record<string, unknown> = raw;
  let v = typeof cur.version === 'number' ? (cur.version as number) : 1;
  while (v < CURRENT_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) break;
    cur = m(cur);
    v = typeof cur.version === 'number' ? (cur.version as number) : v + 1;
  }
  cur.version = CURRENT_VERSION;
  return cur as unknown as PersistedStore;
}
