import { AnimatePresence, motion } from 'framer-motion';
import { X, Zap, AlertTriangle, StopCircle, Send, Maximize2, Minimize2, Copy, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { ClawJob, ClawJobArtifact, ClawJobEvent } from '../types';
import { JobReportCard, getReportCountSummary } from './JobReportCard';
import { formatJobComplexityChoice, getJobComplexityChoice, rerunJob } from './jobActions';

type Tab = 'report' | 'stream' | 'diffs' | 'files' | 'prompts' | 'skills' | 'request';

const TABS: { id: Tab; label: string }[] = [
  { id: 'report', label: 'Report' },
  { id: 'stream', label: 'Stream' },
  { id: 'diffs', label: 'Diffs' },
  { id: 'files', label: 'Files' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'skills', label: 'Skills' },
  { id: 'request', label: 'Request' }
];

const HANG_THRESHOLD_MS = 180_000;

export function JobPanel() {
  const open = useStore((s) => s.clawPanelOpen);
  const setOpen = useStore((s) => s.setClawPanelOpen);
  const filterGroupId = useStore((s) => s.clawFilterGroupId);
  const setFilter = useStore((s) => s.setClawFilterGroup);
  const jobs = useStore((s) => s.clawJobs ?? []);
  const unreadCompletedClawJobIds = useStore((s) => s.unreadCompletedClawJobIds);
  const markCompletedClawJobsRead = useStore((s) => s.markCompletedClawJobsRead);
  const showToast = useStore((s) => s.showToast);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stream');
  const [expanded, setExpanded] = useState(false);
  const [continuingJobId, setContinuingJobId] = useState<string | null>(null);
  const [iteratingJobId, setIteratingJobId] = useState<string | null>(null);
  const [iterationDraft, setIterationDraft] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const list = useMemo(
    () => (filterGroupId ? jobs.filter((j) => j.groupId === filterGroupId) : jobs),
    [jobs, filterGroupId]
  );

  const active = list.find((j) => j.sessionId === activeId) ?? list[0] ?? null;
  const activeIsHanging = active ? isJobHanging(active, nowTick) : false;
  const activeComplexityLabel = active ? formatJobComplexityChoice(getJobComplexityChoice(active)) : null;
  const activeRunnerId = active ? runnerIdForJob(active) : null;
  const canContinueActive =
    !!active &&
    !!activeRunnerId &&
    !!active.invocation?.prompt &&
    ((active.state !== 'running' && active.state !== 'waiting-input') || activeIsHanging);
  const canIterateActive =
    !!active &&
    !!active.report &&
    (active.state === 'done' || active.state === 'error' || active.state === 'interrupted');

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [open]);

  function inspectJob(sessionId: string) {
    const job = list.find((entry) => entry.sessionId === sessionId);
    if (!job) return;
    setActiveId(sessionId);
    setTab(job.report ? 'report' : 'stream');
    if (job.state === 'done' || job.state === 'error' || job.state === 'interrupted') {
      markCompletedClawJobsRead([sessionId]);
    }
  }

  useEffect(() => {
    if (!active) return;
    const hasExplicitSelection = !!activeId && list.some((job) => job.sessionId === activeId);
    if (!hasExplicitSelection) {
      setTab(active.report ? 'report' : 'stream');
    }
  }, [active, activeId, list]);

  async function continueJob(job: ClawJob) {
    const runnerId = runnerIdForJob(job);
    if (!runnerId || !job.invocation?.prompt) {
      showToast({ message: 'This job cannot be continued from the sidebar.', kind: 'error' });
      return;
    }
    setContinuingJobId(job.sessionId);
    try {
      await window.braindump.runner.run({
        runnerId,
        tabId: job.tabId,
        groupId: job.groupId,
        cwd: job.invocation.cwd,
        system: buildContinuationSystem(job),
        prompt: buildContinuationPrompt(job)
      });
      showToast({ message: `Continuing ${job.backend} job`, kind: 'success' });
    } catch (err) {
      showToast({ message: `Continue failed: ${(err as Error).message}`, kind: 'error' });
    } finally {
      setContinuingJobId(null);
    }
  }

  async function iterateJob(job: ClawJob) {
    const desiredChanges = iterationDraft.trim();
    if (!desiredChanges.length) {
      showToast({ message: 'Add desired changes before iterating', kind: 'error' });
      return;
    }
    setIteratingJobId(job.sessionId);
    try {
      await rerunJob(job, { mode: 'iterate', desiredChanges }, { upsertJob: useStore.getState().upsertClawJob });
      setIterationDraft('');
      showToast({ message: `Iterating ${job.backend} job`, kind: 'success' });
    } catch (err) {
      showToast({ message: `Iterate failed: ${(err as Error).message}`, kind: 'error' });
    } finally {
      setIteratingJobId(null);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="claw-panel"
          initial={{ x: '104%' }}
          animate={{ x: 0 }}
          exit={{ x: '104%' }}
          transition={{ type: 'tween', duration: 0.22 }}
          className={`fixed z-40 border-l border-hairline bg-surface-1 flex flex-col shadow-pop ${
            expanded ? 'inset-0 border-l-0' : 'top-8 bottom-0 right-0 w-[640px]'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-accent-400" />
              <span className="display text-[16px] text-fg-0">Code Jobs</span>
              {filterGroupId && (
                <button
                  className="text-[10px] uppercase tracking-wider text-fg-3 hover:text-fg-0 border border-hairline rounded px-1.5 py-0.5"
                  onClick={() => setFilter(null)}
                  title="Show all jobs"
                >
                  filtered · clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="p-1.5 rounded hover:bg-surface-3 text-fg-1"
                title={expanded ? 'Restore' : 'Expand fullscreen'}
              >
                {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-surface-3 text-fg-1" title="Close">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-52 border-r border-hairline overflow-y-auto py-2">
              {list.length === 0 && <div className="px-3 py-4 text-[11px] text-fg-3">No jobs yet.</div>}
              {list.map((j) => (
                <div key={j.sessionId} className="relative group">
                  {(() => {
                    const hanging = isJobHanging(j, nowTick);
                    const isUnreadTerminal =
                      (j.state === 'done' || j.state === 'error' || j.state === 'interrupted') &&
                      unreadCompletedClawJobIds.includes(j.sessionId);
                    return (
                      <>
                        <button
                          onClick={() => inspectJob(j.sessionId)}
                          className={
                            'w-full text-left px-3 py-2 border-l-2 ' +
                            (j.sessionId === (active?.sessionId ?? '')
                              ? hanging
                                ? 'border-warning bg-warning/10 text-fg-0'
                                : j.state === 'waiting-input'
                                  ? 'border-warning bg-warning/10 text-fg-0'
                                  : 'border-accent-500 bg-surface-2 text-fg-0'
                              : hanging
                                ? 'border-warning/60 bg-warning/5 text-fg-1 hover:bg-warning/10'
                                : j.state === 'waiting-input'
                                  ? 'border-warning/60 bg-warning/5 text-fg-1 hover:bg-warning/10'
                                  : 'border-transparent text-fg-2 hover:bg-surface-2')
                          }
                        >
                          {(() => {
                            const fileCount = j.artifacts.filter((a) => a.kind === 'file').length;
                            const diffCount = j.artifacts.filter((a) => a.kind === 'diff').length;
                            return (
                              <div className="flex items-center gap-1.5 mb-1">
                                {fileCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-[9px] uppercase tracking-wider text-fg-2">
                                    {fileCount} files
                                  </span>
                                )}
                                {diffCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-500/15 text-[9px] uppercase tracking-wider text-accent-300">
                                    {diffCount} diffs
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          <div className="text-[11px] uppercase tracking-wider text-fg-3">{j.backend}</div>
                          <div className="text-[12px] truncate">{j.draft.goal}</div>
                          <div className="text-[10px] text-fg-3 mt-0.5 tabular-nums">
                            {new Date(j.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {j.endedAt && (
                              <span className="text-fg-3/60">
                                {' '}· {Math.round((j.endedAt - j.startedAt) / 1000)}s
                              </span>
                            )}
                          </div>
                          <div className={'flex items-center gap-1 ' + (hanging ? 'text-warning' : stateColor(j.state)) + ' text-[10px] mt-0.5'}>
                            {(j.state === 'waiting-input' || hanging) && <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse inline-block" />}
                            {hanging ? 'hanging' : j.state}
                          </div>
                          {formatJobComplexityChoice(getJobComplexityChoice(j)) && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface-3 text-[9px] uppercase tracking-wider text-fg-2">
                                {formatJobComplexityChoice(getJobComplexityChoice(j))}
                              </span>
                            </div>
                          )}
                          {j.report && (
                            <div className="mt-2 rounded-md border border-hairline bg-surface-1/80 p-2">
                              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-3">
                                <span className={
                                  'inline-flex h-1.5 w-1.5 rounded-full ' +
                                  (j.report.status === 'success'
                                    ? 'bg-success'
                                    : j.report.status === 'failed'
                                      ? 'bg-danger'
                                      : 'bg-warning')
                                } />
                                <span>report</span>
                                {getReportCountSummary(j.report).map((part) => (
                                  <span key={part}>{part}</span>
                                ))}
                              </div>
                              <div className="mt-1 text-[11px] text-fg-1 leading-snug">
                                {j.report.summary}
                              </div>
                            </div>
                          )}
                          {isUnreadTerminal && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-accent-500/14 text-accent-300 ring-1 ring-accent-500/30 text-[9px] uppercase tracking-[0.08em]">
                                new
                              </span>
                            </div>
                          )}
                        </button>
                        {runnerIdForJob(j) && j.invocation?.prompt && ((j.state !== 'running' && j.state !== 'waiting-input') || hanging) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void continueJob(j);
                            }}
                            disabled={continuingJobId === j.sessionId}
                            className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded border border-accent-500/35 bg-surface-1/85 text-accent-400 hover:text-fg-0 hover:border-accent-500 disabled:opacity-60"
                            title={hanging ? 'Continue this hanging job' : 'Continue this job'}
                          >
                            <RotateCcw size={10} className={continuingJobId === j.sessionId ? 'animate-spin' : ''} />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
            <div className="flex-1 flex flex-col min-w-0">
              {active && (
                <>
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-hairline text-[11px]">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={
                          'px-2 py-1 rounded ' +
                          (t.id === tab ? 'bg-surface-3 text-fg-0' : 'text-fg-2 hover:text-fg-0')
                        }
                      >
                        {t.label}
                        {t.id === 'report' && active.report && (
                          <span className={`ml-1 inline-flex h-1.5 w-1.5 rounded-full ${
                            active.report.status === 'success' ? 'bg-success' : active.report.status === 'failed' ? 'bg-danger' : 'bg-warning'
                          }`} />
                        )}
                        {t.id === 'prompts' && active.pendingPrompts.length > 0 && (
                          <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] bg-accent-500 text-white rounded-full">
                            {active.pendingPrompts.length}
                          </span>
                        )}
                      </button>
                    ))}
                    {activeIsHanging && (
                      <span className="ml-1 text-[10px] uppercase tracking-wider text-warning">
                        hanging - consider continue
                      </span>
                    )}
                    {activeComplexityLabel && (
                      <span className="text-[10px] uppercase tracking-wider text-fg-3">
                        {activeComplexityLabel}
                      </span>
                    )}
                    {active.state === 'running' && (
                      <button
                        onClick={() => void window.braindump.claw.interrupt(active.sessionId)}
                        className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-danger/15 ring-1 ring-danger/40 text-[10px] uppercase tracking-wider text-danger hover:text-fg-0 hover:bg-danger/20"
                        title="Interrupt session"
                      >
                        <StopCircle size={12} /> stop
                      </button>
                    )}
                    {canContinueActive && (
                      <button
                        onClick={() => void continueJob(active)}
                        disabled={continuingJobId === active.sessionId}
                        className={(active.state === 'running' ? '' : 'ml-auto ') + 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent-500/18 ring-1 ring-accent-500/35 text-[10px] uppercase tracking-wider text-accent-300 hover:text-fg-0 hover:bg-accent-500/24 disabled:opacity-60'}
                        title={activeIsHanging ? 'Continue this hanging job using prior context and original requirements' : 'Continue this job with prior context and original requirements'}
                      >
                        <RotateCcw size={12} /> {continuingJobId === active.sessionId ? 'continuing…' : 'continue'}
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    {tab === 'report' && (
                      <ReportView
                        job={active}
                        canIterate={canIterateActive}
                        iterationDraft={iterationDraft}
                        onIterationDraftChange={setIterationDraft}
                        iterating={iteratingJobId === active.sessionId}
                        onStartIterate={() => void iterateJob(active)}
                      />
                    )}
                    {tab === 'stream' && <StreamView job={active} />}
                    {tab === 'diffs' && <ArtifactView job={active} kinds={['diff']} />}
                    {tab === 'files' && <ArtifactView job={active} kinds={['file']} />}
                    {tab === 'prompts' && <PromptView job={active} />}
                    {tab === 'skills' && <SkillsView job={active} />}
                    {tab === 'request' && <RequestView job={active} />}
                  </div>
                </>
              )}
              {!active && <div className="flex-1 flex items-center justify-center text-fg-3 text-sm">Select a job.</div>}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function stateColor(s: string): string {
  if (s === 'running') return 'text-accent-400';
  if (s === 'waiting-input') return 'text-warning';
  if (s === 'error') return 'text-danger';
  if (s === 'done') return 'text-success';
  return 'text-fg-3';
}

function jobLastActivityAt(job: ClawJob): number {
  const lastEventAt = job.events.reduce((latest, e) => Math.max(latest, e.at), job.startedAt);
  return Math.max(lastEventAt, job.startedAt);
}

function isJobHanging(job: ClawJob, now = Date.now()): boolean {
  if (job.state !== 'running') return false;
  return now - jobLastActivityAt(job) > HANG_THRESHOLD_MS;
}

function runnerIdForJob(job: ClawJob): 'claude-cli' | 'copilot-cli' | null {
  if (job.invocation?.runnerId === 'claude-cli' || job.invocation?.runnerId === 'copilot-cli') {
    return job.invocation.runnerId;
  }
  if (job.backend === 'Claude Code') return 'claude-cli';
  if (job.backend === 'GitHub Copilot') return 'copilot-cli';
  return null;
}

function buildContinuationSystem(job: ClawJob): string {
  const base = job.invocation?.system?.trim();
  const resumeInstruction = [
    'You are resuming a previously interrupted coding run in the same repository.',
    'Continue execution directly. Do not ask prioritization questions.',
    'Preserve completed work and only extend or fix what is still pending.'
  ].join(' ');
  return base ? `${base}\n\n${resumeInstruction}` : resumeInstruction;
}

function buildContinuationPrompt(job: ClawJob): string {
  const original = job.invocation?.prompt?.trim() ?? '';
  const summary = job.summary?.trim() ?? '';
  const recentLines = job.events
    .slice(-24)
    .map((e) => describeEvent(e))
    .filter((line) => line.trim().length > 0);
  const recentContext = recentLines.join('\n').slice(0, 2200);
  const artifactLines = job.artifacts
    .slice(-12)
    .map((a) => {
      const target = a.path ?? a.title ?? a.id;
      const action = a.action ? ` (${a.action})` : '';
      return `${a.kind}: ${target}${action}`;
    })
    .join('\n')
    .slice(0, 900);

  const sections = [
    'Resume the same task from the prior attempt.',
    'Original requirements (repeat and fully satisfy):',
    original,
    summary ? `Previous run summary:\n${summary}` : '',
    recentContext ? `Recent run context (truncated):\n${recentContext}` : '',
    artifactLines ? `Recent artifacts (truncated):\n${artifactLines}` : '',
    'Continue from where the run stopped. Avoid redoing finished changes unless required for correctness.'
  ].filter(Boolean);

  return sections.join('\n\n');
}

function ReportView({
  job,
  canIterate,
  iterationDraft,
  onIterationDraftChange,
  iterating,
  onStartIterate
}: {
  job: ClawJob;
  canIterate: boolean;
  iterationDraft: string;
  onIterationDraftChange: (value: string) => void;
  iterating: boolean;
  onStartIterate: () => void;
}) {
  const r = job.report;
  if (!r) {
    if (job.state === 'running' || job.state === 'waiting-input') {
      return <div className="text-fg-3 text-sm">Report will appear when the job finishes.</div>;
    }
    return <div className="text-fg-3 text-sm">No structured report was produced by this job.</div>;
  }
  return (
    <div className="space-y-2">
      <JobReportCard report={r} />
      {canIterate && (
        <div className="rounded-md border border-hairline bg-surface-2/55 p-2.5">
          <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-1.5">Iterate</div>
          <textarea
            value={iterationDraft}
            onChange={(e) => onIterationDraftChange(e.target.value)}
            className="w-full min-h-[92px] rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-0 outline-none focus:border-accent-500"
            placeholder="Describe the changes you want in the next run..."
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={onStartIterate}
              disabled={iterating || !iterationDraft.trim().length}
              className="inline-flex items-center gap-1.5 rounded bg-accent-500 px-3 py-1.5 text-[11px] text-white hover:bg-accent-600 disabled:opacity-60"
            >
              <RotateCcw size={12} />
              {iterating ? 'Submitting…' : 'Submit iteration'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StreamView({ job }: { job: ClawJob }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [job.events.length]);

  return (
    <div className="space-y-0.5 text-[12px] font-mono leading-[1.45] select-text cursor-text">
      {job.events.map((e, i) => (
        <div key={i} className={'flex gap-2 min-w-0 ' + eventColor(e)}>
          <span className="text-fg-3/50 shrink-0 tabular-nums select-none">
            {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="min-w-0 break-all">{describeEvent(e)}</span>
        </div>
      ))}
      {job.summary && (
        <div className="pt-2 text-fg-0 font-sans text-sm border-t border-hairline mt-2">
          {job.summary}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function eventColor(e: ClawJobEvent): string {
  switch (e.kind) {
    case 'thinking':
      return 'text-fg-1';
    case 'log':
      return e.level === 'error' ? 'text-danger' : e.level === 'warn' ? 'text-warning' : 'text-fg-2';
    case 'tool-call':
      return 'text-accent-400';
    case 'tool-result':
      return e.ok ? 'text-success' : 'text-danger';
    case 'prompt':
      return 'text-warning';
    case 'user-reply':
      return 'text-accent-400';
    case 'status':
      return 'text-fg-3';
    case 'safety-block':
      return 'text-danger';
  }
}

function describeEvent(e: ClawJobEvent): string {
  switch (e.kind) {
    case 'thinking':
      return e.text;
    case 'log':
      // Raw terminal output: info lines are undecorated; warn/error get a level prefix
      return e.level === 'info' ? e.text : `[${e.level}] ${e.text}`;
    case 'tool-call':
      return `→ ${e.tool}(${Object.keys(e.args).join(', ')})`;
    case 'tool-result':
      return `← ${e.ok ? 'ok' : 'err'}${e.text ? ': ' + e.text.slice(0, 140) : ''}`;
    case 'prompt':
      return `? ${e.question}`;
    case 'user-reply':
      return `> ${e.text}`;
    case 'status':
      return `── ${e.state}${typeof e.progress === 'number' ? ` ${Math.round(e.progress * 100)}%` : ''} ──`;
    case 'safety-block':
      return `BLOCKED — ${e.reason}`;
  }
}

function ArtifactView({ job, kinds }: { job: ClawJob; kinds: ClawJobArtifact['kind'][] }) {
  const subset = job.artifacts.filter((a) => kinds.includes(a.kind));
  if (subset.length === 0) return <div className="text-fg-3 text-sm">No {kinds.join(' / ')} artifacts yet.</div>;
  return (
    <div className="space-y-3">
      {subset.map((a) => (
        <div key={a.id} className="border border-hairline rounded-lg p-3 bg-surface-2">
          <div className="text-[11px] uppercase tracking-wider text-fg-3">
            {a.kind} {a.path ? `· ${a.path}` : ''} {a.action ? `· ${a.action}` : ''}
          </div>
          {a.title && <div className="text-sm text-fg-0 mt-1">{a.title}</div>}
          {a.text && <div className="whitespace-pre-wrap text-[12px] text-fg-1 mt-1 font-mono select-text cursor-text">{a.text}</div>}
          {a.unifiedDiff && (
            <pre className="whitespace-pre-wrap text-[12px] text-fg-1 mt-1 font-mono overflow-x-auto select-text cursor-text">{a.unifiedDiff}</pre>
          )}
          {a.url && (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-accent-400 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                void window.braindump.app.openExternal(a.url!);
              }}
            >
              {a.url}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function PromptView({ job }: { job: ClawJob }) {
  const resolveClawPrompt = useStore((s) => s.resolveClawPrompt);
  const appendClawEvent = useStore((s) => s.appendClawEvent);
  const [draftByPromptId, setDraftByPromptId] = useState<Record<string, string>>({});

  async function reply(promptId: string, text: string) {
    await window.braindump.claw.reply(job.sessionId, promptId, text);
    appendClawEvent(job.sessionId, { at: Date.now(), kind: 'user-reply', promptId, text });
    resolveClawPrompt(job.sessionId, promptId);
  }

  if (job.pendingPrompts.length === 0) return <div className="text-fg-3 text-sm">No pending prompts.</div>;
  return (
    <div className="space-y-3">
      {job.pendingPrompts.map((p) => (
        <div key={p.promptId} className="border border-hairline rounded-lg p-3 bg-surface-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-warning">
            <AlertTriangle size={11} /> prompt
          </div>
          <div className="text-sm text-fg-0 mt-1">{p.question}</div>
          {p.options && p.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {p.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => void reply(p.promptId, opt)}
                  className="px-2 py-1 rounded bg-surface-3 text-[12px] text-fg-1 hover:text-fg-0"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <input
              value={draftByPromptId[p.promptId] ?? ''}
              onChange={(e) => setDraftByPromptId({ ...draftByPromptId, [p.promptId]: e.target.value })}
              placeholder="Type a reply…"
              className="flex-1 bg-surface-3 border border-hairline focus:border-accent-500 rounded px-2 py-1 text-[13px] text-fg-0 outline-none"
            />
            <button
              onClick={() => {
                const text = draftByPromptId[p.promptId];
                if (text && text.trim()) void reply(p.promptId, text.trim());
              }}
              className="p-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white"
              title="Send reply"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsView({ job }: { job: ClawJob }) {
  if (job.skills.length === 0) return <div className="text-fg-3 text-sm">No app-level skills applied.</div>;
  return (
    <div className="space-y-1.5 text-[12px] text-fg-1">
      {job.skills.map((s) => (
        <div key={s} className="px-2 py-1.5 rounded bg-surface-2 border border-hairline font-mono select-text cursor-text">
          {s}
        </div>
      ))}
    </div>
  );
}

function RequestView({ job }: { job: ClawJob }) {
  const inv = job.invocation;

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
  }

  if (!inv) {
    return <div className="text-fg-3 text-sm">No invocation data recorded for this job.</div>;
  }

  return (
    <div className="space-y-4 text-[12px]">
      {/* Command line */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wider text-fg-3">Command</div>
          <button
            onClick={() => copyText([inv.binary, ...inv.args].join(' '))}
            className="flex items-center gap-1 text-[10px] text-fg-3 hover:text-fg-0"
            title="Copy command"
          >
            <Copy size={10} /> copy
          </button>
        </div>
        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-fg-1 bg-surface-0 border border-hairline rounded p-2.5 select-text cursor-text">
          {inv.binary}{inv.args.length > 0 ? ' ' + inv.args.join(' ') : ''}
        </pre>
      </section>

      {/* CWD */}
      {inv.cwd && (
        <section>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wider text-fg-3">Working Directory</div>
            <button onClick={() => copyText(inv.cwd!)} className="flex items-center gap-1 text-[10px] text-fg-3 hover:text-fg-0" title="Copy path">
              <Copy size={10} /> copy
            </button>
          </div>
          <div className="font-mono text-[11px] text-fg-1 bg-surface-0 border border-hairline rounded px-2.5 py-1.5 select-text cursor-text break-all">
            {inv.cwd}
          </div>
        </section>
      )}

      {/* System prompt */}
      {inv.system && (
        <section>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] uppercase tracking-wider text-fg-3">System Prompt</div>
            <button onClick={() => copyText(inv.system!)} className="flex items-center gap-1 text-[10px] text-fg-3 hover:text-fg-0" title="Copy system prompt">
              <Copy size={10} /> copy
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-fg-1 bg-surface-0 border border-hairline rounded p-2.5 select-text cursor-text">
            {inv.system}
          </pre>
        </section>
      )}

      {/* User prompt / message */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] uppercase tracking-wider text-fg-3">Prompt Sent</div>
          <button onClick={() => copyText(inv.prompt)} className="flex items-center gap-1 text-[10px] text-fg-3 hover:text-fg-0" title="Copy prompt">
            <Copy size={10} /> copy
          </button>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-[12px] text-fg-0 bg-surface-0 border border-hairline rounded p-2.5 select-text cursor-text leading-relaxed">
          {inv.prompt}
        </pre>
      </section>
    </div>
  );
}
