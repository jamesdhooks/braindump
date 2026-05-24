import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Combine, Check, Pin, Trash2, Copy, X, MousePointer2, ChevronDown, Cpu, ArrowUpDown } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';
import { nanoid } from 'nanoid';
import { JobStateBadge } from './JobStateBadge';

type JobBucket = 'running' | 'pending' | 'complete';

/**
 * Inline bulk-action controls shown in the composer action row when dumps are selected.
 */
export function SelectionBar() {
  const selected = useStore((s) => s.selectedGroupIds);
  const selectMode = useStore((s) => s.selectMode);
  const setSelectMode = useStore((s) => s.setSelectMode);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const clearSelection = useStore((s) => s.clearSelection);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setFocusedGroup = useStore((s) => s.setFocusedGroup);
  const togglePin = useStore((s) => s.togglePin);
  const completeGroup = useStore((s) => s.completeGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const addGroupLines = useStore((s) => s.addGroupLines);
  const sortGroupsByPriority = useStore((s) => s.sortGroupsByPriority);
  const showToast = useStore((s) => s.showToast);
  const clawJobs = useStore((s) => s.clawJobs);
  const unreadCompletedClawJobIds = useStore((s) => s.unreadCompletedClawJobIds);
  const markCompletedClawJobsRead = useStore((s) => s.markCompletedClawJobsRead);
  const setClawPanelOpen = useStore((s) => s.setClawPanelOpen);
  const setClawFilterGroup = useStore((s) => s.setClawFilterGroup);
  const [combining, setCombining] = useState(false);
  const [jobsMenuOpen, setJobsMenuOpen] = useState(false);
  const [jobsBucket, setJobsBucket] = useState<JobBucket | 'all'>('all');
  const jobsMenuRef = useRef<HTMLDivElement>(null);

  const allJobTargets = useMemo(
    () =>
      (clawJobs ?? [])
        .map((j) => {
      const tab = tabs.find((t) => t.id === j.tabId);
      const group = tab?.groups.find((g) => g.id === j.groupId);
      if (!tab || !group) return null;
      const context = group.lines.filter((line) => line.trim().length > 0).slice(0, 2).join(' | ') || '(empty dump)';
      const bucket: JobBucket =
        j.state === 'running'
          ? 'running'
          : j.state === 'waiting-input'
          ? 'pending'
          : 'complete';
        return {
          sessionId: j.sessionId,
          tabId: j.tabId,
          groupId: j.groupId,
          backend: j.backend,
          state: j.state,
          bucket,
          startedAt: j.startedAt,
          tabName: tab.name,
          context: context.length > 140 ? `${context.slice(0, 140)}...` : context
        };
      })
      .filter(
        (
          x
        ): x is {
          sessionId: string;
          tabId: string;
          groupId: string;
          backend: string;
          state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
          bucket: JobBucket;
          startedAt: number;
          tabName: string;
          context: string;
        } => !!x
      )
      .sort((a, b) => b.startedAt - a.startedAt),
    [clawJobs, tabs]
  );

  const runningJobTargets = useMemo(() => allJobTargets.filter((j) => j.bucket === 'running'), [allJobTargets]);
  const pendingJobTargets = useMemo(() => allJobTargets.filter((j) => j.bucket === 'pending'), [allJobTargets]);
  const completeJobTargets = useMemo(() => allJobTargets.filter((j) => j.bucket === 'complete'), [allJobTargets]);
  const unreadCompleteCount = completeJobTargets.filter((j) => unreadCompletedClawJobIds.includes(j.sessionId)).length;
  const unreadCompleteSessionIds = useMemo(
    () => completeJobTargets.filter((j) => unreadCompletedClawJobIds.includes(j.sessionId)).map((j) => j.sessionId),
    [completeJobTargets, unreadCompletedClawJobIds]
  );

  const visibleJobs =
    jobsBucket === 'all' ? allJobTargets : allJobTargets.filter((j) => j.bucket === jobsBucket);

  const hasSelection = selected.length > 0;

  // Resolve {tabId, group} for each selected id.
  const located = selected
    .map((gid) => {
      for (const t of tabs) {
        const g = t.groups.find((x) => x.id === gid);
        if (g) return { tabId: t.id, group: g };
      }
      return null;
    })
    .filter((x): x is { tabId: string; group: typeof tabs[number]['groups'][number] } => !!x);

  async function combine() {
    if (located.length < 2) {
      showToast({ message: 'Select at least 2 dumps to combine.', kind: 'error' });
      return;
    }
    setCombining(true);
    try {
      const tab = tabs.find((t) => t.id === activeTabId);
      const projectContext = tab?.projectContext;
      const activeTabGroupIndices = located
        .filter((l) => l.tabId === activeTabId)
        .map((l) => tab?.groups.findIndex((g) => g.id === l.group.id) ?? -1)
        .filter((index) => index >= 0);
      const anchorIndex = activeTabGroupIndices.length > 0 ? Math.min(...activeTabGroupIndices) : 0;
      const res = await window.braindump.skill.combineGroups({
        groups: located.map((l) => ({ lines: l.group.lines })),
        projectContext,
        mode: 'faithful'
      });
      const lines = res.ok && res.value?.combined_lines?.length
        ? res.value.combined_lines
        : located.flatMap((l) => l.group.lines);
      const newGroupId = addGroupLines(activeTabId, lines, false, 'user');
      // Annotate revision history on new group.
      useStore.setState((s) => {
        const t = s.tabs.find((x) => x.id === activeTabId);
        const g = t?.groups.find((x) => x.id === newGroupId);
        if (g) {
          g.history.unshift({
            id: nanoid(8),
            at: Date.now(),
            source: 'llm-edit',
            lines,
            diffSummary: `Combined ${located.length} dumps`
          });
        }
      });
      // Delete originals.
      for (const l of located) deleteGroup(l.tabId, l.group.id);
      useStore.setState((s) => {
        const activeTab = s.tabs.find((x) => x.id === activeTabId);
        const fromIndex = activeTab?.groups.findIndex((x) => x.id === newGroupId) ?? -1;
        if (!activeTab || fromIndex < 0) return;
        const [combinedGroup] = activeTab.groups.splice(fromIndex, 1);
        const toIndex = Math.max(0, Math.min(anchorIndex, activeTab.groups.length));
        activeTab.groups.splice(toIndex, 0, combinedGroup);
      });
      useStore.getState().persist();
      setFocusedGroup(newGroupId);
      clearSelection();
      showToast({ message: `Combined ${located.length} dumps`, kind: 'success' });
    } catch (err) {
      showToast({ message: `Combine failed: ${(err as Error).message}`, kind: 'error' });
    } finally {
      setCombining(false);
    }
  }

  function bulkComplete() {
    for (const l of located) completeGroup(l.tabId, l.group.id);
    clearSelection();
  }
  function bulkPin() {
    for (const l of located) togglePin(l.tabId, l.group.id);
    clearSelection();
  }
  function bulkDelete() {
    if (!window.confirm(`Delete ${located.length} dump(s)? You can undo from the toast.`)) return;
    for (const l of located) deleteGroup(l.tabId, l.group.id);
    clearSelection();
  }
  function bulkCopy() {
    const text = located
      .map((l, idx) => (located.length > 1 ? `--- ${idx + 1} ---\n${l.group.lines.join('\n')}` : l.group.lines.join('\n')))
      .join('\n\n');
    void navigator.clipboard.writeText(text).then(() => {
      showToast({ message: `Copied ${located.length} dump(s) as Markdown`, kind: 'success' });
    });
  }

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!jobsMenuRef.current) return;
      if (jobsMenuRef.current.contains(e.target as Node)) return;
      setJobsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function jumpToJob(sessionId: string) {
    const target = allJobTargets.find((j) => j.sessionId === sessionId);
    if (!target) return;
    if (target.bucket === 'complete') {
      markCompletedClawJobsRead([target.sessionId]);
    }
    setActiveTab(target.tabId);
    setFocusedGroup(target.groupId);
    setClawFilterGroup(target.groupId);
    setClawPanelOpen(true);
    setJobsMenuOpen(false);
  }

  function openJobsMenu(bucket: JobBucket | 'all') {
    if (jobsMenuOpen && jobsBucket === bucket) {
      setJobsMenuOpen(false);
      return;
    }
    setJobsBucket(bucket);
    setJobsMenuOpen(true);
  }

  function sortActiveTab() {
    const changed = sortGroupsByPriority(activeTabId);
    showToast({
      message: changed ? 'Sorted dumps by priority' : 'Dumps are already in priority order',
      kind: changed ? 'success' : 'info'
    });
  }

  function markAllCompleteJobsRead() {
    markCompletedClawJobsRead(unreadCompleteSessionIds);
  }

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      <div
        className={clsx(
          'inline-flex items-center gap-1 rounded-full border px-1 py-1 transition-colors',
          selectMode
            ? 'border-accent-500/35 bg-accent-500/8'
            : 'border-hairline bg-surface-1/70'
        )}
      >
        <button
          onClick={() => setSelectMode(!selectMode)}
          title={selectMode ? 'Exit select mode' : 'Enter select mode — click dumps to select'}
          className={clsx(
            'inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-full transition-colors',
            selectMode
              ? 'bg-accent-500/18 text-accent-400'
              : 'text-fg-2 hover:bg-surface-3 hover:text-fg-0'
          )}
        >
          <MousePointer2 size={13} />
          <span>Select mode</span>
        </button>
        {(selectMode || hasSelection) && (
          <>
            <span className="h-5 w-px bg-hairline/80" />
            <span className="px-1.5 text-[12px] font-medium text-fg-1">{selected.length} selected</span>
          </>
        )}
        {hasSelection && (
          <>
            <span className="h-5 w-px bg-hairline/80" />
            <BarBtn onClick={combine} disabled={combining || located.length < 2} title="Combine via LLM">
              {combining ? <Loader2 size={14} className="animate-spin" /> : <Combine size={14} />}
              <span>Combine</span>
            </BarBtn>
            <BarBtn onClick={bulkComplete} title="Mark all complete">
              <Check size={14} /> <span>Complete</span>
            </BarBtn>
            <BarBtn onClick={bulkPin} title="Pin / unpin all">
              <Pin size={14} /> <span>Pin</span>
            </BarBtn>
            <BarBtn onClick={bulkCopy} title="Copy all as Markdown">
              <Copy size={14} /> <span>Copy</span>
            </BarBtn>
            <BarBtn onClick={bulkDelete} danger title="Delete all">
              <Trash2 size={14} /> <span>Delete</span>
            </BarBtn>
          </>
        )}
      </div>
      <button
        onClick={sortActiveTab}
        title="Sort this tab: incomplete, complete, then QA passed"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-full text-fg-2 hover:bg-surface-3 hover:text-fg-0 transition-colors"
      >
        <ArrowUpDown size={13} />
        <span>Auto-sort</span>
      </button>

      {/* Code jobs status chips + dropdown */}
      {allJobTargets.length > 0 && (
        <div ref={jobsMenuRef} className="relative">
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={() => openJobsMenu('running')}
              className="inline-flex items-center transition-transform hover:-translate-y-px"
              title="Running jobs"
            >
              <JobStateBadge
                state={runningJobTargets.length > 0 ? 'running' : 'interrupted'}
                label={`running ${runningJobTargets.length}`}
              />
            </button>
            <button
              onClick={() => openJobsMenu('pending')}
              className="inline-flex items-center transition-transform hover:-translate-y-px"
              title="Pending input jobs"
            >
              <JobStateBadge state="waiting-input" label={`pending ${pendingJobTargets.length}`} />
            </button>
            <button
              onClick={() => openJobsMenu('complete')}
              className="relative inline-flex items-center transition-transform hover:-translate-y-px"
              title="Completed jobs"
            >
              <JobStateBadge state="done" label={`complete ${completeJobTargets.length}`} />
              {unreadCompleteCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-500 text-white text-[10px] leading-[18px] text-center font-semibold ring-2 ring-surface-1">
                  {unreadCompleteCount}
                </span>
              )}
            </button>
            <button
              onClick={() => openJobsMenu('all')}
              className="inline-flex items-center gap-2 px-2.5 py-1 text-[12px] rounded-full ring-1 ring-hairline text-fg-1 hover:bg-surface-3"
              title="All code jobs"
            >
              <Cpu size={13} />
              <span>jobs</span>
              <ChevronDown size={13} className={clsx('transition-transform', jobsMenuOpen && 'rotate-180')} />
            </button>
          </div>

          {jobsMenuOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(38rem,calc(100vw-2rem))] rounded-xl border border-hairline bg-surface-1/98 backdrop-blur-md p-2 shadow-[0_18px_52px_-20px_var(--accent-glow)]">
              <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                <div className="text-[11px] uppercase tracking-[0.08em] text-fg-2">
                  {jobsBucket === 'all' ? 'All code jobs' : `${jobsBucket} code jobs`}
                </div>
                {unreadCompleteCount > 0 && (
                  <button
                    onClick={markAllCompleteJobsRead}
                    className="text-[10px] uppercase tracking-[0.08em] text-accent-400 hover:text-fg-0"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-auto space-y-1">
                {visibleJobs.map((j) => {
                  const waiting = j.state === 'waiting-input';
                  const running = j.state === 'running';
                  const isUnreadComplete =
                    (j.state === 'done' || j.state === 'error' || j.state === 'interrupted') &&
                    unreadCompletedClawJobIds.includes(j.sessionId);
                  const statusText =
                    j.state === 'waiting-input'
                      ? 'Pending'
                      : j.state === 'running'
                      ? 'Running'
                      : j.state === 'done'
                      ? 'Complete'
                      : j.state === 'error'
                      ? 'Error'
                      : 'Stopped';
                  return (
                    <button
                      key={j.sessionId}
                      onClick={() => jumpToJob(j.sessionId)}
                      className="w-full text-left rounded-lg border border-hairline/60 bg-surface-2/45 hover:border-accent-500/35 hover:bg-surface-2 px-3 py-2.5 transition-colors"
                      title={`${j.backend} in ${j.tabName}`}
                    >
                      <div className="flex items-center gap-2 text-[12px]">
                        <span
                          className="shrink-0"
                        >
                          <JobStateBadge state={j.state} label={statusText} size="sm" />
                        </span>
                        <span className="text-fg-1 font-medium truncate">{j.backend}</span>
                        <span className="text-fg-2 truncate">{j.tabName}</span>
                        {isUnreadComplete && (
                          <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded bg-accent-500/14 text-accent-300 ring-1 ring-accent-500/30 text-[10px] uppercase tracking-[0.06em]">
                            new
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[12px] text-fg-1/90 truncate">{j.context}</div>
                    </button>
                  );
                })}
                {visibleJobs.length === 0 && (
                  <div className="px-3 py-4 text-[12px] text-fg-3">No jobs in this category.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function BarBtn({
  children,
  onClick,
  disabled,
  danger,
  title
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'inline-flex items-center gap-1 px-2.5 py-1 text-[12px] rounded-full transition-colors disabled:opacity-40 ' +
        (danger ? 'text-fg-1 hover:bg-red-500/15 hover:text-red-400' : 'text-fg-1 hover:bg-surface-4')
      }
    >
      {children}
    </button>
  );
}
