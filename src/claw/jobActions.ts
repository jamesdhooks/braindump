import type { ClawJob, TaskComplexity } from '../types';
import { REPORT_SENTINEL, REPORT_SYSTEM_INSTRUCTION } from './parseJobReport';

export type TaskComplexitySource = 'manual' | 'automatic';

export type JobComplexityChoice = {
  complexity: TaskComplexity;
  source: TaskComplexitySource;
};

export type RerunMode = 'continue' | 'iterate';

export function runnerIdForJob(job: ClawJob): 'claude-cli' | 'copilot-cli' | null {
  if (job.invocation?.runnerId === 'claude-cli' || job.invocation?.runnerId === 'copilot-cli') {
    return job.invocation.runnerId;
  }
  if (job.backend === 'Claude Code') return 'claude-cli';
  if (job.backend === 'GitHub Copilot') return 'copilot-cli';
  return null;
}

export function getJobComplexityChoice(job: ClawJob): JobComplexityChoice | null {
  const invocation = job.invocation;
  if (!invocation) return null;
  const defaultedComplexity =
    invocation.executionType === 'runner' || invocation.executionType === 'claw' || invocation.runnerId
      ? 'complex'
      : null;
  const complexity = invocation.complexity ?? defaultedComplexity;
  if (!complexity) return null;
  return {
    complexity,
    source: invocation.complexitySource ?? (invocation.complexity ? 'manual' : 'automatic')
  };
}

export function formatJobComplexityChoice(choice: JobComplexityChoice | null) {
  if (!choice) return null;
  return `${choice.complexity} · ${choice.source === 'manual' ? 'manual' : 'auto'}`;
}

function buildResumeInstruction(mode: RerunMode): string {
  return mode === 'continue'
    ? [
        'You are resuming a previously interrupted coding run in the same repository.',
        'Continue execution directly. Do not ask prioritization questions.',
        'Preserve completed work and only extend or fix what is still pending.'
      ].join(' ')
    : [
        'You are iterating on a previously completed coding run in the same repository.',
        'Keep the valid work from the prior run, then apply only the requested delta.',
        'Do not restart from scratch unless the requested changes require it.'
      ].join(' ');
}

function withAppendedInstruction(base: string | undefined, instruction: string) {
  const trimmed = base?.trim();
  return trimmed ? `${trimmed}\n\n${instruction}` : instruction;
}

function describeEvent(event: ClawJob['events'][number]): string {
  switch (event.kind) {
    case 'thinking':
      return event.text;
    case 'log':
      return event.level === 'info' ? event.text : `[${event.level}] ${event.text}`;
    case 'tool-call':
      return `-> ${event.tool}(${Object.keys(event.args).join(', ')})`;
    case 'tool-result':
      return `<- ${event.ok ? 'ok' : 'err'}${event.text ? `: ${event.text.slice(0, 180)}` : ''}`;
    case 'prompt':
      return `? ${event.question}`;
    case 'user-reply':
      return `> ${event.text}`;
    case 'status':
      return `-- ${event.state}${typeof event.progress === 'number' ? ` ${Math.round(event.progress * 100)}%` : ''} --`;
    case 'safety-block':
      return `BLOCKED: ${event.reason}`;
  }
}

function buildRecentContext(job: ClawJob) {
  return job.events
    .slice(-24)
    .map((event) => describeEvent(event))
    .filter((line) => line.trim().length > 0)
    .join('\n')
    .slice(0, 2200);
}

function buildArtifactContext(job: ClawJob) {
  return job.artifacts
    .slice(-12)
    .map((artifact) => {
      const target = artifact.path ?? artifact.title ?? artifact.id;
      const action = artifact.action ? ` (${artifact.action})` : '';
      return `${artifact.kind}: ${target}${action}`;
    })
    .join('\n')
    .slice(0, 900);
}

function buildReportContext(job: ClawJob) {
  if (job.report) {
    const lines = [
      `Status: ${job.report.status}`,
      `Summary: ${job.report.summary}`,
      job.report.completed.length ? `Completed:\n- ${job.report.completed.join('\n- ')}` : '',
      job.report.changes.length ? `Changes:\n- ${job.report.changes.join('\n- ')}` : '',
      job.report.blockers.length ? `Blockers:\n- ${job.report.blockers.join('\n- ')}` : '',
      job.report.next_steps.length ? `Next steps:\n- ${job.report.next_steps.join('\n- ')}` : ''
    ].filter(Boolean);
    return lines.join('\n\n');
  }
  return job.summary?.trim() ?? 'No prior result was recorded.';
}

export function buildContinuationSystem(job: ClawJob): string {
  return withAppendedInstruction(job.invocation?.system, buildResumeInstruction('continue'));
}

export function buildContinuationPrompt(job: ClawJob): string {
  const original = job.invocation?.prompt?.trim() ?? '';
  const summary = job.summary?.trim() ?? '';
  const recentContext = buildRecentContext(job);
  const artifactContext = buildArtifactContext(job);

  return [
    'Resume the same task from the prior attempt.',
    'Original requirements (repeat and fully satisfy):',
    original,
    summary ? `Previous run summary:\n${summary}` : '',
    recentContext ? `Recent run context (truncated):\n${recentContext}` : '',
    artifactContext ? `Recent artifacts (truncated):\n${artifactContext}` : '',
    'Continue from where the run stopped. Avoid redoing finished changes unless required for correctness.'
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildIterationSystem(job: ClawJob): string {
  return withAppendedInstruction(job.invocation?.system, buildResumeInstruction('iterate'));
}

export function buildIterationPrompt(job: ClawJob, desiredChanges: string): string {
  const original = job.invocation?.prompt?.trim() ?? '';
  const result = buildReportContext(job);
  const recentContext = buildRecentContext(job);
  const artifactContext = buildArtifactContext(job);

  return [
    'Re-run this task as an iteration on the prior completed job.',
    'Original request:',
    original,
    'Previous result:',
    result,
    `Desired changes for this iteration:\n${desiredChanges.trim()}`,
    recentContext ? `Recent run context (truncated):\n${recentContext}` : '',
    artifactContext ? `Recent artifacts (truncated):\n${artifactContext}` : '',
    'Keep the useful existing work, then apply the requested changes and finish with an updated report.'
  ]
    .filter(Boolean)
    .join('\n\n');
}

function ensureClawSystemHasReportInstruction(system: string) {
  return system.includes(REPORT_SENTINEL) ? system : `${system}\n\n${REPORT_SYSTEM_INSTRUCTION}`;
}

export async function rerunJob(
  job: ClawJob,
  options: { mode: RerunMode; desiredChanges?: string },
  deps?: { upsertJob?: (job: ClawJob) => void }
) {
  const prompt = options.mode === 'continue'
    ? buildContinuationPrompt(job)
    : buildIterationPrompt(job, options.desiredChanges ?? '');
  const system = options.mode === 'continue'
    ? buildContinuationSystem(job)
    : buildIterationSystem(job);
  const choice = getJobComplexityChoice(job);
  const runnerId = runnerIdForJob(job);

  if (runnerId) {
    return window.braindump.runner.run({
      runnerId,
      tabId: job.tabId,
      groupId: job.groupId,
      cwd: job.invocation?.cwd,
      complexity: choice?.complexity,
      complexitySource: choice?.source,
      system,
      prompt
    });
  }

  if (!job.invocation?.prompt) {
    throw new Error('This job cannot be re-run from the sidebar.');
  }

  const clawSystem = ensureClawSystemHasReportInstruction(system);
  const { sessionId } = await window.braindump.claw.startSession({
    tabId: job.tabId,
    groupId: job.groupId,
    backend: job.backend,
    cwd: job.invocation?.cwd ?? '',
    skills: job.skills,
    system: clawSystem
  });

  deps?.upsertJob?.({
    ...job,
    sessionId,
    startedAt: Date.now(),
    endedAt: undefined,
    state: 'running',
    events: [],
    artifacts: [],
    pendingPrompts: [],
    summary: undefined,
    report: undefined,
    metrics: undefined,
    invocation: {
      ...job.invocation,
      executionType: job.invocation.executionType ?? 'claw',
      prompt,
      system: clawSystem,
      complexity: choice?.complexity,
      complexitySource: choice?.source
    }
  });

  await window.braindump.claw.message(sessionId, prompt);
  return { sessionId };
}
