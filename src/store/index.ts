import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { nanoid } from 'nanoid';
import type {
  PersistedStore,
  Tab,
  NoteGroup,
  ArchiveEntry,
  Attachment,
  BrainstormSession,
  BrainstormMessage,
  AutoFormatStatus,
  LLMProviderId
} from '../types';
import { extractHashtags, splitIntoGroups } from '../lib/groupSplit';
import { hashLine } from '../lib/contentHash';

export function applyThemeToDom(theme: 'dark' | 'light' | 'system') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  let effective: 'dark' | 'light' = 'dark';
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effective = theme;
  }
  root.setAttribute('data-theme', effective);
  if (effective === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

type UIOnly = {
  highlightedLines: Record<string, number[]>;
  pulseOpen: boolean;
  pulseData: {
    at: number;
    nudges: { groupId: string; one_line_nudge: string }[];
    fresh: { groupId: string; what_changed: string }[];
  } | null;
  dailyReportOpen: boolean;
  hoverTargetGroupId: string | null;
  lockedTargetGroupId: string | null;
  focusedGroupId: string | null;
  searchOpen: boolean;
  searchQuery: string;
  settingsOpen: boolean;
  rambleOpen: boolean;
  historyForGroupId: string | null;
  autoFormatStatus: AutoFormatStatus;
  recentlyFormatted: Record<string, number>;
  undoStack: UndoEntry[];
  toast: { id: string; message: string; kind: 'info' | 'success' | 'error'; actionLabel?: string; onAction?: () => void } | null;
};

type UndoEntry =
  | { kind: 'archive'; tabId: string; group: NoteGroup; at: number }
  | { kind: 'autoformat-revert'; tabId: string; groupId: string; snapshot: NoteGroup; at: number };

export type StoreState = PersistedStore &
  UIOnly & {
    hydrated: boolean;
    hydrate: (p: PersistedStore) => void;
    persist: () => void;
    setActiveTab: (id: string) => void;
    newTab: (name?: string) => string;
    renameTab: (id: string, name: string) => void;
    closeTab: (id: string) => void;
    reorderTabs: (order: string[]) => void;
    setTabColor: (id: string, color: string | undefined) => void;

    commitText: (text: string, opts?: { tabId?: string; targetGroupId?: string | null; pinned?: boolean; source?: 'user' | 'ramble' | 'brainstorm' }) => string[];
    addGroupLines: (tabId: string, lines: string[], pinned?: boolean, source?: 'user' | 'ramble' | 'brainstorm', brainstormId?: string) => string;
    appendToGroup: (tabId: string, groupId: string, lines: string[]) => void;
    updateGroupLines: (tabId: string, groupId: string, lines: string[], source?: 'user' | 'llm-edit') => void;
    togglePin: (tabId: string, groupId: string) => void;
    setAutoFormatOptOut: (tabId: string, groupId: string, opt: boolean) => void;
    completeGroup: (tabId: string, groupId: string) => void;
    restoreFromArchive: (archiveIndex: number) => void;
    deleteArchiveEntry: (archiveIndex: number) => void;
    clearArchiveOlderThan: (days: number) => void;
    revertToRevision: (tabId: string, groupId: string, revisionId: string) => void;
    attachImageToGroup: (tabId: string, groupId: string, att: Attachment) => void;
    removeAttachment: (tabId: string, groupId: string, attId: string) => void;
    setAttachmentOcr: (tabId: string, groupId: string, attId: string, ocrText: string, caption?: string) => void;

    setHoverTarget: (id: string | null) => void;
    setLockedTarget: (id: string | null) => void;
    setFocusedGroup: (id: string | null) => void;
    setSearchOpen: (open: boolean) => void;
    setSearchQuery: (q: string) => void;
    setSettingsOpen: (open: boolean) => void;
    setRambleOpen: (open: boolean) => void;
    setHistoryForGroup: (id: string | null) => void;
    setArchiveOpen: (open: boolean) => void;
    setBrainstormOpen: (open: boolean) => void;
    setFocusMode: (on: boolean) => void;
    setTheme: (theme: 'dark' | 'light' | 'system') => void;
    setMotion: (m: 'calm' | 'floaty' | 'reduced') => void;
    setAutoFormatStatus: (s: AutoFormatStatus) => void;
    flashRecentlyFormatted: (groupId: string) => void;

    undo: () => void;
    showToast: (t: { message: string; kind?: 'info' | 'success' | 'error'; actionLabel?: string; onAction?: () => void }) => void;
    dismissToast: () => void;

    setActiveProvider: (id: LLMProviderId) => void;
    updateProvider: (id: LLMProviderId, patch: Partial<PersistedStore['providers'][number]>) => void;
    setFeatureOverride: (feature: keyof PersistedStore['featureProviderOverrides'], provider?: LLMProviderId) => void;
    setAutoFormatConfig: (patch: Partial<PersistedStore['autoFormat']>) => void;
    setPrivacy: (patch: Partial<PersistedStore['ui']['privacy']>) => void;
    setAutoSort: (on: boolean) => void;
    setDailyReportHour: (h: number) => void;

    setHighlightedLines: (groupId: string, indices: number[]) => void;
    clearHighlightedLines: (groupId: string) => void;
    setPulseOpen: (open: boolean) => void;
    setDailyReportOpen: (open: boolean) => void;
    restoreArchive: (groupId: string) => void;

    setProjectContext: (tabId: string, context: string, aliases?: string[]) => void;
    setCategory: (tabId: string, groupId: string, category: string | null) => void;
    moveGroup: (fromTabId: string, toTabId: string, groupId: string) => void;
    autoCategorizeGroup: (tabId: string, groupId: string) => Promise<void>;

    appendDigest: (d: import('../types').DailyDigest) => void;

    addSavedSearch: (s: import('../types').SavedSearch) => void;
    deleteSavedSearch: (id: string) => void;

    upsertBrainstorm: (s: BrainstormSession) => void;
    appendBrainstormMessage: (id: string, msg: BrainstormMessage) => void;
    deleteBrainstorm: (id: string) => void;
  };

function emptyUI(): UIOnly {
  return {
    highlightedLines: {},
    pulseOpen: false,
    pulseData: null,
    dailyReportOpen: false,
    hoverTargetGroupId: null,
    lockedTargetGroupId: null,
    focusedGroupId: null,
    searchOpen: false,
    searchQuery: '',
    settingsOpen: false,
    rambleOpen: false,
    historyForGroupId: null,
    autoFormatStatus: { state: 'idle', queued: 0, lastAction: null },
    recentlyFormatted: {},
    undoStack: [],
    toast: null
  };
}

const persistTimer: { t: ReturnType<typeof setTimeout> | null } = { t: null };

export const useStore = create<StoreState>()(
  immer((set, get) => ({
    version: 1,
    tabs: [],
    activeTabId: 'inbox',
    archive: [],
    brainstorms: [],
    providers: [],
    activeProviderId: 'openai',
    featureProviderOverrides: {},
    autoFormat: {
      enabled: false,
      aggressiveness: 'tidy',
      touchPinned: false,
      excludedTabIds: [],
      minAgeSeconds: 60,
      maxRequestsPerMinute: 10,
      maxGroupsPerBatch: 3,
      preserveVoice: true,
      requireConfidenceAbove: 0.6,
      dailyRequestCap: 500
    },
    ui: {
      theme: 'dark',
      focus: false,
      archiveOpen: false,
      brainstormOpen: false,
      motion: 'calm',
      privacy: { neverSendPinned: true, redactEmails: true, redactApiLikeStrings: true },
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
    usage: { perDay: {} },
    hydrated: false,

    ...emptyUI(),

    hydrate(p) {
      set((s) => {
        Object.assign(s, p);
        s.hydrated = true;
      });
    },

    persist() {
      if (persistTimer.t) clearTimeout(persistTimer.t);
      persistTimer.t = setTimeout(() => {
        const s = get();
        const persisted: PersistedStore = {
          version: s.version,
          tabs: s.tabs,
          activeTabId: s.activeTabId,
          archive: s.archive,
          brainstorms: s.brainstorms,
          providers: s.providers,
          activeProviderId: s.activeProviderId,
          featureProviderOverrides: s.featureProviderOverrides,
          autoFormat: s.autoFormat,
          ui: s.ui,
          categories: s.categories,
          digests: s.digests,
          savedSearches: s.savedSearches,
          usage: s.usage
        };
        void window.braindump.setState(persisted);
      }, 200);
    },

    setActiveTab(id) {
      set((s) => {
        s.activeTabId = id;
      });
      get().persist();
    },
    newTab(name) {
      const id = nanoid(8);
      set((s) => {
        const order = s.tabs.length ? Math.max(...s.tabs.map((t) => t.order)) + 1 : 0;
        s.tabs.push({ id, name: name || `Tab ${s.tabs.length + 1}`, groups: [], order });
        s.activeTabId = id;
      });
      get().persist();
      return id;
    },
    renameTab(id, name) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === id);
        if (t) t.name = name;
      });
      get().persist();
    },
    closeTab(id) {
      set((s) => {
        const idx = s.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;
        s.tabs.splice(idx, 1);
        if (s.activeTabId === id) {
          s.activeTabId = s.tabs[Math.max(0, idx - 1)]?.id ?? s.tabs[0]?.id ?? '';
        }
      });
      get().persist();
    },
    reorderTabs(order) {
      set((s) => {
        const map: Record<string, number> = {};
        order.forEach((id, i) => (map[id] = i));
        s.tabs.sort((a, b) => (map[a.id] ?? 0) - (map[b.id] ?? 0));
        s.tabs.forEach((t, i) => (t.order = i));
      });
      get().persist();
    },
    setTabColor(id, color) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === id);
        if (t) t.color = color;
      });
      get().persist();
    },

    commitText(text, opts) {
      const tabId = opts?.tabId ?? get().activeTabId;
      const groups = splitIntoGroups(text);
      if (!groups.length) return [];
      const source = opts?.source ?? 'user';
      if (opts?.targetGroupId && groups.length === 1) {
        get().appendToGroup(tabId, opts.targetGroupId, groups[0]);
        return [opts.targetGroupId];
      }
      const ids: string[] = [];
      for (const lines of groups) {
        ids.push(get().addGroupLines(tabId, lines, opts?.pinned, source));
      }
      return ids;
    },

    addGroupLines(tabId, lines, pinned, source = 'user', brainstormId) {
      const id = nanoid(10);
      set((s) => {
        const tab = s.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const now = Date.now();
        const group: NoteGroup = {
          id,
          lines,
          createdAt: now,
          updatedAt: now,
          pinned: Boolean(pinned),
          tags: extractHashtags(lines),
          history: [{ id: nanoid(8), at: now, source, lines: [...lines] }],
          formattedHashes: [],
          brainstormId
        };
        tab.groups.unshift(group);
      });
      get().persist();
      // best-effort auto-categorize for freshly-committed groups
      if (typeof window !== 'undefined' && window.braindump?.skill) {
        setTimeout(() => {
          void get().autoCategorizeGroup(tabId, id);
        }, 300);
      }
      return id;
    },

    appendToGroup(tabId, groupId, lines) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        const g = t?.groups.find((x) => x.id === groupId);
        if (!g) return;
        const prev = [...g.lines];
        g.history.push({ id: nanoid(8), at: Date.now(), source: 'user', lines: prev });
        g.lines = [...g.lines, ...lines];
        g.tags = extractHashtags(g.lines);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    updateGroupLines(tabId, groupId, lines, source = 'user') {
      set((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        const g = t?.groups.find((x) => x.id === groupId);
        if (!g) return;
        g.history.push({ id: nanoid(8), at: Date.now(), source, lines: [...g.lines] });
        g.lines = lines;
        g.tags = extractHashtags(lines);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    togglePin(tabId, groupId) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (g) {
          g.pinned = !g.pinned;
          g.updatedAt = Date.now();
        }
      });
      get().persist();
    },
    setAutoFormatOptOut(tabId, groupId, opt) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (g) g.autoFormatOptOut = opt;
      });
      get().persist();
    },
    completeGroup(tabId, groupId) {
      const now = Date.now();
      let removed: NoteGroup | null = null;
      set((s) => {
        const tab = s.tabs.find((x) => x.id === tabId);
        if (!tab) return;
        const idx = tab.groups.findIndex((g) => g.id === groupId);
        if (idx < 0) return;
        const group = tab.groups[idx];
        if (group.pinned) return;
        tab.groups.splice(idx, 1);
        s.archive.unshift({ group, tabId, completedAt: now });
        removed = group;
        s.undoStack.push({ kind: 'archive', tabId, group, at: now });
      });
      if (removed) {
        get().showToast({
          message: 'Archived — Ctrl+Z to restore',
          kind: 'info',
          actionLabel: 'Restore',
          onAction: () => get().undo()
        });
      }
      get().persist();
    },
    restoreFromArchive(archiveIndex) {
      set((s) => {
        const entry = s.archive[archiveIndex];
        if (!entry) return;
        s.archive.splice(archiveIndex, 1);
        const tab = s.tabs.find((t) => t.id === entry.tabId) ?? s.tabs[0];
        if (tab) tab.groups.unshift(entry.group);
      });
      get().persist();
    },
    deleteArchiveEntry(archiveIndex) {
      const entry = get().archive[archiveIndex];
      set((s) => {
        s.archive.splice(archiveIndex, 1);
      });
      if (entry) {
        void window.braindump.embeddings.drop([entry.group.id]);
        for (const att of entry.group.attachments ?? []) {
          void window.braindump.attachments.delete(att.path);
        }
      }
      get().persist();
    },
    clearArchiveOlderThan(days) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      set((s) => {
        const keep: ArchiveEntry[] = [];
        for (const e of s.archive) {
          if (e.completedAt >= cutoff) keep.push(e);
          else {
            void window.braindump.embeddings.drop([e.group.id]);
            for (const att of e.group.attachments ?? []) void window.braindump.attachments.delete(att.path);
          }
        }
        s.archive = keep;
      });
      get().persist();
    },

    revertToRevision(tabId, groupId, revisionId) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g) return;
        const rev = g.history.find((r) => r.id === revisionId);
        if (!rev) return;
        g.history.push({ id: nanoid(8), at: Date.now(), source: 'user', lines: [...g.lines], diffSummary: 'revert' });
        g.lines = [...rev.lines];
        g.tags = extractHashtags(rev.lines);
        const hs = new Set(g.formattedHashes || []);
        for (const l of rev.lines) hs.delete(hashLine(l));
        g.formattedHashes = [...hs];
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    attachImageToGroup(tabId, groupId, att) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g) return;
        g.attachments = g.attachments || [];
        g.attachments.push(att);
        g.updatedAt = Date.now();
      });
      get().persist();
    },
    removeAttachment(tabId, groupId, attId) {
      let rel: string | null = null;
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g?.attachments) return;
        const idx = g.attachments.findIndex((a) => a.id === attId);
        if (idx >= 0) {
          rel = g.attachments[idx].path;
          g.attachments.splice(idx, 1);
        }
      });
      if (rel) void window.braindump.attachments.delete(rel);
      get().persist();
    },
    setAttachmentOcr(tabId, groupId, attId, ocrText, caption) {
      set((s) => {
        const a = s.tabs
          .find((x) => x.id === tabId)
          ?.groups.find((x) => x.id === groupId)
          ?.attachments?.find((x) => x.id === attId);
        if (a) {
          a.ocrText = ocrText;
          a.caption = caption;
        }
      });
      get().persist();
    },

    setHoverTarget(id) {
      set((s) => {
        s.hoverTargetGroupId = id;
      });
    },
    setLockedTarget(id) {
      set((s) => {
        s.lockedTargetGroupId = id;
      });
    },
    setFocusedGroup(id) {
      set((s) => {
        s.focusedGroupId = id;
      });
    },
    setSearchOpen(open) {
      set((s) => {
        s.searchOpen = open;
        if (!open) s.searchQuery = '';
      });
    },
    setSearchQuery(q) {
      set((s) => {
        s.searchQuery = q;
      });
    },
    setSettingsOpen(open) {
      set((s) => {
        s.settingsOpen = open;
      });
    },
    setRambleOpen(open) {
      set((s) => {
        s.rambleOpen = open;
      });
    },
    setHistoryForGroup(id) {
      set((s) => {
        s.historyForGroupId = id;
      });
    },
    setArchiveOpen(open) {
      set((s) => {
        s.ui.archiveOpen = open;
      });
      get().persist();
    },
    setBrainstormOpen(open) {
      set((s) => {
        s.ui.brainstormOpen = open;
      });
      get().persist();
    },
    setFocusMode(on) {
      set((s) => {
        s.ui.focus = on;
      });
      get().persist();
    },
    setTheme(theme) {
      set((s) => {
        s.ui.theme = theme;
      });
      applyThemeToDom(theme);
      get().persist();
    },
    setMotion(m) {
      set((s) => {
        s.ui.motion = m;
      });
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-motion', m);
      }
      get().persist();
    },
    setAutoFormatStatus(st) {
      set((s) => {
        s.autoFormatStatus = st;
      });
    },
    flashRecentlyFormatted(groupId) {
      set((s) => {
        s.recentlyFormatted[groupId] = Date.now();
      });
      setTimeout(() => {
        set((s) => {
          delete s.recentlyFormatted[groupId];
        });
      }, 5000);
    },

    undo() {
      const last = get().undoStack[get().undoStack.length - 1];
      if (!last) return;
      set((s) => {
        s.undoStack.pop();
        if (last.kind === 'archive') {
          const aIdx = s.archive.findIndex((a) => a.group.id === last.group.id);
          if (aIdx >= 0) s.archive.splice(aIdx, 1);
          const tab = s.tabs.find((t) => t.id === last.tabId) ?? s.tabs[0];
          if (tab) tab.groups.unshift(last.group);
        } else if (last.kind === 'autoformat-revert') {
          const tab = s.tabs.find((t) => t.id === last.tabId);
          const g = tab?.groups.find((x) => x.id === last.groupId);
          if (g) Object.assign(g, last.snapshot);
        }
      });
      get().persist();
    },
    showToast(t) {
      set((s) => {
        s.toast = { id: nanoid(6), message: t.message, kind: t.kind ?? 'info', actionLabel: t.actionLabel, onAction: t.onAction };
      });
      const id = get().toast?.id;
      setTimeout(() => {
        if (get().toast?.id === id) get().dismissToast();
      }, 8000);
    },
    dismissToast() {
      set((s) => {
        s.toast = null;
      });
    },

    setActiveProvider(id) {
      set((s) => {
        s.activeProviderId = id;
      });
      get().persist();
    },
    updateProvider(id, patch) {
      set((s) => {
        const p = s.providers.find((x) => x.id === id);
        if (p) Object.assign(p, patch);
      });
      get().persist();
    },
    setFeatureOverride(feature, provider) {
      set((s) => {
        if (provider) s.featureProviderOverrides[feature] = provider;
        else delete s.featureProviderOverrides[feature];
      });
      get().persist();
    },
    setAutoFormatConfig(patch) {
      set((s) => {
        Object.assign(s.autoFormat, patch);
      });
      get().persist();
      if (typeof patch.enabled === 'boolean') {
        void window.braindump.autoFormat.toggle(patch.enabled);
      }
    },
    setPrivacy(patch) {
      set((s) => {
        Object.assign(s.ui.privacy, patch);
      });
      get().persist();
    },
    setAutoSort(on) {
      set((s) => {
        s.ui.autoSort = on;
      });
      get().persist();
    },
    setHighlightedLines(groupId, indices) {
      set((s) => {
        s.highlightedLines[groupId] = indices;
      });
      setTimeout(() => {
        useStore.setState((s) => {
          if (s.highlightedLines[groupId]) delete s.highlightedLines[groupId];
        });
      }, 2200);
    },
    clearHighlightedLines(groupId) {
      set((s) => {
        if (s.highlightedLines[groupId]) delete s.highlightedLines[groupId];
      });
    },
    setPulseOpen(open) {
      set((s) => {
        s.pulseOpen = open;
      });
    },
    setDailyReportOpen(open) {
      set((s) => {
        s.dailyReportOpen = open;
      });
    },
    restoreArchive(groupId) {
      const st = get();
      const idx = st.archive.findIndex((a) => a.group.id === groupId);
      if (idx >= 0) st.restoreFromArchive(idx);
    },
    setDailyReportHour(h) {
      set((s) => {
        s.ui.dailyReportHour = Math.max(0, Math.min(23, Math.floor(h)));
      });
      get().persist();
    },

    setProjectContext(tabId, context, aliases) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        if (!t) return;
        t.projectContext = context || undefined;
        t.aliases = aliases ?? t.aliases;
      });
      get().persist();
    },
    setCategory(tabId, groupId, category) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        const g = t?.groups.find((x) => x.id === groupId);
        if (!g) return;
        g.category = category ?? undefined;
        g.updatedAt = Date.now();
      });
      get().persist();
    },
    moveGroup(fromTabId, toTabId, groupId) {
      if (fromTabId === toTabId) return;
      set((s) => {
        const src = s.tabs.find((x) => x.id === fromTabId);
        const dst = s.tabs.find((x) => x.id === toTabId);
        if (!src || !dst) return;
        const idx = src.groups.findIndex((x) => x.id === groupId);
        if (idx < 0) return;
        const [g] = src.groups.splice(idx, 1);
        g.suggestedTabId = undefined;
        g.updatedAt = Date.now();
        dst.groups.unshift(g);
      });
      get().persist();
    },
    async autoCategorizeGroup(tabId, groupId) {
      const st = get();
      const tab = st.tabs.find((t) => t.id === tabId);
      const group = tab?.groups.find((g) => g.id === groupId);
      if (!tab || !group || !group.lines.length) return;
      if (group.pinned && st.ui.privacy.neverSendPinned) return;
      if (!st.providers.find((p) => p.id === st.activeProviderId)) return;
      try {
        const res = await window.braindump.skill.categorize({
          lines: group.lines,
          categories: st.categories.map(({ id, label }) => ({ id, label })),
          tabs: st.tabs.map((t) => ({ id: t.id, name: t.name, projectContext: t.projectContext, aliases: t.aliases })),
          currentTabId: tabId
        });
        if (!res.ok || !res.value) return;
        const { category, suggestedTabId, confidence } = res.value;
        if (confidence < 0.6) return;
        set((s) => {
          const t = s.tabs.find((x) => x.id === tabId);
          const g = t?.groups.find((x) => x.id === groupId);
          if (!g) return;
          if (s.categories.find((c) => c.id === category)) g.category = category;
          g.suggestedTabId = suggestedTabId && suggestedTabId !== tabId ? suggestedTabId : undefined;
        });
        get().persist();
        // auto-move when confidence is very high and user enabled it
        if (
          st.ui.autoSort &&
          suggestedTabId &&
          suggestedTabId !== tabId &&
          confidence >= 0.85 &&
          st.tabs.find((t) => t.id === suggestedTabId)
        ) {
          const toName = st.tabs.find((t) => t.id === suggestedTabId)?.name ?? 'another tab';
          get().moveGroup(tabId, suggestedTabId, groupId);
          get().showToast({
            message: `Moved to ${toName}`,
            kind: 'info',
            actionLabel: 'Undo',
            onAction: () => get().moveGroup(suggestedTabId, tabId, groupId)
          });
        }
      } catch {
        // silent; categorize is best-effort
      }
    },

    appendDigest(d) {
      set((s) => {
        s.digests = s.digests ?? [];
        const i = s.digests.findIndex((x) => x.date === d.date);
        if (i >= 0) s.digests[i] = d;
        else s.digests.unshift(d);
        if (s.digests.length > 120) s.digests = s.digests.slice(0, 120);
      });
      get().persist();
    },

    addSavedSearch(s) {
      set((st) => {
        st.savedSearches = st.savedSearches ?? [];
        st.savedSearches.unshift(s);
      });
      get().persist();
    },
    deleteSavedSearch(id) {
      set((s) => {
        s.savedSearches = (s.savedSearches ?? []).filter((x) => x.id !== id);
      });
      get().persist();
    },

    upsertBrainstorm(b) {
      set((s) => {
        const i = s.brainstorms.findIndex((x) => x.id === b.id);
        if (i >= 0) s.brainstorms[i] = b;
        else s.brainstorms.unshift(b);
      });
      get().persist();
    },
    appendBrainstormMessage(id, msg) {
      set((s) => {
        const b = s.brainstorms.find((x) => x.id === id);
        if (!b) return;
        b.messages.push(msg);
        b.updatedAt = Date.now();
      });
      get().persist();
    },
    deleteBrainstorm(id) {
      set((s) => {
        s.brainstorms = s.brainstorms.filter((x) => x.id !== id);
      });
      get().persist();
    }
  }))
);

export function useActiveTab(): Tab | undefined {
  return useStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
}

export function useEffectiveTargetGroupId(): string | null {
  return useStore((s) => s.lockedTargetGroupId ?? s.hoverTargetGroupId);
}
