import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Pencil, Play, Sparkles, TerminalSquare, Trash2, WandSparkles } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../store';
import type { AppSkill, ClawJob } from '../types';

type CreateExecutorMode = 'auto' | 'claw' | 'raw';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'skill';
}

function skillGroupId(skillId: string) {
  return `skill:${skillId}`;
}

function summarizeExecutor(skill: AppSkill) {
  if (skill.executor.kind === 'claw') {
    return `Open Claw${skill.executor.backend ? ` · ${skill.executor.backend}` : ''}`;
  }
  return `${skill.executor.elevated ? 'Admin ' : ''}${skill.executor.shell === 'powershell' ? 'PowerShell' : 'Command Prompt'}`;
}

function summarizeLiveEvent(job: ClawJob | undefined): string | null {
  if (!job) return null;
  for (let index = job.events.length - 1; index >= 0; index -= 1) {
    const event = job.events[index];
    switch (event.kind) {
      case 'log':
        return event.text;
      case 'thinking':
        return event.text;
      case 'status':
        return typeof event.progress === 'number'
          ? `Status: ${event.state} (${Math.round(event.progress)}%)`
          : `Status: ${event.state}`;
      case 'prompt':
        return `Waiting: ${event.question}`;
      case 'tool-call':
        return `Tool: ${event.tool}`;
      case 'tool-result':
        return event.ok ? 'Tool result: success' : 'Tool result: failed';
      case 'safety-block':
        return `Safety block: ${event.reason}`;
      case 'user-reply':
        return `Reply sent: ${event.text}`;
      default:
        break;
    }
  }
  return null;
}

export function SkillsWorkspace() {
  const skills = useStore((s) => s.skills ?? []);
  const activeTabId = useStore((s) => s.activeTabId);
  const tabs = useStore((s) => s.tabs);
  const clawBackends = useStore((s) => s.clawBrokerState.backends);
  const defaultClawBackend = useStore((s) => s.claw?.defaultBackend ?? 'claude-code');
  const upsertSkill = useStore((s) => s.upsertSkill);
  const deleteSkill = useStore((s) => s.deleteSkill);
  const showToast = useStore((s) => s.showToast);
  const upsertClawJob = useStore((s) => s.upsertClawJob);
  const updateClawJob = useStore((s) => s.updateClawJob);
  const appendClawEvent = useStore((s) => s.appendClawEvent);
  const clawJobs = useStore((s) => s.clawJobs ?? []);
  const setClawFilterGroup = useStore((s) => s.setClawFilterGroup);
  const setClawPanelOpen = useStore((s) => s.setClawPanelOpen);

  const [request, setRequest] = useState('');
  const [generating, setGenerating] = useState(false);
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [confirmRunSkill, setConfirmRunSkill] = useState<AppSkill | null>(null);
  const [confirmDeleteSkill, setConfirmDeleteSkill] = useState<AppSkill | null>(null);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [createExecutorMode, setCreateExecutorMode] = useState<CreateExecutorMode>('auto');
  const [createClawBackend, setCreateClawBackend] = useState('default');
  const [createRawShell, setCreateRawShell] = useState<'powershell' | 'cmd'>('powershell');
  const [createRawElevated, setCreateRawElevated] = useState(false);
  const [createRawCommand, setCreateRawCommand] = useState('');
  const [editingSkill, setEditingSkill] = useState<AppSkill | null>(null);
  const [editDraft, setEditDraft] = useState<AppSkill | null>(null);
  const clawPollersRef = useRef<Record<string, number>>({});
  const clawPollDebugRef = useRef<Record<string, { lastEventCount: number; stagnantTicks: number; warned: boolean }>>({});

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(clawPollersRef.current)) {
        window.clearInterval(timerId);
      }
      clawPollersRef.current = {};
    };
  }, []);

  function stopClawSessionPolling(sessionId: string) {
    const timerId = clawPollersRef.current[sessionId];
    if (!timerId) return;
    window.clearInterval(timerId);
    delete clawPollersRef.current[sessionId];
    delete clawPollDebugRef.current[sessionId];
  }

  function startClawSessionPolling(sessionId: string) {
    if (clawPollersRef.current[sessionId]) return;

    const tick = async () => {
      try {
        const sessions = await window.braindump.claw.recoverSessions();
        const snapshot = sessions.find((entry) => entry.sessionId === sessionId);
        if (!snapshot) return;

        const debug =
          clawPollDebugRef.current[sessionId] ??
          (clawPollDebugRef.current[sessionId] = {
            lastEventCount: snapshot.events.length,
            stagnantTicks: 0,
            warned: false
          });

        if (snapshot.state === 'running' || snapshot.state === 'waiting-input') {
          if (snapshot.events.length > debug.lastEventCount) {
            debug.stagnantTicks = 0;
            debug.warned = false;
          } else {
            debug.stagnantTicks += 1;
          }
          if (debug.stagnantTicks >= 8 && !debug.warned) {
            appendClawEvent(sessionId, {
              at: Date.now(),
              kind: 'log',
              level: 'warn',
              text: 'No new stream events for about 10s. Backend may be waiting or stalled. Open Claw logs for details.'
            });
            debug.warned = true;
          }
        }
        debug.lastEventCount = snapshot.events.length;

        updateClawJob(sessionId, {
          state: snapshot.state,
          endedAt: snapshot.endedAt,
          summary: snapshot.summary,
          metrics: snapshot.metrics,
          events: snapshot.events,
          artifacts: snapshot.artifacts,
          pendingPrompts: snapshot.pendingPrompts
        });

        if (snapshot.state === 'done' || snapshot.state === 'error') {
          stopClawSessionPolling(sessionId);
        }
      } catch {
        // best-effort fallback; ignore transient poll failures
      }
    };

    const timerId = window.setInterval(() => {
      void tick();
    }, 1200);
    clawPollersRef.current[sessionId] = timerId;
    void tick();
  }

  function applyCreationOverrides(baseSkill: AppSkill): AppSkill {
    if (createExecutorMode === 'auto') {
      return baseSkill;
    }

    if (createExecutorMode === 'claw') {
      const backend = createClawBackend === 'default' ? undefined : createClawBackend.trim() || undefined;
      if (baseSkill.executor.kind === 'claw') {
        return {
          ...baseSkill,
          executor: {
            ...baseSkill.executor,
            backend
          }
        };
      }

      const skillSlug = slugify(baseSkill.title || baseSkill.request || baseSkill.id);
      return {
        ...baseSkill,
        executor: {
          kind: 'claw',
          backend,
          skillId: `app-${skillSlug}`,
          skillFileName: `${skillSlug}.md`,
          skillInstructions: `Carry out the "${baseSkill.title}" skill carefully and report what happened.`,
          prompt: baseSkill.request.trim() || `Run the "${baseSkill.title}" skill now.`,
          cwdMode: 'active-tab-project-or-repo'
        }
      };
    }

    const commandFallback = baseSkill.request.trim() || 'Write-Host "No command configured."';
    if (baseSkill.executor.kind === 'raw') {
      return {
        ...baseSkill,
        executor: {
          ...baseSkill.executor,
          shell: createRawShell,
          elevated: createRawElevated,
          command: createRawCommand.trim() || baseSkill.executor.command
        }
      };
    }

    return {
      ...baseSkill,
      executor: {
        kind: 'raw',
        shell: createRawShell,
        elevated: createRawElevated,
        command: createRawCommand.trim() || commandFallback,
        cwdMode: 'repo'
      }
    };
  }

  function beginEditSkill(skill: AppSkill) {
    setEditingSkill(skill);
    setEditDraft(structuredClone(skill));
  }

  function updateEditClawExecutor(
    patch: Partial<Extract<AppSkill['executor'], { kind: 'claw' }>>
  ) {
    setEditDraft((current) => {
      if (!current || current.executor.kind !== 'claw') return current;
      return {
        ...current,
        executor: {
          ...current.executor,
          ...patch
        }
      };
    });
  }

  function updateEditRawExecutor(
    patch: Partial<Extract<AppSkill['executor'], { kind: 'raw' }>>
  ) {
    setEditDraft((current) => {
      if (!current || current.executor.kind !== 'raw') return current;
      return {
        ...current,
        executor: {
          ...current.executor,
          ...patch
        }
      };
    });
  }

  function saveEditSkill() {
    if (!editDraft) return;
    const now = Date.now();
    const normalized: AppSkill = {
      ...editDraft,
      title: editDraft.title.trim() || 'Untitled Skill',
      description: editDraft.description.trim() || 'Execute a saved Braindump skill.',
      request: editDraft.request.trim() || editDraft.title,
      updatedAt: now
    };
    upsertSkill(normalized);
    setEditingSkill(null);
    setEditDraft(null);
    showToast({ message: `Updated skill: ${normalized.title}`, kind: 'success' });
  }

  const jobsBySkill = useMemo(() => {
    const bySkill = new Map<string, ClawJob[]>();
    for (const job of clawJobs) {
      const candidateSkillIds = new Set<string>();
      if (job.skillId) candidateSkillIds.add(job.skillId);
      if (job.groupId.startsWith('skill:')) {
        const fromGroup = job.groupId.slice('skill:'.length);
        if (fromGroup) candidateSkillIds.add(fromGroup);
      }
      for (const skillId of candidateSkillIds) {
        const list = bySkill.get(skillId) ?? [];
        if (!list.some((entry) => entry.sessionId === job.sessionId)) {
          list.push(job);
        }
        bySkill.set(skillId, list);
      }
    }
    for (const list of bySkill.values()) {
      list.sort((a, b) => b.startedAt - a.startedAt);
    }
    return bySkill;
  }, [clawJobs]);

  async function generateSkill() {
    const trimmed = request.trim();
    if (!trimmed.length) {
      showToast({ message: 'Describe the skill first', kind: 'error' });
      return;
    }
    setGenerating(true);
    try {
      const result = await window.braindump.appSkills.generate({ request: trimmed, tabId: activeTabId });
      if (!result.ok) {
        showToast({ message: `Generate failed: ${result.error}`, kind: 'error' });
        return;
      }
      const configuredSkill = applyCreationOverrides(result.skill);
      upsertSkill(configuredSkill);
      setRequest('');
      showToast({ message: `Created skill: ${configuredSkill.title}`, kind: 'success' });
    } catch (error) {
      showToast({ message: `Generate failed: ${(error as Error).message}`, kind: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  async function runSkill(skill: AppSkill) {
    setRunningSkillId(skill.id);
    showToast({ message: `Launching skill: ${skill.title}`, kind: 'info' });
    const sessionId = crypto.randomUUID();
    const groupId = skillGroupId(skill.id);
    const startedAt = Date.now();
    const { executor } = skill;
    const clawLiveRun = executor.kind === 'claw';
    if (executor.kind === 'claw') {
      upsertClawJob({
        sessionId,
        tabId: activeTabId,
        groupId,
        startedAt,
        backend: executor.backend?.trim() || defaultClawBackend,
        state: 'running',
        draft: {
          goal: `Skill: ${skill.title}`,
          constraints: [],
          acceptance_criteria: [],
          artifacts_to_produce: [],
          safety_notes: []
        },
        skills: [executor.skillId],
        events: [
          {
            at: Date.now(),
            kind: 'log',
            level: 'info',
            text: `Launching saved skill: ${skill.title}`
          }
        ],
        artifacts: [],
        pendingPrompts: [],
        summary: undefined,
        report: undefined,
        skillId: skill.id,
        skillTitle: skill.title,
        invocation: {
          executionType: 'claw',
          binary: executor.backend?.trim() || defaultClawBackend,
          args: [],
          prompt: skill.request,
          cwd: undefined
        }
      });
    } else {
      showToast({ message: 'Raw runner skills report when command exits (no stream events).', kind: 'info' });
    }
    try {
      const result = await window.braindump.appSkills.run({
        skillId: skill.id,
        tabId: activeTabId,
        sessionId,
        groupId,
        skill
      });
      if (!result.ok) {
        if (clawLiveRun) {
          updateClawJob(sessionId, {
            state: 'error',
            endedAt: Date.now(),
            summary: `Skill failed: ${result.error}`
          });
        } else {
          upsertClawJob({
            sessionId,
            tabId: activeTabId,
            groupId,
            startedAt,
            endedAt: Date.now(),
            backend: summarizeExecutor(skill),
            state: 'error',
            draft: {
              goal: `Skill: ${skill.title}`,
              constraints: [],
              acceptance_criteria: [],
              artifacts_to_produce: [],
              safety_notes: []
            },
            skills: [],
            events: [
              {
                at: Date.now(),
                kind: 'log',
                level: 'error',
                text: `Skill failed: ${result.error}`
              }
            ],
            artifacts: [],
            pendingPrompts: [],
            summary: `Skill failed: ${result.error}`,
            report: undefined,
            skillId: skill.id,
            skillTitle: skill.title,
            invocation: {
              executionType: 'raw',
              binary: skill.executor.kind === 'raw' ? skill.executor.shell : summarizeExecutor(skill),
              args: [],
              prompt: skill.request,
              cwd: undefined
            }
          });
        }
        showToast({ message: `Skill failed: ${result.error}`, kind: 'error' });
        return;
      }

      if (result.executionType === 'claw') {
        updateClawJob(result.sessionId, {
          state: 'running',
          backend: result.backend,
          invocation: {
            executionType: 'claw',
            binary: result.invocation.binary,
            args: result.invocation.args,
            prompt: result.invocation.prompt,
            system: result.invocation.system,
            cwd: result.invocation.cwd
          },
          skills: result.skillIds,
          skillId: result.skillId,
          skillTitle: result.skillTitle,
          summary: undefined
        });
        startClawSessionPolling(result.sessionId);
      } else {
        stopClawSessionPolling(result.sessionId);
        upsertClawJob({
          sessionId: result.sessionId,
          tabId: activeTabId,
          groupId: result.groupId,
          startedAt,
          endedAt: Date.now(),
          backend: result.backend,
          state: result.exitCode === 0 ? 'done' : 'error',
          draft: {
            goal: `Skill: ${skill.title}`,
            constraints: [],
            acceptance_criteria: [],
            artifacts_to_produce: [],
            safety_notes: []
          },
          skills: result.skillIds,
          events: [
            {
              at: Date.now(),
              kind: 'log',
              level: result.exitCode === 0 ? 'info' : 'error',
              text: result.summary
            }
          ],
          artifacts: [
            ...(result.stdout.trim().length
              ? [
                  {
                    id: `${result.sessionId}:stdout`,
                    kind: 'text' as const,
                    title: 'stdout',
                    text: result.stdout
                  }
                ]
              : []),
            ...(result.stderr.trim().length
              ? [
                  {
                    id: `${result.sessionId}:stderr`,
                    kind: 'text' as const,
                    title: 'stderr',
                    text: result.stderr
                  }
                ]
              : [])
          ],
          pendingPrompts: [],
          summary: result.summary,
          report: undefined,
          skillId: result.skillId,
          skillTitle: result.skillTitle,
          invocation: {
            executionType: 'raw',
            binary: result.invocation.binary,
            args: result.invocation.args,
            prompt: result.invocation.prompt,
            cwd: result.invocation.cwd
          }
        });
      }

      setClawFilterGroup(groupId);
      setClawPanelOpen(true);
      showToast({ message: `Running skill: ${skill.title}`, kind: 'success' });
    } catch (error) {
      if (clawLiveRun) {
        updateClawJob(sessionId, {
          state: 'error',
          endedAt: Date.now(),
          summary: `Skill failed: ${(error as Error).message}`
        });
      } else {
        upsertClawJob({
          sessionId,
          tabId: activeTabId,
          groupId,
          startedAt,
          endedAt: Date.now(),
          backend: summarizeExecutor(skill),
          state: 'error',
          draft: {
            goal: `Skill: ${skill.title}`,
            constraints: [],
            acceptance_criteria: [],
            artifacts_to_produce: [],
            safety_notes: []
          },
          skills: [],
          events: [
            {
              at: Date.now(),
              kind: 'log',
              level: 'error',
              text: `Skill failed: ${(error as Error).message}`
            }
          ],
          artifacts: [],
          pendingPrompts: [],
          summary: `Skill failed: ${(error as Error).message}`,
          report: undefined,
          skillId: skill.id,
          skillTitle: skill.title,
          invocation: {
            executionType: 'raw',
            binary: skill.executor.kind === 'raw' ? skill.executor.shell : summarizeExecutor(skill),
            args: [],
            prompt: skill.request,
            cwd: undefined
          }
        });
      }
      showToast({ message: `Skill failed: ${(error as Error).message}`, kind: 'error' });
    } finally {
      setRunningSkillId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
      <section className="rounded-xl border border-hairline bg-surface-1/85 p-4 space-y-3">
        <div className="flex items-center gap-2 text-fg-0">
          <WandSparkles size={16} className="text-accent-400" />
          <div className="display text-[18px]">Skills</div>
        </div>
        <div className="text-[12px] text-fg-2">
          Describe what you want once. The backend generates and wires a runnable skill tile.
          {activeTab?.name ? ` Active tab context: ${activeTab.name}.` : ''}
        </div>
        <div className="flex flex-col gap-2">
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Example: Kill all bash terminals with admin PowerShell"
            className="w-full min-h-[84px] rounded-lg border border-hairline bg-surface-0 px-3 py-2 text-[13px] text-fg-0 outline-none focus:border-accent-500"
          />
          <div className="rounded-md border border-hairline bg-surface-0/75 px-3 py-2 space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-fg-3">Executor at creation</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['auto', 'claw', 'raw'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5 text-[12px] text-fg-2">
                  <input
                    type="radio"
                    name="create-executor-mode"
                    checked={createExecutorMode === mode}
                    onChange={() => setCreateExecutorMode(mode)}
                  />
                  {mode === 'auto' ? 'Auto (backend chooses)' : mode === 'claw' ? 'Open Claw' : 'Raw runner'}
                </label>
              ))}
            </div>
            {createExecutorMode === 'claw' && (
              <div className="space-y-1">
                <div className="text-[11px] text-fg-3">Open Claw backend</div>
                <select
                  value={createClawBackend}
                  onChange={(e) => setCreateClawBackend(e.target.value)}
                  className="w-full rounded border border-hairline bg-surface-1 px-2 py-1.5 text-[12px] text-fg-1"
                >
                  <option value="default">default ({defaultClawBackend})</option>
                  {clawBackends.map((backend) => (
                    <option key={backend} value={backend}>{backend}</option>
                  ))}
                </select>
              </div>
            )}
            {createExecutorMode === 'raw' && (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] text-fg-3">
                    Shell
                    <select
                      value={createRawShell}
                      onChange={(e) => setCreateRawShell(e.target.value as 'powershell' | 'cmd')}
                      className="mt-1 w-full rounded border border-hairline bg-surface-1 px-2 py-1.5 text-[12px] text-fg-1"
                    >
                      <option value="powershell">PowerShell</option>
                      <option value="cmd">Command Prompt</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-fg-2 mt-5">
                    <input
                      type="checkbox"
                      checked={createRawElevated}
                      onChange={(e) => setCreateRawElevated(e.target.checked)}
                    />
                    Run as admin
                  </label>
                </div>
                <label className="text-[11px] text-fg-3 block">
                  Command override (optional)
                  <input
                    value={createRawCommand}
                    onChange={(e) => setCreateRawCommand(e.target.value)}
                    placeholder="taskkill /F /IM bash.exe"
                    className="mt-1 w-full rounded border border-hairline bg-surface-1 px-2 py-1.5 text-[12px] text-fg-1 mono"
                  />
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => void generateSkill()}
              disabled={generating || !request.trim().length}
              className="inline-flex items-center gap-1.5 rounded bg-accent-500 px-3 py-1.5 text-[12px] text-white hover:bg-accent-600 disabled:opacity-60"
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {generating ? 'Generating…' : 'Create Skill'}
            </button>
          </div>
        </div>
      </section>

      <section>
        {skills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface-1/60 px-5 py-7 text-[13px] text-fg-3">
            No saved skills yet. Generate one above to create your first tile.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {skills.map((skill) => {
              const recent = jobsBySkill.get(skill.id) ?? [];
              const latest = recent[0];
              const expanded = expandedSkillId === skill.id;
              const live = latest?.state === 'running' || latest?.state === 'waiting-input';
              const eventCount = latest?.events.length ?? 0;
              const livePreview = summarizeLiveEvent(latest);
              const stallLikely = live && eventCount <= 1;
              return (
                <article
                  key={skill.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setConfirmRunSkill(skill)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setConfirmRunSkill(skill);
                    }
                  }}
                  className={clsx(
                    'group rounded-xl border bg-surface-1 p-4 min-h-[170px] cursor-pointer',
                    'transition-[border-color,box-shadow,background-color] duration-150 hover:bg-surface-2/70 hover:border-accent-400/90 hover:shadow-[0_0_0_1px_var(--accent-500)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-0',
                    live
                      ? 'border-accent-500/65'
                      : 'border-hairline hover:border-accent-500/70'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[16px] text-fg-0 font-semibold truncate">{skill.title}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide',
                            skill.executor.kind === 'claw'
                              ? 'border-accent-500/50 bg-accent-500/10 text-accent-300'
                              : 'border-hairline bg-surface-2 text-fg-3'
                          )}
                          title={
                            skill.executor.kind === 'claw'
                              ? 'Live stream updates during run'
                              : 'Output appears when command exits'
                          }
                        >
                          {skill.executor.kind === 'claw' ? 'Live Stream' : 'Exit Only'}
                        </span>
                        <div className="text-[12px] text-fg-3 truncate">{summarizeExecutor(skill)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSkillId((current) => (current === skill.id ? null : skill.id));
                        }}
                        className="text-fg-3 hover:text-fg-0"
                        title={expanded ? 'Hide details' : 'Edit / show details'}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteSkill(skill);
                        }}
                        className="text-fg-3 hover:text-danger"
                        title="Delete skill"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-[13px] text-fg-2 leading-relaxed min-h-[3.2rem]">
                    {skill.description}
                  </p>

                  <div className="mt-3 rounded-md bg-surface-0/75 border border-hairline px-2 py-1.5 text-[11px] transition-colors duration-150 group-hover:border-accent-500/45 group-hover:bg-surface-0/90">
                    <div className="uppercase tracking-wider text-fg-3">Latest run</div>
                    {latest ? (
                      <div className="mt-1 space-y-0.5">
                        <div className={clsx('font-medium inline-flex items-center gap-1.5', latest.state === 'error' ? 'text-danger' : latest.state === 'done' ? 'text-success' : 'text-accent-300')}>
                          {live && <Loader2 size={11} className="animate-spin" />}
                          {latest.state}
                        </div>
                        <div className="text-fg-3">{new Date(latest.startedAt).toLocaleString()}</div>
                        {live && (
                          <div className="text-accent-300">Live updates: {eventCount} event{eventCount === 1 ? '' : 's'}</div>
                        )}
                        {latest && (
                          <div className="text-fg-3 mono">
                            session {latest.sessionId.slice(0, 8)} · artifacts {latest.artifacts.length} · prompts {latest.pendingPrompts.length}
                          </div>
                        )}
                        {stallLikely && (
                          <div className="text-warning">
                            Waiting for backend stream events... open Monitor or Claw logs for details.
                          </div>
                        )}
                        {live && livePreview && (
                          <div className="text-fg-2 line-clamp-1">{livePreview}</div>
                        )}
                        {latest.summary && <div className="text-fg-2 line-clamp-2">{latest.summary}</div>}
                      </div>
                    ) : (
                      <div className="mt-1 text-fg-3">{runningSkillId === skill.id ? 'Launching…' : 'No runs yet.'}</div>
                    )}
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                      <div className="rounded-md border border-hairline bg-surface-0/75 px-2.5 py-2 text-[11px] space-y-1">
                        <div className="uppercase tracking-wider text-fg-3">Configuration</div>
                        {skill.executor.kind === 'claw' ? (
                          <>
                            <div className="text-fg-2">Executor: Open Claw</div>
                            <div className="text-fg-2">Backend: {skill.executor.backend || 'default (from Claw settings)'}</div>
                            <div className="text-fg-2">CWD mode: {skill.executor.cwdMode}</div>
                            <div className="text-fg-2">Skill ID: <span className="mono text-fg-1">{skill.executor.skillId}</span></div>
                            <div className="text-fg-2">Skill file: <span className="mono text-fg-1">{skill.executor.skillFileName}</span></div>
                          </>
                        ) : (
                          <>
                            <div className="text-fg-2">Executor: Raw backend runner</div>
                            <div className="text-fg-2">Shell: {skill.executor.shell === 'powershell' ? 'PowerShell' : 'Command Prompt'}</div>
                            <div className="text-fg-2">Elevation: {skill.executor.elevated ? 'Administrator required' : 'Standard'}</div>
                            <div className="text-fg-2">CWD mode: {skill.executor.cwdMode}</div>
                            <div className="text-fg-2 break-all">Command: <span className="mono text-fg-1">{skill.executor.command}</span></div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => beginEditSkill(skill)}
                          className="inline-flex items-center gap-1 rounded border border-hairline px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg-0 hover:bg-surface-2"
                        >
                          <Pencil size={12} />
                          Edit fields
                        </button>
                        <button
                          onClick={() => {
                            setClawFilterGroup(skillGroupId(skill.id));
                            setClawPanelOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-hairline px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg-0 hover:bg-surface-2"
                        >
                          <TerminalSquare size={12} />
                          Monitor
                        </button>
                        <button
                          onClick={() => {
                            void window.braindump.claw.showLogs().then(({ path }) => {
                              showToast({ message: `Opened Claw logs: ${path}`, kind: 'info' });
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded border border-hairline px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg-0 hover:bg-surface-2"
                        >
                          Debug logs
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {skills.length > 0 && (
        <section className="rounded-xl border border-hairline bg-surface-1/70 p-3">
          <div className="flex items-center gap-2 text-[12px] text-fg-2">
            <Bot size={14} className="text-accent-400" />
            Skills can run through Open Claw for repo-aware execution or through raw backend runners (for deterministic shell commands).
          </div>
        </section>
      )}

      {confirmRunSkill && (
        <div className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setConfirmRunSkill(null)}>
          <div
            className="w-full max-w-lg rounded-xl border border-hairline bg-surface-1 shadow-pop p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="display text-[18px] text-fg-0">Run Skill</div>
            <div className="text-[13px] text-fg-2">
              Confirm running <span className="text-fg-0">{confirmRunSkill.title}</span>.
            </div>
            <div className="rounded-md border border-hairline bg-surface-0/75 px-3 py-2 text-[12px] space-y-1">
              <div className="text-fg-2">{summarizeExecutor(confirmRunSkill)}</div>
              {confirmRunSkill.executor.kind === 'raw' && (
                <div className="text-fg-2 break-all">
                  Command: <span className="mono text-fg-1">{confirmRunSkill.executor.command}</span>
                </div>
              )}
              {confirmRunSkill.executor.kind === 'claw' && (
                <div className="text-fg-2">
                  Open Claw skill: <span className="mono text-fg-1">{confirmRunSkill.executor.skillId}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded text-[12px] text-fg-2 hover:text-fg-0 hover:bg-surface-3"
                onClick={() => setConfirmRunSkill(null)}
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-[42px] items-center gap-2 rounded bg-accent-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-600"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const skill = confirmRunSkill;
                  setConfirmRunSkill(null);
                  if (skill) {
                    window.setTimeout(() => {
                      void runSkill(skill);
                    }, 0);
                  }
                }}
              >
                <Play size={14} />
                Confirm Run
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteSkill && (
        <div className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setConfirmDeleteSkill(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-hairline bg-surface-1 shadow-pop p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="display text-[18px] text-fg-0">Delete Skill</div>
            <div className="text-[13px] text-fg-2">
              Delete <span className="text-fg-0">{confirmDeleteSkill.title}</span>? This removes the tile and stored configuration.
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded text-[12px] text-fg-2 hover:text-fg-0 hover:bg-surface-3"
                onClick={() => setConfirmDeleteSkill(null)}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded bg-danger px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                onClick={() => {
                  const skill = confirmDeleteSkill;
                  setConfirmDeleteSkill(null);
                  if (!skill) return;
                  deleteSkill(skill.id);
                  showToast({ message: `Deleted skill: ${skill.title}`, kind: 'success' });
                }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSkill && editDraft && (
        <div className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={() => {
          setEditingSkill(null);
          setEditDraft(null);
        }}>
          <div
            className="w-full max-w-2xl rounded-xl border border-hairline bg-surface-1 shadow-pop p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="display text-[18px] text-fg-0">Edit Skill</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-fg-3 block">
                Title
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                  className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                />
              </label>
              <label className="text-[11px] text-fg-3 block">
                Executor
                <select
                  value={editDraft.executor.kind}
                  onChange={(e) => {
                    const kind = e.target.value as 'claw' | 'raw';
                    if (kind === editDraft.executor.kind) return;
                    if (kind === 'claw') {
                      const slug = slugify(editDraft.title || editDraft.request || editDraft.id);
                      setEditDraft({
                        ...editDraft,
                        executor: {
                          kind: 'claw',
                          backend: undefined,
                          skillId: `app-${slug}`,
                          skillFileName: `${slug}.md`,
                          skillInstructions: `Carry out the "${editDraft.title}" skill carefully and report what happened.`,
                          prompt: editDraft.request,
                          cwdMode: 'active-tab-project-or-repo'
                        }
                      });
                    } else {
                      setEditDraft({
                        ...editDraft,
                        executor: {
                          kind: 'raw',
                          shell: 'powershell',
                          command: editDraft.request,
                          elevated: false,
                          cwdMode: 'repo'
                        }
                      });
                    }
                  }}
                  className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                >
                  <option value="claw">Open Claw</option>
                  <option value="raw">Raw runner</option>
                </select>
              </label>
            </div>

            <label className="text-[11px] text-fg-3 block">
              Description
              <textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                className="mt-1 w-full min-h-[64px] rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
              />
            </label>

            <label className="text-[11px] text-fg-3 block">
              Run request / prompt basis
              <textarea
                value={editDraft.request}
                onChange={(e) => setEditDraft({ ...editDraft, request: e.target.value })}
                className="mt-1 w-full min-h-[74px] rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
              />
            </label>

            {editDraft.executor.kind === 'claw' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-fg-3 block">
                  Backend (optional)
                  <input
                    value={editDraft.executor.backend ?? ''}
                    onChange={(e) => updateEditClawExecutor({ backend: e.target.value.trim() || undefined })}
                    list="skills-backend-options"
                    placeholder={`default (${defaultClawBackend})`}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                  />
                </label>
                <label className="text-[11px] text-fg-3 block">
                  CWD mode
                  <select
                    value={editDraft.executor.cwdMode}
                    onChange={(e) => updateEditClawExecutor({ cwdMode: e.target.value as 'active-tab-project-or-repo' | 'repo' })}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                  >
                    <option value="active-tab-project-or-repo">active-tab-project-or-repo</option>
                    <option value="repo">repo</option>
                  </select>
                </label>
                <label className="text-[11px] text-fg-3 block">
                  Skill ID
                  <input
                    value={editDraft.executor.skillId}
                    onChange={(e) => updateEditClawExecutor({ skillId: e.target.value })}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1 mono"
                  />
                </label>
                <label className="text-[11px] text-fg-3 block">
                  Skill file
                  <input
                    value={editDraft.executor.skillFileName}
                    onChange={(e) => updateEditClawExecutor({ skillFileName: e.target.value })}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1 mono"
                  />
                </label>
                <label className="sm:col-span-2 text-[11px] text-fg-3 block">
                  Prompt
                  <textarea
                    value={editDraft.executor.prompt}
                    onChange={(e) => updateEditClawExecutor({ prompt: e.target.value })}
                    className="mt-1 w-full min-h-[64px] rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-fg-3 block">
                  Shell
                  <select
                    value={editDraft.executor.shell}
                    onChange={(e) => updateEditRawExecutor({ shell: e.target.value as 'powershell' | 'cmd' })}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                  >
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">Command Prompt</option>
                  </select>
                </label>
                <label className="text-[11px] text-fg-3 block">
                  CWD mode
                  <select
                    value={editDraft.executor.cwdMode}
                    onChange={(e) => updateEditRawExecutor({ cwdMode: e.target.value as 'active-tab-project-or-repo' | 'repo' })}
                    className="mt-1 w-full rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1"
                  >
                    <option value="repo">repo</option>
                    <option value="active-tab-project-or-repo">active-tab-project-or-repo</option>
                  </select>
                </label>
                <label className="sm:col-span-2 flex items-center gap-1.5 text-[12px] text-fg-2">
                  <input
                    type="checkbox"
                    checked={Boolean(editDraft.executor.elevated)}
                    onChange={(e) => updateEditRawExecutor({ elevated: e.target.checked })}
                  />
                  Run as admin
                </label>
                <label className="sm:col-span-2 text-[11px] text-fg-3 block">
                  Command
                  <textarea
                    value={editDraft.executor.command}
                    onChange={(e) => updateEditRawExecutor({ command: e.target.value })}
                    className="mt-1 w-full min-h-[74px] rounded border border-hairline bg-surface-0 px-2 py-1.5 text-[12px] text-fg-1 mono"
                  />
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 rounded text-[12px] text-fg-2 hover:text-fg-0 hover:bg-surface-3"
                onClick={() => {
                  setEditingSkill(null);
                  setEditDraft(null);
                }}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded bg-accent-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-600"
                onClick={saveEditSkill}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="skills-backend-options">
        {clawBackends.map((backend) => (
          <option key={backend} value={backend} />
        ))}
      </datalist>
    </div>
  );
}
