import { useEffect, useState } from 'react';
import { X, Sparkles, Send } from 'lucide-react';
import { useStore } from '../store';
import type { ClawDraft, ClawJob, TaskComplexity } from '../types';
import { REPORT_SYSTEM_INSTRUCTION } from './parseJobReport';

type Props = {
  tabId: string;
  groupId: string;
  complexity?: TaskComplexity;
  onClose: () => void;
};

function emptyDraft(): ClawDraft {
  return { goal: '', constraints: [], acceptance_criteria: [], artifacts_to_produce: [], safety_notes: [] };
}

export function ClawDraftDialog({ tabId, groupId, complexity, onClose }: Props) {
  const tab = useStore((s) => s.tabs.find((t) => t.id === tabId));
  const group = tab?.groups.find((g) => g.id === groupId);
  const claw = useStore((s) => s.claw);
  const upsertJob = useStore((s) => s.upsertClawJob);
  const setPanelOpen = useStore((s) => s.setClawPanelOpen);
  const setFilter = useStore((s) => s.setClawFilterGroup);
  const brokerState = useStore((s) => s.clawBrokerState);

  const [draft, setDraft] = useState<ClawDraft>(emptyDraft());
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    setDrafting(true);
    (async () => {
      try {
        const res = await window.braindump.claw.draft({
          groupLines: group.lines,
          tabName: tab?.name ?? '',
          projectContext: tab?.projectContext,
          appSkills: brokerState.skills
        });
        if (cancelled) return;
        if (res.ok && res.value) {
          setDraft({
            goal: res.value.goal,
            constraints: res.value.constraints ?? [],
            acceptance_criteria: res.value.acceptance_criteria ?? [],
            artifacts_to_produce: res.value.artifacts_to_produce ?? [],
            safety_notes: res.value.safety_notes ?? []
          });
        } else {
          setDraft({
            goal: group.lines[0] ?? 'Do what the note describes.',
            constraints: [],
            acceptance_criteria: [],
            artifacts_to_produce: [],
            safety_notes: []
          });
        }
      } finally {
        if (!cancelled) setDrafting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group?.id, tab?.name, tab?.projectContext, brokerState.skills, group]);

  async function submit() {
    if (!group) return;
    const backend = claw?.defaultBackend ?? 'claude-code';
    const system = [
      'You are an autonomous coding assistant working on a real codebase.',
      'Tech stack: Electron + React + TypeScript + Vite + Tailwind CSS.',
      'Renderer code is in src/, main process in electron/, shared packages in packages/.',
      'Implement the requested changes by directly reading and editing the relevant files.',
      'Do NOT ask clarifying questions — explore the codebase with your tools, make the best decision, and proceed.',
      complexity ? `Requested complexity: ${complexity}.` : null,
      tab?.name ? `Project: ${tab.name}` : null,
      tab?.projectPath ? `Working directory: ${tab.projectPath}` : null,
      tab?.projectContext ? `Context: ${tab.projectContext}` : null,
      REPORT_SYSTEM_INSTRUCTION,
    ]
      .filter(Boolean)
      .join('\n');
    const { sessionId } = await window.braindump.claw.startSession({
      tabId,
      groupId,
      backend,
      cwd: tab?.projectPath ?? '',
      skills: brokerState.skills,
      system
    });
    const payload = [
      complexity ? `TASK_COMPLEXITY: ${complexity}` : '',
      `GOAL: ${draft.goal}`,
      draft.constraints.length ? `CONSTRAINTS:\n- ${draft.constraints.join('\n- ')}` : '',
      draft.acceptance_criteria.length ? `ACCEPTANCE:\n- ${draft.acceptance_criteria.join('\n- ')}` : '',
      draft.artifacts_to_produce.length ? `ARTIFACTS:\n- ${draft.artifacts_to_produce.join('\n- ')}` : '',
      draft.safety_notes.length ? `SAFETY:\n- ${draft.safety_notes.join('\n- ')}` : '',
      `SOURCE GROUP:\n${group.lines.join('\n')}`
    ]
      .filter(Boolean)
      .join('\n\n');
    const job: ClawJob = {
      sessionId,
      tabId,
      groupId,
      startedAt: Date.now(),
      backend,
      state: 'running',
      draft,
      skills: brokerState.skills,
      events: [],
      artifacts: [],
      pendingPrompts: [],
      invocation: {
        executionType: 'claw',
        binary: backend,
        args: [],
        complexity: complexity ?? 'complex',
        complexitySource: complexity ? 'manual' : 'automatic',
        prompt: payload,
        system: system || undefined,
        cwd: tab?.projectPath || undefined
      }
    };
    upsertJob(job);

    await window.braindump.claw.message(sessionId, payload);

    setFilter(groupId);
    setPanelOpen(true);
    onClose();
  }

  function editList(key: keyof ClawDraft, value: string) {
    if (key === 'goal') {
      setDraft({ ...draft, goal: value });
      return;
    }
    const lines = value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    setDraft({ ...draft, [key]: lines });
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-surface-1 border border-hairline rounded-xl w-full max-w-2xl flex flex-col shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent-400" />
            <span className="display text-[17px] text-fg-0">Run with Claw</span>
          </div>
          <button onClick={onClose} className="text-fg-2 hover:text-fg-0 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-1">Goal</div>
            <input
              value={draft.goal}
              onChange={(e) => editList('goal', e.target.value)}
              placeholder={drafting ? 'Drafting…' : 'One sentence of intent.'}
              className="w-full bg-surface-2 border border-hairline focus:border-accent-500 rounded px-3 py-2 text-fg-0 outline-none"
            />
          </div>
          {(['constraints', 'acceptance_criteria', 'artifacts_to_produce', 'safety_notes'] as const).map((k) => (
            <div key={k}>
              <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-1">
                {k.replace(/_/g, ' ')}
              </div>
              <textarea
                value={draft[k].join('\n')}
                onChange={(e) => editList(k, e.target.value)}
                rows={3}
                placeholder="One item per line"
                className="w-full bg-surface-2 border border-hairline focus:border-accent-500 rounded px-3 py-2 text-fg-0 outline-none"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-hairline bg-surface-1">
          <div className="text-[11px] text-fg-3">
            Backend: {claw?.defaultBackend ?? 'claude-code'} · Broker: {brokerState.status}
            {complexity ? ` · Complexity: ${complexity}` : ''}
          </div>
          <button
            disabled={brokerState.status !== 'connected' || drafting || !draft.goal.trim()}
            onClick={() => void submit()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm disabled:opacity-40"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
