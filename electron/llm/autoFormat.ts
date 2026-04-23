import crypto from 'node:crypto';
import { BrowserWindow } from 'electron';
import { runFormat } from './skills/format';
import type { LLMProviderConfig, NoteGroup, AutoFormatConfig, PersistedStore, AutoFormatStatus } from '../../src/types';
import { getState, setState } from '../store';

function hashLine(s: string) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export class AutoFormatter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private status: AutoFormatStatus = { state: 'idle', queued: 0, lastAction: null };
  private lastTick = 0;
  private recentRequests: number[] = [];
  private windowRef: BrowserWindow | null = null;

  constructor() {}

  attach(win: BrowserWindow) {
    this.windowRef = win;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => undefined), 30_000);
    this.broadcast();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = { ...this.status, state: 'idle', queued: 0 };
    this.broadcast();
  }

  getStatus(): AutoFormatStatus {
    return this.status;
  }

  private broadcast() {
    this.windowRef?.webContents.send('autoformat:status', this.status);
  }

  private getProvider(state: PersistedStore): LLMProviderConfig | null {
    const override = state.featureProviderOverrides.autoFormat;
    const id = override || state.activeProviderId;
    return state.providers.find((p) => p.id === id) || null;
  }

  private candidateGroups(state: PersistedStore, cfg: AutoFormatConfig): { tabId: string; group: NoteGroup }[] {
    const now = Date.now();
    const out: { tabId: string; group: NoteGroup }[] = [];
    for (const tab of state.tabs) {
      if (cfg.excludedTabIds.includes(tab.id)) continue;
      if (tab.autoFormatEnabled === false) continue;
      for (const g of tab.groups) {
        if (g.autoFormatOptOut) continue;
        if (g.pinned && !cfg.touchPinned) continue;
        if (now - g.updatedAt < cfg.minAgeSeconds * 1000) continue;
        const hashes = new Set(g.formattedHashes ?? []);
        const anyUnformatted = g.lines.some((l) => !hashes.has(hashLine(l)));
        if (anyUnformatted) out.push({ tabId: tab.id, group: g });
      }
    }
    return out;
  }

  private checkRateLimit(cfg: AutoFormatConfig): boolean {
    const now = Date.now();
    this.recentRequests = this.recentRequests.filter((t) => now - t < 60_000);
    return this.recentRequests.length < cfg.maxRequestsPerMinute;
  }

  private checkDailyCap(state: PersistedStore, cfg: AutoFormatConfig): boolean {
    const d = today();
    const used = state.usage.perDay[d]?.autoFormat ?? 0;
    return used < cfg.dailyRequestCap;
  }

  private recordUsage(mut: (s: PersistedStore) => void) {
    const s = getState();
    mut(s);
    setState(s);
  }

  async tick(): Promise<void> {
    const state = getState();
    const cfg = state.autoFormat;
    if (!cfg.enabled) {
      this.status = { state: 'idle', queued: 0, lastAction: this.status.lastAction };
      this.broadcast();
      return;
    }
    if (this.running) return;
    const provider = this.getProvider(state);
    if (!provider) return;

    const cands = this.candidateGroups(state, cfg);
    this.status = { ...this.status, queued: cands.length };
    if (!cands.length) {
      this.status = { state: 'idle', queued: 0, lastAction: this.status.lastAction };
      this.broadcast();
      return;
    }
    this.running = true;
    this.status = { ...this.status, state: 'formatting' };
    this.broadcast();

    try {
      const batch = cands.slice(0, cfg.maxGroupsPerBatch);
      for (const { tabId, group } of batch) {
        if (!this.checkRateLimit(cfg)) break;
        if (!this.checkDailyCap(getState(), cfg)) break;
        await this.formatOne(provider, tabId, group.id).catch((err) => {
          this.status = { ...this.status, state: 'error', lastAction: `error: ${String(err).slice(0, 80)}` };
          this.broadcast();
        });
        this.recentRequests.push(Date.now());
      }
    } finally {
      this.running = false;
      this.status = { ...this.status, state: 'idle' };
      this.broadcast();
    }
  }

  private async formatOne(provider: LLMProviderConfig, tabId: string, groupId: string): Promise<void> {
    const state = getState();
    const tab = state.tabs.find((t) => t.id === tabId);
    const group = tab?.groups.find((g) => g.id === groupId);
    if (!tab || !group) return;
    const cfg = state.autoFormat;

    const result = await runFormat({
      lines: group.lines,
      aggressiveness: cfg.aggressiveness,
      preserveVoice: cfg.preserveVoice,
      projectContext: tab.projectContext
    });

    if (!result.ok || !result.value) {
      this.status = { ...this.status, lastAction: `skipped (${result.error ?? 'no data'})` };
      this.broadcast();
      return;
    }
    const parsed = result.value;
    if (parsed.confidence < cfg.requireConfidenceAbove) {
      this.status = { ...this.status, lastAction: `low-confidence skip (${parsed.confidence.toFixed(2)})` };
      this.broadcast();
      return;
    }

    this.recordUsage((s) => {
      const t = s.tabs.find((x) => x.id === tabId);
      const g = t?.groups.find((x) => x.id === groupId);
      if (!g) return;
      g.history = g.history || [];
      g.history.push({
        id: crypto.randomUUID(),
        at: Date.now(),
        source: 'auto-format',
        lines: [...g.lines],
        model: `${provider.id}/${provider.model}`,
        diffSummary: parsed?.notes
      });
      const revised = parsed.revised_lines;
      g.lines = revised;
      const hs = new Set(g.formattedHashes || []);
      for (const l of revised) hs.add(hashLine(l));
      g.formattedHashes = [...hs];
      g.updatedAt = Date.now();
    });

    this.status = { ...this.status, lastAction: `formatted group ${groupId.slice(0, 6)}` };
    this.windowRef?.webContents.send('state:changed', getState());
    this.windowRef?.webContents.send('autoformat:badge', { tabId, groupId });
    this.broadcast();
  }
}

export const autoFormatter = new AutoFormatter();
