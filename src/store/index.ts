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
import { extractHashtags } from '../lib/groupSplit';
import { hashLine } from '../lib/contentHash';
import { advancePrioritySortAt, getGroupDisplayBucket, groupPriorityRank } from '../lib/groupPriority';
import { isTaskRenderMode, normalizeTaskModeLines, parseTaskLine, toTaskMarkdownLine } from '../lib/taskMode';

function sortGroupsByPriorityOrder(groups: NoteGroup[]) {
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => {
      const rankDiff = groupPriorityRank(a.group) - groupPriorityRank(b.group);
      return rankDiff !== 0 ? rankDiff : a.index - b.index;
    })
    .map(({ group }) => group);
}

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

const DEFAULT_ACCENT_COLOR = '#7c8cff';

export function applyAccentColorToDom(hex?: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const normalizedHex =
    typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)
      ? hex
      : DEFAULT_ACCENT_COLOR;

  // Parse hex color and generate accent shades
  const rgb = parseInt(normalizedHex.slice(1), 16);
  const r = (rgb >> 16) & 255;
  const g = (rgb >> 8) & 255;
  const b = rgb & 255;

  // Convert RGB to HSL for better shade generation
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
      case gn: h = ((bn - rn) / d + 2) / 6; break;
      case bn: h = ((rn - gn) / d + 4) / 6; break;
    }
  }

  // Generate shades: darker (600), base (500), lighter (400)
  const hslToRgb = (h: number, s: number, l: number) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = l - c / 2;
    let rr = 0, gg = 0, bb = 0;

    if (h < 1/6) { rr = c; gg = x; bb = 0; }
    else if (h < 2/6) { rr = x; gg = c; bb = 0; }
    else if (h < 3/6) { rr = 0; gg = c; bb = x; }
    else if (h < 4/6) { rr = 0; gg = x; bb = c; }
    else if (h < 5/6) { rr = x; gg = 0; bb = c; }
    else { rr = c; gg = 0; bb = x; }

    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(rr)}${toHex(gg)}${toHex(bb)}`;
  };

  const accent600 = hslToRgb(h, s, Math.max(0.3, l - 0.15));
  const accent500 = normalizedHex;
  const accent400 = hslToRgb(h, s, Math.min(0.9, l + 0.15));

  // Calculate glow with alpha
  const glowAlpha = 0.22;
  const glowColor = `rgba(${r}, ${g}, ${b}, ${glowAlpha})`;

  root.style.setProperty('--accent-400', accent400);
  root.style.setProperty('--accent-500', accent500);
  root.style.setProperty('--accent-600', accent600);
  root.style.setProperty('--accent-glow', glowColor);
}

type UIOnly = {
  workspaceView: 'dumps' | 'skills';
  highlightedLines: Record<string, number[]>;
  pulseOpen: boolean;
  pulseData: {
    at: number;
    nudges: { groupId: string; one_line_nudge: string }[];
    fresh: { groupId: string; what_changed: string }[];
  } | null;
  dailyReportOpen: boolean;
  clawPanelOpen: boolean;
  clawFilterGroupId: string | null;
  clawDraftFor: { tabId: string; groupId: string; complexity?: import('../types').TaskComplexity } | null;
  clawBrokerState: {
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    clawVersion?: string;
    backends: string[];
    skills: string[];
    transport: 'stdio' | 'none';
    binary?: string;
    lastError?: string;
    sessions: string[];
  };
  clawSkillsEditorOpen: boolean;
  runnerStatuses: import('../types').RunnerStatusInfo[];
  unreadCompletedClawJobIds: string[];
  selectedGroupIds: string[];
  selectMode: boolean;
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
    setWorkspaceView: (view: UIOnly['workspaceView']) => void;
    setActiveTab: (id: string) => void;
    newTab: (name?: string) => string;
    renameTab: (id: string, name: string) => void;
    closeTab: (id: string) => void;
    reorderTabs: (order: string[]) => void;
    setTabColor: (id: string, color: string | undefined) => void;

    commitText: (text: string, opts?: { tabId?: string; pinned?: boolean; source?: 'user' | 'ramble' | 'brainstorm' }) => string[];
    addGroupLines: (tabId: string, lines: string[], pinned?: boolean, source?: 'user' | 'ramble' | 'brainstorm', brainstormId?: string) => string;
    appendToGroup: (tabId: string, groupId: string, lines: string[]) => void;
    updateGroupLines: (tabId: string, groupId: string, lines: string[], source?: 'user' | 'llm-edit') => void;
    togglePin: (tabId: string, groupId: string) => void;
    setAutoFormatOptOut: (tabId: string, groupId: string, opt: boolean) => void;
    setGroupRenderAs: (tabId: string, groupId: string, renderAs?: import('../types').GroupRenderAs) => void;
    toggleSubState: (tabId: string, groupId: string, lineIndex: number) => void;
    toggleQa: (tabId: string, groupId: string) => void;
    completeGroup: (tabId: string, groupId: string) => void;
    deleteGroup: (tabId: string, groupId: string) => void;
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
    setAccentColor: (hex: string) => void;
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
    sortGroupsByPriority: (tabId?: string) => boolean;
    setDailyReportHour: (h: number) => void;

    setHighlightedLines: (groupId: string, indices: number[]) => void;
    clearHighlightedLines: (groupId: string) => void;
    setPulseOpen: (open: boolean) => void;
    setDailyReportOpen: (open: boolean) => void;
    restoreArchive: (groupId: string) => void;

    setClawPanelOpen: (open: boolean) => void;
    setClawFilterGroup: (groupId: string | null) => void;
    setClawSkillsEditorOpen: (open: boolean) => void;
    setClawDraftSession: (target: { tabId: string; groupId: string; complexity?: import('../types').TaskComplexity } | null) => void;
    setClawBrokerState: (s: UIOnly['clawBrokerState']) => void;
    setClawConfig: (patch: Partial<NonNullable<PersistedStore['claw']>>) => void;
    setRunnerConfig: (id: 'claudeCli' | 'copilotCli', patch: Partial<import('../types').RunnerCliConfig>) => void;
    setRunnerStatuses: (statuses: import('../types').RunnerStatusInfo[]) => void;
    upsertSkill: (skill: import('../types').AppSkill) => void;
    deleteSkill: (skillId: string) => void;
    markCompletedClawJobsRead: (sessionIds: string[]) => void;
    toggleSelectGroup: (groupId: string) => void;
    clearSelection: () => void;
    selectAllInActiveTab: () => void;
    setSelectMode: (on: boolean) => void;
    upsertClawJob: (job: import('../types').ClawJob) => void;
    appendClawEvent: (sessionId: string, event: import('../types').ClawJobEvent) => void;
    appendClawArtifact: (sessionId: string, artifact: import('../types').ClawJobArtifact) => void;
    updateClawJob: (sessionId: string, patch: Partial<import('../types').ClawJob>) => void;
    pushClawPrompt: (sessionId: string, prompt: { promptId: string; question: string; options?: string[] }) => void;
    resolveClawPrompt: (sessionId: string, promptId: string) => void;

    setProjectContext: (tabId: string, context: string, aliases?: string[], projectPath?: string) => void;
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
    workspaceView: 'dumps',
    highlightedLines: {},
    pulseOpen: false,
    pulseData: null,
    dailyReportOpen: false,
    clawPanelOpen: false,
    clawFilterGroupId: null,
    clawDraftFor: null,
    clawBrokerState: { status: 'disconnected', backends: [], skills: [], transport: 'none', sessions: [] },
    clawSkillsEditorOpen: false,
    runnerStatuses: [],
    unreadCompletedClawJobIds: [],
    selectedGroupIds: [],
    selectMode: false,
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
    tasks: [],
    taskOutbox: [],
    integrations: {
      agentRunner: {
        enabled: false,
        endpoint: '',
        tokenRef: undefined,
        defaultProjectId: undefined,
        sendRequiresReview: true,
        syncMonitorSnapshots: false
      }
    },
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
      accentColor: '#7c8cff',
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
    skills: [],
    claw: {
      defaultBackend: 'claude-code',
      autoSendCategories: [],
      allowOutsideCwd: false,
      allowGitPush: false,
      allowRm: false
    },
    clawJobs: [],
    runners: {
      claudeCli: {
        enabled: false,
        model: {
          simple: 'claude-haiku-4-5-20251001',
          complex: 'claude-sonnet-4-6',
          crazy: 'claude-opus-4-7'
        }
      },
      copilotCli: {
        enabled: false,
        model: {
          simple: 'gpt-4o-mini',
          complex: 'gpt-4.1',
          crazy: 'o3'
        }
      }
    },
    usage: { perDay: {} },
    hydrated: false,

    ...emptyUI(),

    hydrate(p) {
      set((s) => {
        Object.assign(s, p);
        s.skills = Array.isArray(p.skills) ? p.skills : [];
        s.tasks = Array.isArray(p.tasks) ? p.tasks : [];
        s.taskOutbox = Array.isArray(p.taskOutbox) ? p.taskOutbox : [];
        s.integrations = p.integrations ?? s.integrations;
        s.integrations.agentRunner = p.integrations?.agentRunner ?? s.integrations.agentRunner;
        s.runners = p.runners ?? s.runners;
        if (!/^#[0-9a-fA-F]{6}$/.test(s.ui?.accentColor ?? '')) {
          s.ui.accentColor = DEFAULT_ACCENT_COLOR;
        }
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
          tasks: s.tasks,
          taskOutbox: s.taskOutbox,
          integrations: s.integrations,
          providers: s.providers,
          activeProviderId: s.activeProviderId,
          featureProviderOverrides: s.featureProviderOverrides,
          autoFormat: s.autoFormat,
          ui: s.ui,
          categories: s.categories,
          digests: s.digests,
          savedSearches: s.savedSearches,
          skills: s.skills,
          claw: s.claw,
          clawJobs: s.clawJobs,
          runners: s.runners,
          usage: s.usage
        };
        void window.braindump.setState(persisted);
      }, 200);
    },

    setWorkspaceView(view) {
      set((s) => {
        s.workspaceView = view;
      });
    },
    setActiveTab(id) {
      set((s) => {
        s.activeTabId = id;
        s.workspaceView = 'dumps';
      });
      get().persist();
    },
    newTab(name) {
      const id = nanoid(8);
      set((s) => {
        const order = s.tabs.length ? Math.max(...s.tabs.map((t) => t.order)) + 1 : 0;
        s.tabs.push({ id, name: name || `Tab ${s.tabs.length + 1}`, groups: [], order });
        s.activeTabId = id;
        s.workspaceView = 'dumps';
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
      const trimmed = text.replace(/\r\n?/g, '\n').trim();
      if (!trimmed) return [];
      const lines = trimmed.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.length);
      if (!lines.length) return [];
      const source = opts?.source ?? 'user';
      // One dump = one group. No splitting on blank lines, no append-to-target.
      const id = get().addGroupLines(tabId, lines, opts?.pinned, source);
      if (tabId === get().activeTabId) get().setFocusedGroup(id);
      return [id];
    },

    addGroupLines(tabId, lines, pinned, source = 'user', brainstormId) {
      const id = nanoid(10);
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
      set((s) => {
        const tab = s.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        tab.groups.unshift(group);
      });
      get().persist();
      void window.braindump?.sync?.enqueue('addGroup', { tabId, group });
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
        const nextLines = isTaskRenderMode(g.renderAs) ? normalizeTaskModeLines(lines) : lines;
        g.history.push({ id: nanoid(8), at: Date.now(), source: 'user', lines: prev });
        g.lines = [...g.lines, ...nextLines];
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
        const nextLines = isTaskRenderMode(g.renderAs) ? normalizeTaskModeLines(lines) : lines;
        g.history.push({ id: nanoid(8), at: Date.now(), source, lines: [...g.lines] });
        g.lines = nextLines;
        g.tags = extractHashtags(nextLines);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    togglePin(tabId, groupId) {
      let nextPinned = false;
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (g) {
          g.pinned = !g.pinned;
          g.updatedAt = Date.now();
          nextPinned = g.pinned;
        }
      });
      get().persist();
      void window.braindump?.sync?.enqueue('togglePin', { tabId, groupId, pinned: nextPinned });
    },
    setAutoFormatOptOut(tabId, groupId, opt) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (g) g.autoFormatOptOut = opt;
      });
      get().persist();
    },
    setGroupRenderAs(tabId, groupId, renderAs) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g) return;
        g.renderAs = renderAs;
        if (isTaskRenderMode(renderAs)) {
          g.lines = normalizeTaskModeLines(g.lines);
        }
        g.tags = extractHashtags(g.lines);
        g.updatedAt = Date.now();
      });
      get().persist();
    },
    toggleSubState(tabId, groupId, lineIndex) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g) return;
        const line = g.lines[lineIndex] ?? '';
        const parsed = parseTaskLine(line, isTaskRenderMode(g.renderAs));
        if (!parsed) return;
        // Persist via subStates AND keep the markdown checkbox in lines in sync.
        g.subStates = g.subStates ?? {};
        const prev = g.subStates[lineIndex]?.completed ?? parsed.checked;
        const next = !prev;
        g.subStates[lineIndex] = { ...(g.subStates[lineIndex] ?? {}), completed: next };
        g.lines[lineIndex] = toTaskMarkdownLine(line, next, isTaskRenderMode(g.renderAs));
        g.updatedAt = Date.now();
      });
      get().persist();
    },
    toggleQa(tabId, groupId) {
      set((s) => {
        const g = s.tabs.find((x) => x.id === tabId)?.groups.find((x) => x.id === groupId);
        if (!g) return;
        g.qaAt = g.qaAt ? null : Date.now();
      });
      get().persist();
    },
    completeGroup(tabId, groupId) {
      const now = Date.now();
      let toggled = false;
      set((s) => {
        const tab = s.tabs.find((x) => x.id === tabId);
        if (!tab) return;
        const group = tab.groups.find((g) => g.id === groupId);
        if (!group || group.pinned) return;
        const wasCompleted = Boolean(group.completedAt);
        group.completedAt = wasCompleted ? undefined : now;
        group.qaAt = null;
        toggled = true;
      });
      if (toggled) get().persist();
    },
    deleteGroup(tabId, groupId) {
      let removed: NoteGroup | null = null;
      set((s) => {
        const tab = s.tabs.find((x) => x.id === tabId);
        if (!tab) return;
        const idx = tab.groups.findIndex((g) => g.id === groupId);
        if (idx < 0) return;
        removed = JSON.parse(JSON.stringify(tab.groups[idx])) as NoteGroup;
        tab.groups.splice(idx, 1);
        s.undoStack.push({ kind: 'archive', tabId, group: removed, at: Date.now() });
        if (s.undoStack.length > 10) s.undoStack.shift();
      });
      if (removed) {
        get().persist();
        void window.braindump.embeddings.drop([groupId]);
        get().showToast({
          message: 'Dump deleted',
          kind: 'info',
          actionLabel: 'Undo',
          onAction: () => get().undo()
        });
      }
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
      // Deprecated: hover/lock target system removed. Kept as no-op for backwards compat.
      void id;
    },
    setLockedTarget(id) {
      // Deprecated: hover/lock target system removed. Kept as no-op for backwards compat.
      void id;
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
    setAccentColor(hex) {
      set((s) => {
        s.ui.accentColor = hex;
      });
      applyAccentColorToDom(hex);
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
    sortGroupsByPriority(tabId) {
      let changed = false;
      let shouldPersist = false;
      set((s) => {
        const targetTabId = tabId ?? s.activeTabId;
        const tab = s.tabs.find((x) => x.id === targetTabId);
        if (!tab) return;
        const prevSortedAt = tab.lastPrioritySortAt;
        const bucketsBefore = tab.groups.map((group) => getGroupDisplayBucket(group, prevSortedAt));
        const next = sortGroupsByPriorityOrder(tab.groups);
        const nextSortedAt = advancePrioritySortAt(tab.lastPrioritySortAt);
        const bucketsAfter = next.map((group) => getGroupDisplayBucket(group, nextSortedAt));
        changed =
          next.some((group, index) => group.id !== tab.groups[index]?.id) ||
          bucketsBefore.some((bucket, index) => bucket !== bucketsAfter[index]);
        tab.groups = next;
        tab.lastPrioritySortAt = nextSortedAt;
        shouldPersist = true;
      });
      if (shouldPersist) get().persist();
      return changed;
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

    setProjectContext(tabId, context, aliases, projectPath) {
      set((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        if (!t) return;
        t.projectContext = context || undefined;
        t.aliases = aliases ?? t.aliases;
        t.projectPath = projectPath || undefined;
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
      void window.braindump?.sync?.enqueue('setCategory', { tabId, groupId, category });
    },
    moveGroup(fromTabId, toTabId, groupId) {
      if (fromTabId === toTabId) return;
      void window.braindump?.sync?.enqueue('moveGroup', { fromTabId, toTabId, groupId });
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

    setClawPanelOpen(open) {
      set((s) => {
        s.clawPanelOpen = open;
      });
    },
    setClawFilterGroup(groupId) {
      set((s) => {
        s.clawFilterGroupId = groupId;
      });
    },
    setClawSkillsEditorOpen(open) {
      set((s) => {
        s.clawSkillsEditorOpen = open;
      });
    },
    setClawDraftSession(target) {
      set((s) => {
        s.clawDraftFor = target;
      });
    },
    setClawBrokerState(bs) {
      set((s) => {
        s.clawBrokerState = bs;
      });
    },
    setClawConfig(patch) {
      set((s) => {
        s.claw = {
          defaultBackend: 'claude-code',
          autoSendCategories: [],
          allowOutsideCwd: false,
          allowGitPush: false,
          allowRm: false,
          ...(s.claw ?? {}),
          ...patch
        };
      });
      get().persist();
    },
    setRunnerConfig(id, patch) {
      set((s) => {
        s.runners = s.runners ?? {};
        const cur = s.runners[id] ?? { enabled: false };
        s.runners[id] = { ...cur, ...patch };
      });
      get().persist();
    },
    setRunnerStatuses(statuses) {
      set((s) => {
        s.runnerStatuses = statuses;
      });
    },
    upsertSkill(skill) {
      set((s) => {
        s.skills = s.skills ?? [];
        const index = s.skills.findIndex((entry) => entry.id === skill.id);
        if (index >= 0) {
          s.skills[index] = { ...s.skills[index], ...skill, updatedAt: skill.updatedAt };
        } else {
          s.skills.unshift(skill);
        }
      });
      get().persist();
    },
    deleteSkill(skillId) {
      set((s) => {
        s.skills = (s.skills ?? []).filter((entry) => entry.id !== skillId);
      });
      get().persist();
    },
    markCompletedClawJobsRead(sessionIds) {
      if (!sessionIds.length) return;
      set((s) => {
        const toRead = new Set(sessionIds);
        const nextUnread = s.unreadCompletedClawJobIds.filter((id) => !toRead.has(id));
        if (nextUnread.length === s.unreadCompletedClawJobIds.length) return;
        s.unreadCompletedClawJobIds = nextUnread;
      });
    },
    toggleSelectGroup(groupId) {
      set((s) => {
        const i = s.selectedGroupIds.indexOf(groupId);
        if (i >= 0) s.selectedGroupIds.splice(i, 1);
        else s.selectedGroupIds.push(groupId);
      });
    },
    clearSelection() {
      set((s) => {
        s.selectedGroupIds = [];
        s.selectMode = false;
      });
    },
    setSelectMode(on) {
      set((s) => {
        s.selectMode = on;
        if (!on) s.selectedGroupIds = [];
      });
    },
    selectAllInActiveTab() {
      set((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId);
        if (!tab) return;
        s.selectedGroupIds = tab.groups.map((g) => g.id);
      });
    },
    upsertClawJob(job) {
      set((s) => {
        s.clawJobs = s.clawJobs ?? [];
        const i = s.clawJobs.findIndex((j) => j.sessionId === job.sessionId);
        if (i >= 0) s.clawJobs[i] = job;
        else s.clawJobs.unshift(job);
      });
      get().persist();
    },
    appendClawEvent(sessionId, event) {
      set((s) => {
        const job = (s.clawJobs ?? []).find((j) => j.sessionId === sessionId);
        if (!job) return;
        job.events.push(event);
      });
      get().persist();
    },
    appendClawArtifact(sessionId, artifact) {
      set((s) => {
        const job = (s.clawJobs ?? []).find((j) => j.sessionId === sessionId);
        if (!job) return;
        if (!job.artifacts.find((a) => a.id === artifact.id)) job.artifacts.push(artifact);
      });
      get().persist();
    },
    updateClawJob(sessionId, patch) {
      set((s) => {
        const job = (s.clawJobs ?? []).find((j) => j.sessionId === sessionId);
        if (!job) return;
        const prevState = job.state;
        Object.assign(job, patch);
        const nextState = job.state;
        const wasTerminal = prevState === 'done' || prevState === 'error' || prevState === 'interrupted';
        const isTerminal = nextState === 'done' || nextState === 'error' || nextState === 'interrupted';
        if (!wasTerminal && isTerminal && !s.unreadCompletedClawJobIds.includes(sessionId)) {
          s.unreadCompletedClawJobIds.push(sessionId);
        }
      });
      get().persist();
    },
    pushClawPrompt(sessionId, prompt) {
      set((s) => {
        const job = (s.clawJobs ?? []).find((j) => j.sessionId === sessionId);
        if (!job) return;
        if (!job.pendingPrompts.find((p) => p.promptId === prompt.promptId)) {
          job.pendingPrompts.push(prompt);
        }
      });
      get().persist();
    },
    resolveClawPrompt(sessionId, promptId) {
      set((s) => {
        const job = (s.clawJobs ?? []).find((j) => j.sessionId === sessionId);
        if (!job) return;
        job.pendingPrompts = job.pendingPrompts.filter((p) => p.promptId !== promptId);
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
  // Deprecated: hover/lock target system removed. Always null.
  return null;
}
