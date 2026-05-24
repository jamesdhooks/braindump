import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Pin,
  Clock,
  Copy,
  Trash2,
  MessageSquare,
  Sparkles,
  ListTodo,
  HelpCircle,
  Zap,
  Beaker,
  CheckSquare,
  Square,
  StopCircle,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  XCircle,
  RotateCcw,
  Send
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';
import type { ClawJob, NoteGroup as NoteGroupT, Tab, TaskComplexity } from '../types';
import { renderInlineMarkdown } from '../lib/markdown';
import { isTaskRenderMode, parseTaskLine } from '../lib/taskMode';
import { ImageAttachment } from './ImageAttachment';
import { MotionCard } from '../motion/MotionCard';
import { ArcaneTextMorph } from './ArcaneTextMorph';
import { SparkleSweep } from './SparkleSweep';
import { TrayButton, TrayDivider } from './ActionTray';
import { JobStateBadge } from './JobStateBadge';
import { JobReportCard, getReportCountSummary } from '../claw/JobReportCard';
import { REPORT_SENTINEL } from '../claw/parseJobReport';
import {
  formatJobComplexityChoice,
  getJobComplexityChoice,
  rerunJob,
  runnerIdForJob
} from '../claw/jobActions';

const COMPLEXITY_OPTIONS: TaskComplexity[] = ['simple', 'complex', 'crazy'];
const COMPLEXITY_HINT_STORAGE_KEY = 'braindump:complexity-hold-hint-seen';
let hasShownComplexityHintThisSession = false;
const HANG_THRESHOLD_MS = 180_000;
const DEFAULT_CLAUDE_MODELS: Record<TaskComplexity, string> = {
  simple: 'claude-haiku-4-5-20251001',
  complex: 'claude-sonnet-4-6',
  crazy: 'claude-opus-4-7'
};

export function NoteGroup({ tabId, group }: { tabId: string; group: NoteGroupT }) {
  const focusedId = useStore((s) => s.focusedGroupId);
  const setFocused = useStore((s) => s.setFocusedGroup);
  const setHistory = useStore((s) => s.setHistoryForGroup);
  const complete = useStore((s) => s.completeGroup);
  const togglePin = useStore((s) => s.togglePin);
  const updateGroupLines = useStore((s) => s.updateGroupLines);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const setAutoFormatOptOut = useStore((s) => s.setAutoFormatOptOut);
  const setGroupRenderAs = useStore((s) => s.setGroupRenderAs);
  const autoFormatEnabled = useStore((s) => s.autoFormat.enabled);
  const setBrainstormOpen = useStore((s) => s.setBrainstormOpen);
  const toggleSubState = useStore((s) => s.toggleSubState);
  const toggleQa = useStore((s) => s.toggleQa);
  const selectedGroupIds = useStore((s) => s.selectedGroupIds);
  const toggleSelectGroup = useStore((s) => s.toggleSelectGroup);
  const selectMode = useStore((s) => s.selectMode);
  const isSelected = selectedGroupIds.includes(group.id);
  const setClawDraftSession = useStore((s) => s.setClawDraftSession);
  const runnerStatuses = useStore((s) => s.runnerStatuses);
  const runnersConfig = useStore((s) => s.runners);
  const clawJobs = useStore((s) => s.clawJobs);
  const setClawPanelOpen = useStore((s) => s.setClawPanelOpen);
  const setClawFilterGroup = useStore((s) => s.setClawFilterGroup);
  const markCompletedClawJobsRead = useStore((s) => s.markCompletedClawJobsRead);
  const unreadCompletedClawJobIds = useStore((s) => s.unreadCompletedClawJobIds);
  const upsertClawJob = useStore((s) => s.upsertClawJob);
  const recentlyFormatted = useStore((s) => s.recentlyFormatted[group.id]);
  const tabs = useStore((s) => s.tabs);
  const newTab = useStore((s) => s.newTab);
  const addGroupLines = useStore((s) => s.addGroupLines);
  const categories = useStore((s) => s.categories);
  const moveGroup = useStore((s) => s.moveGroup);
  const setCategory = useStore((s) => s.setCategory);
  const showToast = useStore((s) => s.showToast);
  const promoteGroupToTask = useStore((s) => s.promoteGroupToTask);
  const buildTaskSendReview = useStore((s) => s.buildTaskSendReview);
  const sendTaskToNeo = useStore((s) => s.sendTaskToNeo);
  const tasks = useStore((s) => s.tasks);
  const category = group.category ? categories.find((c) => c.id === group.category) : null;
  const projectPath = tabs.find((t) => t.id === tabId)?.projectPath;
  const currentTab = tabs.find((t) => t.id === tabId);
  const suggestedTab = group.suggestedTabId ? tabs.find((t) => t.id === group.suggestedTabId) : null;
  const highlightIndices = useStore((s) => s.highlightedLines[group.id]);
  const hlSet = new Set(highlightIndices ?? []);

  // Latest CLI runner job for this specific group — drives the inline status badge.
  const latestGroupJob = useMemo(
    () =>
      (clawJobs ?? [])
        .filter((j) => j.groupId === group.id && (j.backend === 'Claude Code' || j.backend === 'GitHub Copilot'))
        .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
    [clawJobs, group.id]
  );

  const pendingGroupJobs = useMemo(
    () =>
      (clawJobs ?? []).filter(
        (j) => j.groupId === group.id && (j.state === 'running' || j.state === 'waiting-input')
      ),
    [clawJobs, group.id]
  );
  const isClaudePending = pendingGroupJobs.some((j) => j.backend === 'Claude Code');
  const isCopilotPending = pendingGroupJobs.some((j) => j.backend === 'GitHub Copilot');
  const isClawPending = pendingGroupJobs.some(
    (j) => j.backend !== 'Claude Code' && j.backend !== 'GitHub Copilot'
  );
  const hasPendingRunBadge = isClawPending || isClaudePending || isCopilotPending;
  const hasRunningJob = (clawJobs ?? []).some((j) => j.groupId === group.id && j.state === 'running');
  const latestRunningGroupJob = useMemo(
    () =>
      (clawJobs ?? [])
        .filter((j) => j.groupId === group.id && j.state === 'running')
        .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
    [clawJobs, group.id]
  );

  const completedJobsWithReport = useMemo(
    () =>
      (clawJobs ?? [])
        .filter((j) => j.groupId === group.id && !!j.report)
        .sort((a, b) => b.startedAt - a.startedAt),
    [clawJobs, group.id]
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.lines.join('\n'));
  const [explainOpen, setExplainOpen] = useState<string | null>(null);
  const [asyncActionState, setAsyncActionState] = useState<Record<string, 'running' | 'complete'>>({});
  const [complexityMenuFor, setComplexityMenuFor] = useState<'claw' | 'claude-cli' | 'copilot-cli' | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultJobIdx, setResultJobIdx] = useState(0);
  const [iterationJobId, setIterationJobId] = useState<string | null>(null);
  const [iterationDraft, setIterationDraft] = useState('');
  const completionTimers = useRef<Record<string, number>>({});
  const holdTimer = useRef<number | null>(null);
  const suppressNextClick = useRef<Record<string, boolean>>({});
  const suppressEditOnClick = useRef(false);
  const progressLogRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const isFocused = focusedId === group.id;
  const existingTask = useMemo(
    () => tasks.find((task) => task.source?.kind === 'note-group' && task.source.tabId === tabId && task.source.groupId === group.id) ?? null,
    [group.id, tabId, tasks]
  );
  const isTaskQueuedForNeo = existingTask?.sync.state === 'queued';
  const isTaskMode = isTaskRenderMode(group.renderAs);
  const isQaPassed = Boolean(group.completedAt && group.qaAt);
  const visibleLines = isQaPassed && !editing ? group.lines.slice(0, 3) : group.lines;
  const hiddenLineCount = isQaPassed && !editing ? Math.max(group.lines.length - visibleLines.length, 0) : 0;
  const activeAutoRevision = useMemo(() => {
    if (!recentlyFormatted) return null;
    return group.history
      .filter((revision) => revision.source === 'auto-format')
      .sort((a, b) => Math.abs(recentlyFormatted - a.at) - Math.abs(recentlyFormatted - b.at))[0] ?? null;
  }, [group.history, recentlyFormatted]);
  const previousVisibleLines =
    activeAutoRevision == null
      ? []
      : isQaPassed && !editing
      ? activeAutoRevision.lines.slice(0, 3)
      : activeAutoRevision.lines;
  const aiMorphActive =
    !editing &&
    Boolean(recentlyFormatted) &&
    previousVisibleLines.length > 0 &&
    previousVisibleLines.join('\n') !== visibleLines.join('\n');

  useEffect(() => {
    if (isFocused && !selectMode) {
      ref.current?.focus();
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isFocused, selectMode]);

  useEffect(() => {
    return () => {
      Object.values(completionTimers.current).forEach((timer) => window.clearTimeout(timer));
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    };
  }, []);

  useEffect(() => {
    if (latestGroupJob?.state !== 'running') return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [latestGroupJob?.sessionId, latestGroupJob?.state]);

  const runningProgressLines = useMemo(() => {
    if (!latestRunningGroupJob) return [] as string[];
    const recent = latestRunningGroupJob.events.slice(-140);
    return recent
      .map((e) => {
        const ts = new Date(e.at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        let body = '';
        switch (e.kind) {
          case 'thinking':
            body = e.text;
            break;
          case 'log':
            body = e.level === 'info' ? e.text : `[${e.level}] ${e.text}`;
            break;
          case 'tool-call':
            body = `-> ${e.tool}(${Object.keys(e.args).join(', ')})`;
            break;
          case 'tool-result':
            body = `<- ${e.ok ? 'ok' : 'err'}${e.text ? `: ${e.text.slice(0, 180)}` : ''}`;
            break;
          case 'prompt':
            body = `? ${e.question}`;
            break;
          case 'user-reply':
            body = `> ${e.text}`;
            break;
          case 'status':
            body = `-- ${e.state}${typeof e.progress === 'number' ? ` ${Math.round(e.progress * 100)}%` : ''} --`;
            break;
          case 'safety-block':
            body = `BLOCKED: ${e.reason}`;
            break;
          default:
            body = '';
        }
        if (!body || body.includes(REPORT_SENTINEL)) return null;
        return `${ts}  ${body}`;
      })
      .filter((line): line is string => Boolean(line));
  }, [latestRunningGroupJob]);

  useEffect(() => {
    if (!latestRunningGroupJob) return;
    const el = progressLogRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [latestRunningGroupJob?.sessionId, runningProgressLines.length]);

  useEffect(() => {
    const latestReportedJob = completedJobsWithReport[0];
    if (!latestReportedJob) return;
    if (unreadCompletedClawJobIds.includes(latestReportedJob.sessionId)) {
      setResultsOpen(true);
    }
  }, [completedJobsWithReport, unreadCompletedClawJobIds]);

  useEffect(() => {
    if (resultJobIdx < completedJobsWithReport.length) return;
    setResultJobIdx(Math.max(completedJobsWithReport.length - 1, 0));
  }, [completedJobsWithReport.length, resultJobIdx]);

  useEffect(() => {
    if (hasShownComplexityHintThisSession) return;
    if (typeof window === 'undefined') return;

    let seen = false;
    try {
      seen = window.localStorage.getItem(COMPLEXITY_HINT_STORAGE_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;

    hasShownComplexityHintThisSession = true;
    const t = window.setTimeout(() => {
      showToast({
        kind: 'info',
        message: 'Tip: hold Claw / CL / GH run buttons to choose task complexity.'
      });
      try {
        window.localStorage.setItem(COMPLEXITY_HINT_STORAGE_KEY, '1');
      } catch {
        // non-fatal: if storage is unavailable, this may show again next run.
      }
    }, 1000);

    return () => {
      window.clearTimeout(t);
    };
  }, [showToast]);

  useEffect(() => {
    if (!complexityMenuFor) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-complexity-menu]') || t.closest('[data-complexity-trigger]')) return;
      setComplexityMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComplexityMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [complexityMenuFor]);

  function setActionRunning(key: string) {
    const existingTimer = completionTimers.current[key];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete completionTimers.current[key];
    }
    setAsyncActionState((current) => ({ ...current, [key]: 'running' }));
  }

  function setActionComplete(key: string) {
    const existingTimer = completionTimers.current[key];
    if (existingTimer) window.clearTimeout(existingTimer);
    setAsyncActionState((current) => ({ ...current, [key]: 'complete' }));
    completionTimers.current[key] = window.setTimeout(() => {
      setAsyncActionState((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      delete completionTimers.current[key];
    }, 1250);
  }

  function clearActionState(key: string) {
    const existingTimer = completionTimers.current[key];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete completionTimers.current[key];
    }
    setAsyncActionState((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function runAsyncAction(key: string, action: () => Promise<void>, failureLabel: string) {
    setActionRunning(key);
    void (async () => {
      try {
        await action();
        setActionComplete(key);
      } catch (error) {
        clearActionState(key);
        const message = error instanceof Error ? error.message : 'Unknown error';
        showToast({ message: `${failureLabel}: ${message}`, kind: 'error' });
      }
    })();
  }

  async function explainBack() {
    const res = await window.braindump.skill.explainBack(group.lines);
    if (res.ok && res.value?.summary) {
      const q = res.value.questions ?? [];
      setExplainOpen(
        [res.value.summary, ...(q.length ? ['', ...q.map((qq) => `? ${qq}`)] : [])].join('\n')
      );
    }
  }

  async function extractTasks() {
    const res = await window.braindump.skill.tasks(group.lines);
    if (!res.ok) {
      showToast({ message: `Extract tasks failed: ${res.error ?? 'No provider or invalid response'}`, kind: 'error' });
      return;
    }
    if (!res.value?.tasks?.length) {
      showToast({ message: 'No actionable tasks found', kind: 'error' });
      return;
    }
    let tasksTab = tabs.find((t) => t.name.toLowerCase() === 'tasks') as Tab | undefined;
    if (!tasksTab) {
      const id = newTab('Tasks');
      tasksTab = useStore.getState().tabs.find((t) => t.id === id);
    }
    if (tasksTab) {
      const normalizedTasks = res.value.tasks
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          if (/^[-*]\s*\[[ xX]\]\s+/.test(line)) return line;
          if (/^\[[ xX]\]\s+/.test(line)) return `- ${line}`;
          if (/^[-*]\s+/.test(line)) return line.replace(/^[-*]\s+/, '- [ ] ');
          if (/^\d+[.)]\s+/.test(line)) return line.replace(/^\d+[.)]\s+/, '- [ ] ');
          return `- [ ] ${line}`;
        });
      addGroupLines(tasksTab.id, normalizedTasks, false, 'user');
      showToast({ message: `Extracted ${normalizedTasks.length} task${normalizedTasks.length === 1 ? '' : 's'}`, kind: 'success' });
    }
  }

  function promoteToTaskCard() {
    if (existingTask) {
      showToast({ message: 'This dump is already a TaskCard', kind: 'info' });
      return;
    }
    const taskId = promoteGroupToTask(tabId, group.id);
    if (!taskId) {
      showToast({ message: 'Could not promote this dump to a task', kind: 'error' });
      return;
    }
    showToast({ message: 'Promoted to TaskCard — review before sending to Neo', kind: 'success' });
  }

  function reviewAndSendToNeo() {
    const taskId = existingTask?.id ?? promoteGroupToTask(tabId, group.id);
    if (!taskId) {
      showToast({ message: 'Could not prepare task for Neo', kind: 'error' });
      return;
    }
    const review = buildTaskSendReview(taskId);
    if (!review) {
      showToast({ message: 'Could not build Send to Neo review', kind: 'error' });
      return;
    }
    const confirmed = window.confirm(
      [
        'Send this TaskCard to Neo?',
        '',
        `Project: ${review.projectId}`,
        `Title: ${review.title}`,
        review.description ? `Description: ${review.description}` : null,
        review.tags.length ? `Tags: ${review.tags.join(', ')}` : null,
        '',
        'This queues a task.requested outbox event.'
      ].filter(Boolean).join('\n')
    );
    if (!confirmed) return;
    const sentReview = sendTaskToNeo(taskId);
    if (!sentReview) {
      showToast({ message: 'Could not queue Send to Neo request', kind: 'error' });
      return;
    }
    showToast({ message: 'Queued for Neo via TaskCard outbox', kind: 'success' });
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(group.lines.join('\n'));
      showToast({ message: 'Copied to clipboard', kind: 'success' });
    } catch {
      showToast({ message: 'Copy failed', kind: 'error' });
      throw new Error('Clipboard write failed');
    }
  }

  function startEdit() {
    setDraft(group.lines.join('\n'));
    setEditing(true);
    setFocused(group.id);
  }

  function isNonEditTarget(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest('button, a, textarea, input, [data-no-edit]'));
  }

  function onCardClickCapture(e: React.MouseEvent) {
    suppressEditOnClick.current = isNonEditTarget(e.target);
  }

  function onCardClick(e: React.MouseEvent) {
    if (selectMode) {
      toggleSelectGroup(group.id);
      return;
    }
    if (suppressEditOnClick.current) {
      suppressEditOnClick.current = false;
      return;
    }
    // Ignore clicks on interactive elements inside the card.
    if (isNonEditTarget(e.target)) return;
    if (editing) return;
    startEdit();
  }

  function saveEdit() {
    const newLines = draft
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim().length);
    if (newLines.length) updateGroupLines(tabId, group.id, newLines, 'user');
    setEditing(false);
  }

  // Pre-group lines so code fences become a single renderable segment
  type LineSegment =
    | { kind: 'line'; index: number }
    | { kind: 'code'; lang: string; codeLines: string[]; key: number };

  const lineSegments = useMemo<LineSegment[]>(() => {
    const segs: LineSegment[] = [];
    let i = 0;
    while (i < visibleLines.length) {
      const line = visibleLines[i];
      const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        const lang = fenceMatch[2].trim();
        const key = i;
        const codeLines: string[] = [];
        i++;
        while (i < visibleLines.length && !visibleLines[i].startsWith(marker)) {
          codeLines.push(visibleLines[i]);
          i++;
        }
        if (i < visibleLines.length) i++; // skip closing fence
        segs.push({ kind: 'code', lang, codeLines, key });
      } else {
        segs.push({ kind: 'line', index: i });
        i++;
      }
    }
    return segs;
  }, [visibleLines]);

  function confirmDelete() {
    if (!confirm('Delete this dump? You can undo from the toast.')) return;
    deleteGroup(tabId, group.id);
  }

  function beginHold(kind: 'claw' | 'claude-cli' | 'copilot-cli') {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      suppressNextClick.current[kind] = true;
      setComplexityMenuFor(kind);
    }, 380);
  }

  function endHold() {
    if (!holdTimer.current) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function shouldSuppressClick(kind: 'claw' | 'claude-cli' | 'copilot-cli') {
    if (!suppressNextClick.current[kind]) return false;
    delete suppressNextClick.current[kind];
    return true;
  }

  function runnerLabel(rid: 'claude-cli' | 'copilot-cli') {
    return rid === 'claude-cli' ? 'Claude' : 'Copilot';
  }

  async function formatNow() {
    const changed = await window.braindump.autoFormat.formatGroup(tabId, group.id);
    showToast({
      message: changed ? 'Formatted dump' : 'No formatting changes needed',
      kind: changed ? 'success' : 'info'
    });
  }

  function runnerModelLabel(rid: 'claude-cli' | 'copilot-cli', tier: TaskComplexity) {
    const cfgKey = rid === 'claude-cli' ? 'claudeCli' : 'copilotCli';
    const configured = runnersConfig?.[cfgKey]?.model?.[tier];
    if (configured) return configured;
    if (rid === 'claude-cli') return DEFAULT_CLAUDE_MODELS[tier];
    return tier;
  }

  function runRunner(rid: 'claude-cli' | 'copilot-cli', complexity?: TaskComplexity) {
    return runAsyncAction(
      `runner:${rid}`,
      async () => {
        await window.braindump.runner.run({
          runnerId: rid,
          tabId,
          groupId: group.id,
          complexity,
          cwd: projectPath,
          prompt: group.lines.join('\n'),
          system: [
            'You are an autonomous coding assistant working on a real codebase.',
            'Tech stack: Electron + React + TypeScript + Vite + Tailwind CSS.',
            'Renderer code is in src/, main process in electron/, shared packages in packages/.',
            'Implement the requested changes by directly reading and editing the relevant files.',
            'Do NOT ask clarifying questions — explore the codebase with your tools, make the best decision, and proceed.',
            complexity ? `Requested complexity: ${complexity}.` : null,
            currentTab?.name ? `Project: ${currentTab.name}` : null,
            projectPath ? `Working directory: ${projectPath}` : null,
            currentTab?.projectContext ? `Context: ${currentTab.projectContext}` : null,
          ].filter(Boolean).join('\n')
        });
        const detail = complexity ? ` (${complexity})` : '';
        showToast({ message: `Sent to ${runnerLabel(rid)}${detail}`, kind: 'success' });
      },
      `${runnerLabel(rid)} failed`
    );
  }

  const latestJobHanging = (() => {
    if (!latestGroupJob || latestGroupJob.state !== 'running') return false;
    const lastActivity = latestGroupJob.events.reduce((latest, e) => Math.max(latest, e.at), latestGroupJob.startedAt);
    return nowTick - lastActivity > HANG_THRESHOLD_MS;
  })();

  const latestComplexityChoice = latestGroupJob ? getJobComplexityChoice(latestGroupJob) : null;
  const latestComplexityLabel = formatJobComplexityChoice(latestComplexityChoice);
  const latestRunnerId = latestGroupJob ? runnerIdForJob(latestGroupJob) : null;
  const canContinueLatestJob =
    !!latestGroupJob &&
    !!latestRunnerId &&
    !!latestGroupJob.invocation?.prompt &&
    ((latestGroupJob.state !== 'running' && latestGroupJob.state !== 'waiting-input') || latestJobHanging);

  function continueLatestJob() {
    if (!latestGroupJob || !canContinueLatestJob) return;
    runAsyncAction(
      `continue:${latestGroupJob.sessionId}`,
      async () => {
        await rerunJob(latestGroupJob, { mode: 'continue' }, { upsertJob: upsertClawJob });
        showToast({ message: `Continuing ${latestGroupJob.backend} job`, kind: 'success' });
      },
      'Continue failed'
    );
  }

  function iterateReportJob(job: ClawJob) {
    const desiredChanges = iterationDraft.trim();
    if (!desiredChanges.length) {
      showToast({ message: 'Add desired changes before iterating', kind: 'error' });
      return;
    }
    runAsyncAction(
      `iterate:${job.sessionId}`,
      async () => {
        await rerunJob(job, { mode: 'iterate', desiredChanges }, { upsertJob: upsertClawJob });
        setIterationDraft('');
        setIterationJobId(null);
        setResultsOpen(false);
        showToast({ message: `Iterating ${job.backend} job`, kind: 'success' });
      },
      'Iterate failed'
    );
  }

  return (
    <MotionCard
      ref={ref}
      tabIndex={0}
      onFocus={() => setFocused(group.id)}
      onClickCapture={onCardClickCapture}
      onClick={onCardClick}
      layout
      className={clsx(
        'card group relative pl-10 pr-12 outline-none',
        isQaPassed ? 'pt-2.5 pb-2' : 'pt-4 pb-3',
        selectMode ? 'cursor-pointer' : 'cursor-text',
        selectMode && !isSelected && 'hover:ring-2 hover:ring-accent-500/40 hover:bg-accent-500/5',
        isFocused && 'is-focused',
        group.pinned && 'border-l-2 pinned-bob',
        group.completedAt && !group.qaAt && 'opacity-55',
        isQaPassed && 'opacity-85',
        recentlyFormatted && 'format-flash',
        hasRunningJob && 'job-shine',
        isSelected && 'border-accent-400/75 ring-2 ring-accent-400/70 bg-accent-500/[0.12] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_26px_-10px_var(--accent-glow)]',
        !isSelected && latestJobHanging && 'ring-2 ring-warning/60 bg-warning/[0.05] shadow-[0_0_18px_-8px_theme(colors.amber.400)]',
        !isSelected && latestGroupJob?.state === 'waiting-input' && 'ring-2 ring-warning/60 bg-warning/[0.04] shadow-[0_0_18px_-8px_theme(colors.amber.400)]'
      )}
      style={
        group.pinned
          ? { borderLeftColor: 'var(--accent-500)' }
          : category
          ? { boxShadow: `inset 3px 0 0 0 ${category.color}` }
          : undefined
      }
    >
      {/* Prominent check button — always visible on the left */}
      <button
        className={clsx(
          'absolute left-2.5 top-4 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
          group.completedAt
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-fg-3 text-fg-3 opacity-30 hover:opacity-100 hover:border-green-400 hover:text-green-400'
        )}
        title={group.completedAt ? 'Mark incomplete' : 'Complete (will archive on next daily report)'}
        onClick={(e) => {
          e.stopPropagation();
          complete(tabId, group.id);
        }}
      >
        <Check size={11} strokeWidth={2.5} />
      </button>

      {/* QA button — below the complete button, only shown when completed */}
      {group.completedAt && (
        <button
          className={clsx(
            'absolute left-2.5 top-11 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
            group.qaAt
              ? 'bg-amber-400 border-amber-400 text-white'
              : 'border-amber-400/50 text-amber-400/60 opacity-60 hover:opacity-100 hover:border-amber-400 hover:text-amber-400'
          )}
          title={group.qaAt ? 'QA passed — click to revoke' : 'Mark QA passed'}
          onClick={(e) => {
            e.stopPropagation();
            toggleQa(tabId, group.id);
          }}
        >
          <Beaker size={11} strokeWidth={2} />
        </button>
      )}

      {/* Select toggle — absolute top-right, hover-only unless selected */}
      <div
        className={clsx(
          'absolute right-2 top-1 z-10 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        data-no-edit
      >
        <TrayButton
          title={isSelected ? 'Unselect' : 'Select for bulk actions'}
          onClick={() => toggleSelectGroup(group.id)}
          active={isSelected}
          compact
          className="-m-1"
        >
          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
        </TrayButton>
      </div>

      {latestGroupJob && (latestGroupJob.state === 'running' || canContinueLatestJob) && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5" data-no-edit onClick={(e) => e.stopPropagation()}>
          {latestComplexityLabel && (
            <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-2">
              {latestComplexityLabel}
            </span>
          )}
          {canContinueLatestJob && (
            <TrayButton
              title={latestJobHanging ? 'Continue this hanging job' : 'Continue this job'}
              onClick={continueLatestJob}
              primary
              label={asyncActionState[`continue:${latestGroupJob.sessionId}`] === 'running' ? 'Continuing…' : 'Continue'}
              loading={asyncActionState[`continue:${latestGroupJob.sessionId}`] === 'running'}
              className="h-10 px-4"
            >
              <RotateCcw size={14} />
            </TrayButton>
          )}
          {latestGroupJob.state === 'running' && (
            <TrayButton
              title={`Stop ${latestGroupJob.backend}`}
              onClick={() => void window.braindump.runner.interrupt(latestGroupJob.sessionId)}
              danger
              label="Stop"
              className="h-10 px-4"
            >
              <StopCircle size={14} />
            </TrayButton>
          )}
        </div>
      )}

      {editing ? (
        <textarea
          autoFocus
          data-no-edit
          className="w-full bg-surface-0 border border-hairline focus:border-accent-500 rounded p-2 text-fg-0 outline-none"
          rows={Math.max(3, draft.split('\n').length)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') {
              setEditing(false);
              setDraft(group.lines.join('\n'));
            }
          }}
        />
      ) : (
        <div className="relative">
          <ArcaneTextMorph previousLines={previousVisibleLines} nextLines={visibleLines} trigger={recentlyFormatted} />
          <div
            className={clsx(
              'relative overflow-hidden rounded-md transition-[opacity,filter,transform] ease-[cubic-bezier(0.22,1,0.36,1)]',
              aiMorphActive
                ? 'opacity-80 blur-[1px] translate-y-[1px] duration-[1150ms]'
                : 'opacity-100 blur-0 translate-y-0 duration-500'
            )}
          >
            <div className={clsx('space-y-0.5', isQaPassed ? 'text-[13px] leading-5' : 'text-[14.5px] leading-6')}>
              {lineSegments.map((seg) => {
            // ── Code block ──────────────────────────────────────────────────
            if (seg.kind === 'code') {
              return (
                <pre
                  key={seg.key}
                  className="mt-1.5 mb-0.5 overflow-x-auto rounded bg-surface-0 border border-hairline px-3 py-2 text-[12.5px] font-mono text-fg-1 leading-5"
                >
                  {seg.lang && (
                    <div className="text-[10px] text-fg-3 mb-1.5 pb-1 border-b border-hairline">{seg.lang}</div>
                  )}
                  <code>{seg.codeLines.join('\n')}</code>
                </pre>
              );
            }

            // ── Line ────────────────────────────────────────────────────────
            const i = seg.index;
            const line = visibleLines[i];
            const hlClass = hlSet.has(i) ? 'rounded bg-accent-500/15 px-1 -mx-1 transition-colors' : '';

            // Checkbox
            const taskLine = parseTaskLine(line, isTaskMode);
            if (taskLine) {
              const subDone = group.subStates?.[i]?.completed ?? taskLine.checked;
              const lineCompleted = !!group.completedAt || subDone;
              const strikeThrough = (lineCompleted && !group.completedAt) || (group.completedAt && !!group.qaAt);
              return (
                <div key={i} data-no-edit className={`break-words flex items-start gap-2 cursor-pointer ${lineCompleted ? 'text-fg-3' : 'text-fg-0'} ${hlClass}`} onClick={(e) => { e.stopPropagation(); toggleSubState(tabId, group.id, i); }}>
                  <input
                    type="checkbox"
                    checked={subDone}
                    readOnly
                    tabIndex={-1}
                    className="mt-1.5 shrink-0 accent-accent-500 cursor-pointer pointer-events-none"
                  />
                  <span className={`${strikeThrough ? 'line-through' : ''} select-text`} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(taskLine.content) }} />
                </div>
              );
            }

            const lineCompleted = !!group.completedAt;
            const strikeThrough = group.completedAt && !!group.qaAt;

            // Heading
            const headingMatch = /^(#{1,6})\s+(.+)/.exec(line);
            if (headingMatch) {
              const level = headingMatch[1].length;
              const headingCls = [
                'text-[1.3em] font-semibold text-fg-0 mt-1',
                'text-[1.15em] font-semibold text-fg-0 mt-0.5',
                'text-[1.05em] font-medium text-fg-0',
                'font-medium text-fg-0',
                'text-[0.95em] font-medium text-fg-1',
                'text-[0.9em] font-medium text-fg-1',
              ][level - 1];
              return (
                <div key={i} className={`break-words ${headingCls} ${hlClass}`}>
                  <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(headingMatch[2]) }} />
                </div>
              );
            }

            // Horizontal rule
            if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
              return <hr key={i} className="my-1 border-hairline" />;
            }

            // Blockquote
            const bqMatch = /^>\s?(.*)/.exec(line);
            if (bqMatch) {
              return (
                <div key={i} className={`pl-3 border-l-2 border-fg-3/40 text-fg-2 italic ${hlClass}`}>
                  <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(bqMatch[1]) }} />
                </div>
              );
            }

            // Unordered bullet
            const bulletMatch = /^(\s*)([-*+])\s+(.+)/.exec(line);
            if (bulletMatch) {
              return (
                <div key={i} className={`flex items-baseline gap-2 ${bulletMatch[1].length > 0 ? 'pl-4' : ''} ${lineCompleted ? 'text-fg-3' : 'text-fg-0'} ${hlClass}`}>
                  <span className="text-fg-3 shrink-0 leading-none select-none">&bull;</span>
                  <span className={strikeThrough ? 'line-through' : ''} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(bulletMatch[3]) }} />
                </div>
              );
            }

            // Ordered list
            const olMatch = /^(\s*)(\d+)\.\s+(.+)/.exec(line);
            if (olMatch) {
              return (
                <div key={i} className={`flex items-baseline gap-2 ${olMatch[1].length > 0 ? 'pl-4' : ''} ${lineCompleted ? 'text-fg-3' : 'text-fg-0'} ${hlClass}`}>
                  <span className="text-fg-3 shrink-0 font-mono text-[0.85em]">{olMatch[2]}.</span>
                  <span className={strikeThrough ? 'line-through' : ''} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(olMatch[3]) }} />
                </div>
              );
            }

            // Empty line — small spacer
            if (line.trim() === '') {
              return <div key={i} className="h-1" />;
            }

            // Default normal line
            return (
              <div key={i} className={`break-words ${lineCompleted ? 'text-fg-3' : 'text-fg-0'} ${hlClass}`}>
                <span className={strikeThrough ? 'line-through' : ''} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }} />
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}

      {hiddenLineCount > 0 && (
        <div className="mt-1 text-[11px] text-fg-3">
          +{hiddenLineCount} more line{hiddenLineCount === 1 ? '' : 's'}
        </div>
      )}

      {group.attachments && group.attachments.length > 0 && !isQaPassed && (
        <div className="mt-3 flex flex-wrap gap-2">
          {group.attachments.map((a) => (
            <ImageAttachment key={a.id} tabId={tabId} groupId={group.id} att={a} />
          ))}
        </div>
      )}
      {group.attachments && group.attachments.length > 0 && isQaPassed && (
        <div className="mt-2 text-[11px] text-fg-3">
          {group.attachments.length} attachment{group.attachments.length === 1 ? '' : 's'}
        </div>
      )}

      {explainOpen && (
        <div className="mt-3 p-3 rounded bg-surface-0 border border-accent-500/30 text-[12.5px] text-fg-1 whitespace-pre-wrap">
          {explainOpen}
          <div className="text-right">
            <button className="mt-2 text-[11px] text-fg-3 hover:text-fg-0" onClick={(e) => { e.stopPropagation(); setExplainOpen(null); }}>
              dismiss
            </button>
          </div>
        </div>
      )}

      {suggestedTab && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-surface-3 px-2.5 py-1.5 text-[11px] text-fg-1 fade-new">
          <span>
            Looks like <span className="text-fg-0">{suggestedTab.name}</span> — move?
          </span>
          <div className="flex items-center gap-1">
            <button
              className="px-2 py-0.5 rounded bg-accent-500 text-white hover:bg-accent-600"
              onClick={(e) => {
                e.stopPropagation();
                moveGroup(tabId, suggestedTab.id, group.id);
              }}
            >
              Move
            </button>
            <button
              className="px-2 py-0.5 rounded text-fg-2 hover:text-fg-0"
              onClick={(e) => {
                e.stopPropagation();
                useStore.setState((s) => {
                  const t = s.tabs.find((x) => x.id === tabId);
                  const g = t?.groups.find((x) => x.id === group.id);
                  if (g) g.suggestedTabId = undefined;
                });
                useStore.getState().persist();
              }}
            >
              dismiss
            </button>
          </div>
        </div>
      )}

      {/* Bottom row: meta on the left, action tray on the right */}
      <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-fg-3" data-no-edit>
        <span>{new Date(group.updatedAt).toLocaleString()}</span>
        {category && (
          <button
            className="flex items-center gap-1 hover:text-fg-0"
            title="Click to change category"
            onClick={(e) => {
              e.stopPropagation();
              const next = prompt(
                `Category id (blank to clear). Available: ${categories.map((c) => c.id).join(', ')}`,
                group.category ?? ''
              );
              if (next == null) return;
              setCategory(tabId, group.id, next.trim() || null);
            }}
          >
            <span className="w-2 h-2 rounded-sm" style={{ background: category.color }} />
            {category.label}
          </button>
        )}
        {group.tags && group.tags.length > 0 && (
          <span className="flex gap-1">
            {group.tags.slice(0, 5).map((t) => (
              <span key={t} className="text-accent-400">
                #{t}
              </span>
            ))}
          </span>
        )}
        {isTaskMode && <span className="text-accent-300">tasks</span>}
        {group.pinned && <span className="text-accent-400">pinned</span>}
        {isQaPassed && <span className="text-amber-300">QA passed</span>}
        {group.history.some((r) => r.source === 'auto-format') && <span>✨ edited</span>}

        {/* Inline CLI session status badge — click to open the job panel */}
        {latestGroupJob && (
          <button
            className="transition-transform hover:-translate-y-px"
            title={`View ${latestGroupJob.backend} session`}
            onClick={(e) => {
              e.stopPropagation();
              if (
                latestGroupJob.state === 'done' ||
                latestGroupJob.state === 'error' ||
                latestGroupJob.state === 'interrupted'
              ) {
                markCompletedClawJobsRead([latestGroupJob.sessionId]);
              }
              setClawFilterGroup(latestGroupJob.groupId);
              setClawPanelOpen(true);
            }}
          >
            {latestGroupJob.state === 'running' && (
              <JobStateBadge
                state={latestJobHanging ? 'waiting-input' : 'running'}
                label={
                  latestJobHanging
                    ? `${latestGroupJob.backend} hanging - continue?${latestComplexityLabel ? ` (${latestComplexityLabel})` : ''}`
                    : `${latestGroupJob.backend} running${latestComplexityLabel ? ` (${latestComplexityLabel})` : ''}`
                }
                size="sm"
              />
            )}
            {latestGroupJob.state === 'waiting-input' && (
              <JobStateBadge state="waiting-input" label={`${latestGroupJob.backend} input needed`} size="sm" />
            )}
            {latestGroupJob.state === 'done' && (
              <JobStateBadge state="done" label={`${latestGroupJob.backend} complete`} size="sm" />
            )}
            {latestGroupJob.state === 'error' && (
              <JobStateBadge state="error" label={`${latestGroupJob.backend} error`} size="sm" />
            )}
            {latestGroupJob.state === 'interrupted' && (
              <JobStateBadge state="interrupted" label={`${latestGroupJob.backend} stopped`} size="sm" />
            )}
          </button>
        )}

        {/* Action tray — right side, hidden in select mode */}
        {!selectMode && (
          <div
            className={clsx(
              'ml-auto flex items-center gap-1 text-fg-2 transition-opacity',
              hasPendingRunBadge ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
            )}
            data-no-edit
            onClick={(e) => e.stopPropagation()}
          >
        {/* Group: status */}
        <TrayButton title="Pin (P)" onClick={() => togglePin(tabId, group.id)} active={group.pinned} compact>
          <Pin size={14} />
        </TrayButton>
        <TrayDivider />

        {/* Group: utility */}
        <TrayButton
          title="Copy to clipboard"
          onClick={() => runAsyncAction('copy', copyToClipboard, 'Copy failed')}
          loading={asyncActionState.copy === 'running'}
          success={asyncActionState.copy === 'complete'}
          compact
        >
          <Copy size={14} />
        </TrayButton>
        <TrayButton title="Revision history" onClick={() => setHistory(group.id)} compact>
          <Clock size={14} />
        </TrayButton>

        <TrayDivider />

        {/* Group: AI */}
        <TrayButton
          title={isTaskMode ? 'Stop forcing task rendering' : 'Render this dump as tasks'}
          onClick={() => setGroupRenderAs(tabId, group.id, isTaskMode ? undefined : 'tasks')}
          active={isTaskMode}
          compact
        >
          <CheckSquare size={14} />
        </TrayButton>
        <TrayButton
          title={
            autoFormatEnabled
              ? group.autoFormatOptOut
                ? 'Enable auto-format for this dump'
                : 'Opt out of auto-format'
              : 'Format this dump now'
          }
          onClick={() =>
            autoFormatEnabled
              ? setAutoFormatOptOut(tabId, group.id, !group.autoFormatOptOut)
              : runAsyncAction('format-now', formatNow, 'Format failed')
          }
          active={autoFormatEnabled ? !group.autoFormatOptOut : false}
          loading={asyncActionState['format-now'] === 'running'}
          success={asyncActionState['format-now'] === 'complete'}
          compact
        >
          <Sparkles size={14} />
        </TrayButton>
        <TrayButton
          title="Explain back"
          onClick={() => runAsyncAction('explain', explainBack, 'Explain back failed')}
          loading={asyncActionState.explain === 'running'}
          success={asyncActionState.explain === 'complete'}
          compact
        >
          <MessageSquare size={14} />
        </TrayButton>
        <TrayButton
          title="Extract tasks"
          onClick={() => runAsyncAction('tasks', extractTasks, 'Extract tasks failed')}
          loading={asyncActionState.tasks === 'running'}
          success={asyncActionState.tasks === 'complete'}
          compact
        >
          <ListTodo size={14} />
        </TrayButton>
        <TrayButton
          title={existingTask ? 'Already promoted to TaskCard' : 'Promote this dump to a local TaskCard'}
          onClick={promoteToTaskCard}
          active={Boolean(existingTask)}
          compact
        >
          <ListTodo size={14} />
        </TrayButton>
        <TrayButton
          title={isTaskQueuedForNeo ? 'TaskCard queued for Neo' : 'Review and Send to Neo'}
          onClick={reviewAndSendToNeo}
          active={isTaskQueuedForNeo}
          compact
        >
          <Send size={14} />
        </TrayButton>
        {group.brainstormId && (
          <TrayButton title="Jump to brainstorm" onClick={() => setBrainstormOpen(true)} compact>
            <HelpCircle size={14} />
          </TrayButton>
        )}

        <TrayDivider />

        {/* Group: run */}
        <div
          className="relative"
          data-complexity-trigger
          onPointerDown={() => beginHold('claw')}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
        >
          <TrayButton
            title={isClawPending ? 'Claw run pending (hold for complexity)' : 'Run with Claw (Ctrl+Shift+K, hold for complexity)'}
            onClick={() => {
              if (shouldSuppressClick('claw')) return;
              setClawDraftSession({ tabId, groupId: group.id });
            }}
            pending={isClawPending}
            active={isClawPending}
            compact
          >
            <Zap size={14} />
          </TrayButton>
          {complexityMenuFor === 'claw' && (
            <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-40" data-complexity-menu>
              <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-1/95 backdrop-blur p-1 shadow-pop">
                {COMPLEXITY_OPTIONS.map((tier) => (
                  <button
                    key={tier}
                    className="whitespace-nowrap text-left px-2.5 py-1.5 rounded text-[11px] text-fg-1 hover:bg-surface-3 hover:text-fg-0"
                    onClick={() => {
                      setComplexityMenuFor(null);
                      setClawDraftSession({ tabId, groupId: group.id, complexity: tier });
                    }}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {(['claude-cli', 'copilot-cli'] as const).map((rid) => {
          const cfgKey = rid === 'claude-cli' ? 'claudeCli' : 'copilotCli';
          const cfg = runnersConfig?.[cfgKey];
          const status = runnerStatuses.find((s) => s.id === rid);
          if (!cfg?.enabled || !status?.available) return null;
          const label = runnerLabel(rid);
          return (
            <div
              key={rid}
              className="relative"
              data-complexity-trigger
              onPointerDown={() => beginHold(rid)}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
            >
              <TrayButton
                title={
                  (rid === 'claude-cli' ? isClaudePending : isCopilotPending)
                    ? `${label} run pending (hold for complexity)`
                    : `Run with ${label} (hold for complexity)`
                }
                compact
                onClick={() => {
                  if (shouldSuppressClick(rid)) return;
                  runRunner(rid);
                }}
                loading={
                  asyncActionState[`runner:${rid}`] === 'running'
                }
                pending={rid === 'claude-cli' ? isClaudePending : isCopilotPending}
                active={rid === 'claude-cli' ? isClaudePending : isCopilotPending}
                success={asyncActionState[`runner:${rid}`] === 'complete'}
              >
                <span className="text-[10px] font-semibold uppercase tracking-tight">
                  {rid === 'claude-cli' ? 'CL' : 'GH'}
                </span>
              </TrayButton>
              {complexityMenuFor === rid && (
                <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-40" data-complexity-menu>
                  <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-1/95 backdrop-blur p-1 shadow-pop min-w-[220px]">
                    {COMPLEXITY_OPTIONS.map((tier) => (
                      <button
                        key={tier}
                        className="text-left px-2.5 py-1.5 rounded text-[11px] text-fg-1 hover:bg-surface-3 hover:text-fg-0"
                        onClick={() => {
                          setComplexityMenuFor(null);
                          runRunner(rid, tier);
                        }}
                      >
                        <div className="font-medium uppercase tracking-wide">{tier}</div>
                        <div className="text-[10px] text-fg-3 truncate">{runnerModelLabel(rid, tier)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Stop button — only when a runner job for this group is actively running */}
        {latestGroupJob?.state === 'running' && (
          <TrayButton
            title={`Stop ${latestGroupJob.backend}`}
            compact
            danger
            onClick={() => void window.braindump.runner.interrupt(latestGroupJob.sessionId)}
          >
            <StopCircle size={14} />
          </TrayButton>
        )}

        {/* Destructive */}
        <TrayButton title="Delete dump" onClick={confirmDelete} danger compact>
          <Trash2 size={14} />
        </TrayButton>
          </div>
        )}
      </div>

      {/* Dedicated running job progress log */}
      {latestRunningGroupJob && (
        <div className="border-t border-hairline" data-no-edit onClick={(e) => e.stopPropagation()}>
          <div className="px-3 pt-2 pb-1 flex items-center justify-between text-[10px] text-fg-3">
            <span className="uppercase tracking-wider">Job progress</span>
            <span className="text-fg-3/80">
              {latestRunningGroupJob.backend}
              {latestComplexityLabel ? ` · ${latestComplexityLabel}` : ''}
            </span>
          </div>
          <div
            ref={progressLogRef}
            className="mx-3 mb-3 h-28 overflow-y-auto rounded-md border border-hairline bg-surface-2/60 p-2 font-mono text-[11px] leading-[1.45] text-fg-2"
          >
            {runningProgressLines.length === 0 ? (
              <div className="text-fg-3">Waiting for first log line...</div>
            ) : (
              <div className="space-y-0.5">
                {runningProgressLines.map((line, idx) => (
                  <div key={`${latestRunningGroupJob.sessionId}:${idx}`} className="break-all">
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsible job results panel — shown when completed jobs have structured reports */}
      {completedJobsWithReport.length > 0 && (
        <div className="border-t border-hairline" data-no-edit onClick={(e) => e.stopPropagation()}>
          <button
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-fg-2 hover:text-fg-0 hover:bg-surface-2/50 transition-colors"
            onClick={() => {
              setResultsOpen((v) => !v);
              markCompletedClawJobsRead(completedJobsWithReport.map((job) => job.sessionId));
            }}
          >
            {resultsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="font-medium">
              {completedJobsWithReport.length === 1 ? 'Inspect report' : 'Inspect report history'}
            </span>
            {(() => {
              const latestJob = completedJobsWithReport[0];
              const latestReport = latestJob?.report;
              if (!latestJob || !latestReport) return null;
              const isUnread = unreadCompletedClawJobIds.includes(latestJob.sessionId);
              return (
                <>
                  {getReportCountSummary(latestReport).map((part) => (
                    <span key={part} className="text-[10px] uppercase tracking-wider text-fg-3">{part}</span>
                  ))}
                  {isUnread && (
                    <span className="inline-flex items-center rounded bg-accent-500/14 px-1.5 py-0.5 text-[9px] text-accent-300 ring-1 ring-accent-500/30">
                      new
                    </span>
                  )}
                </>
              );
            })()}
            {completedJobsWithReport.map((j) => {
              const r = j.report!;
              const color = r.status === 'success' ? 'bg-success' : r.status === 'failed' ? 'bg-danger' : 'bg-warning';
              return <span key={j.sessionId} className={`w-1.5 h-1.5 rounded-full ${color}`} />;
            })}
          </button>
          {resultsOpen && (
            <div className="px-3 pb-3">
              {completedJobsWithReport.length > 1 && (
                <div className="flex gap-1 mb-2 overflow-x-auto">
                  {completedJobsWithReport.map((j, idx) => {
                    const r = j.report!;
                    const active = idx === resultJobIdx;
                    const color = r.status === 'success' ? 'text-success' : r.status === 'failed' ? 'text-danger' : 'text-warning';
                    return (
                      <button
                        key={j.sessionId}
                        onClick={() => setResultJobIdx(idx)}
                        className={clsx(
                          'shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] border transition-colors',
                          active ? 'border-accent-500/50 bg-surface-3 text-fg-0' : 'border-hairline text-fg-2 hover:text-fg-0 hover:bg-surface-2'
                        )}
                      >
                        <span className={active ? color : 'text-fg-3'}>
                          {r.status === 'success' ? <CheckCircle size={9} /> : r.status === 'failed' ? <XCircle size={9} /> : <AlertCircle size={9} />}
                        </span>
                        {j.backend} · {new Date(j.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const job = completedJobsWithReport[Math.min(resultJobIdx, completedJobsWithReport.length - 1)];
                const r = job?.report;
                if (!r) return null;
                const statusColor = r.status === 'success' ? 'border-success/25 bg-success/5' : r.status === 'failed' ? 'border-danger/25 bg-danger/5' : 'border-warning/25 bg-warning/5';
                const statusIcon = r.status === 'success'
                  ? <CheckCircle size={12} className="text-success shrink-0" />
                  : r.status === 'failed'
                  ? <XCircle size={12} className="text-danger shrink-0" />
                  : <AlertCircle size={12} className="text-warning shrink-0" />;
                return (
                  <div className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] uppercase tracking-wider text-fg-3 flex items-center gap-2">
                        {job.backend} · {new Date(job.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {formatJobComplexityChoice(getJobComplexityChoice(job)) && (
                          <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[9px] text-fg-2">
                            {formatJobComplexityChoice(getJobComplexityChoice(job))}
                          </span>
                        )}
                      </div>
                      {job.endedAt && (
                        <div className="text-[10px] uppercase tracking-wider text-fg-3/80">
                          {Math.round((job.endedAt - job.startedAt) / 1000)}s
                        </div>
                      )}
                    </div>
                    <JobReportCard report={r} dense />
                    {iterationJobId === job.sessionId ? (
                      <div className="rounded-md border border-hairline bg-surface-2/60 p-2.5 space-y-2">
                        <div className="text-[11px] uppercase tracking-wider text-fg-3">Desired changes</div>
                        <textarea
                          value={iterationDraft}
                          onChange={(e) => setIterationDraft(e.target.value)}
                          className="w-full min-h-[84px] rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-0 outline-none focus:border-accent-500"
                          placeholder="Describe what to change in this new run..."
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="px-2.5 py-1 rounded text-[11px] text-fg-2 hover:text-fg-0 hover:bg-surface-3"
                            onClick={() => {
                              setIterationJobId(null);
                              setIterationDraft('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded bg-accent-500 px-3 py-1 text-[11px] text-white hover:bg-accent-600 disabled:opacity-60"
                            onClick={() => iterateReportJob(job)}
                            disabled={asyncActionState[`iterate:${job.sessionId}`] === 'running' || !iterationDraft.trim().length}
                          >
                            <Send size={12} />
                            {asyncActionState[`iterate:${job.sessionId}`] === 'running' ? 'Submitting…' : 'Submit iteration'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          className="inline-flex items-center gap-1 rounded border border-accent-500/35 px-2.5 py-1 text-[11px] text-accent-300 hover:text-fg-0 hover:border-accent-500"
                          onClick={() => {
                            setIterationJobId(job.sessionId);
                            setIterationDraft('');
                          }}
                        >
                          <RotateCcw size={12} />
                          Iterate
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      <SparkleSweep active={!!recentlyFormatted} />
    </MotionCard>
  );
}
