import { AnimatePresence, motion } from 'framer-motion';
import { X, Zap, AlertTriangle, StopCircle, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { ClawJob, ClawJobArtifact, ClawJobEvent } from '../types';

type Tab = 'stream' | 'diffs' | 'files' | 'prompts' | 'skills';

const TABS: { id: Tab; label: string }[] = [
  { id: 'stream', label: 'Stream' },
  { id: 'diffs', label: 'Diffs' },
  { id: 'files', label: 'Files' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'skills', label: 'Skills' }
];

export function JobPanel() {
  const open = useStore((s) => s.clawPanelOpen);
  const setOpen = useStore((s) => s.setClawPanelOpen);
  const filterGroupId = useStore((s) => s.clawFilterGroupId);
  const setFilter = useStore((s) => s.setClawFilterGroup);
  const jobs = useStore((s) => s.clawJobs ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('stream');

  const list = useMemo(
    () => (filterGroupId ? jobs.filter((j) => j.groupId === filterGroupId) : jobs),
    [jobs, filterGroupId]
  );

  const active = list.find((j) => j.sessionId === activeId) ?? list[0] ?? null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="claw-panel"
          initial={{ x: '104%' }}
          animate={{ x: 0 }}
          exit={{ x: '104%' }}
          transition={{ type: 'tween', duration: 0.22 }}
          className="fixed top-8 bottom-0 right-0 w-[520px] z-40 border-l border-hairline bg-surface-1 flex flex-col shadow-pop"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-accent-400" />
              <span className="display text-[16px] text-fg-0">Claw jobs</span>
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
            <button onClick={() => setOpen(false)} className="p-1.5 rounded hover:bg-surface-3 text-fg-1">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-40 border-r border-hairline overflow-y-auto py-2">
              {list.length === 0 && <div className="px-3 py-4 text-[11px] text-fg-3">No jobs yet.</div>}
              {list.map((j) => (
                <button
                  key={j.sessionId}
                  onClick={() => setActiveId(j.sessionId)}
                  className={
                    'w-full text-left px-3 py-2 border-l-2 ' +
                    (j.sessionId === (active?.sessionId ?? '')
                      ? 'border-accent-500 bg-surface-2 text-fg-0'
                      : 'border-transparent text-fg-2 hover:bg-surface-2')
                  }
                >
                  <div className="text-[11px] uppercase tracking-wider text-fg-3">{j.backend}</div>
                  <div className="text-[12px] truncate">{j.draft.goal}</div>
                  <div className={stateColor(j.state) + ' text-[10px] mt-0.5'}>{j.state}</div>
                </button>
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
                        {t.id === 'prompts' && active.pendingPrompts.length > 0 && (
                          <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-[9px] bg-accent-500 text-white rounded-full">
                            {active.pendingPrompts.length}
                          </span>
                        )}
                      </button>
                    ))}
                    {active.state === 'running' && (
                      <button
                        onClick={() => void window.braindump.claw.interrupt(active.sessionId)}
                        className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-danger hover:text-fg-0"
                        title="Interrupt session"
                      >
                        <StopCircle size={11} /> stop
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-3">
                    {tab === 'stream' && <StreamView job={active} />}
                    {tab === 'diffs' && <ArtifactView job={active} kinds={['diff']} />}
                    {tab === 'files' && <ArtifactView job={active} kinds={['file']} />}
                    {tab === 'prompts' && <PromptView job={active} />}
                    {tab === 'skills' && <SkillsView job={active} />}
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

function StreamView({ job }: { job: ClawJob }) {
  return (
    <div className="space-y-1.5 text-[12px] font-mono leading-snug">
      {job.events.map((e, i) => (
        <div key={i} className={eventColor(e)}>
          <span className="text-fg-3">{new Date(e.at).toLocaleTimeString()} </span>
          {describeEvent(e)}
        </div>
      ))}
      {job.summary && <div className="pt-2 text-fg-0 font-sans text-sm border-t border-hairline mt-2">{job.summary}</div>}
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
      return `[${e.level}] ${e.text}`;
    case 'tool-call':
      return `→ ${e.tool}(${Object.keys(e.args).join(', ')})`;
    case 'tool-result':
      return `← ${e.ok ? 'ok' : 'err'}${e.text ? ': ' + e.text.slice(0, 140) : ''}`;
    case 'prompt':
      return `? ${e.question}`;
    case 'user-reply':
      return `> ${e.text}`;
    case 'status':
      return `status: ${e.state}${typeof e.progress === 'number' ? ` (${Math.round(e.progress * 100)}%)` : ''}`;
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
          {a.text && <div className="whitespace-pre-wrap text-[12px] text-fg-1 mt-1 font-mono">{a.text}</div>}
          {a.unifiedDiff && (
            <pre className="whitespace-pre-wrap text-[12px] text-fg-1 mt-1 font-mono overflow-x-auto">{a.unifiedDiff}</pre>
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
        <div key={s} className="px-2 py-1.5 rounded bg-surface-2 border border-hairline font-mono">
          {s}
        </div>
      ))}
    </div>
  );
}
