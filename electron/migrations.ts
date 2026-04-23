import type { PersistedStore } from '../src/types';

export const CURRENT_VERSION = 2;

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
