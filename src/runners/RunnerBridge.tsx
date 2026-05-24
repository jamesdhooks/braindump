import { useEffect } from 'react';
import { useStore } from '../store';
import type { ClawJob, ClawJobArtifact, ClawJobEvent, RunnerStatusInfo } from '../types';
import { tryParseReport, extractReportFromEvents } from '../claw/parseJobReport';

type RunnerEvent =
  | {
      kind: 'started';
      sessionId: string;
      tabId: string;
      groupId: string;
      runnerId: 'claude-cli' | 'copilot-cli';
      binary: string;
      args: string[];
      prompt: string;
      system?: string;
      cwd: string;
      complexity?: 'simple' | 'complex' | 'crazy';
      complexitySource?: 'manual' | 'automatic';
    }
  | { kind: 'job-event'; sessionId: string; event: ClawJobEvent }
  | { kind: 'done'; sessionId: string; ok: boolean; exitCode: number | null; summary: string; artifacts?: ClawJobArtifact[] };

type RunnerRecoverySnapshot = {
  sessionId: string;
  runnerId: 'claude-cli' | 'copilot-cli';
  tabId: string;
  groupId: string;
  binary: string;
  args: string[];
  prompt: string;
  system?: string;
  cwd: string;
  complexity?: 'simple' | 'complex' | 'crazy';
  complexitySource?: 'manual' | 'automatic';
  startedAt: number;
  endedAt?: number;
  state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
  summary?: string;
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
};

const RUNNER_LABEL: Record<'claude-cli' | 'copilot-cli', string> = {
  'claude-cli': 'Claude Code',
  'copilot-cli': 'GitHub Copilot'
};

const RECOVERY_WARNING =
  'This runner session could not be reattached after Braindump reloaded or restarted. Use Continue to resume from the saved context.';

function eventKey(event: ClawJobEvent) {
  return JSON.stringify(event);
}

function artifactKey(artifact: ClawJobArtifact) {
  return artifact.id;
}

function mergeEvents(existing: ClawJobEvent[], recovered: ClawJobEvent[]) {
  const merged = [...existing];
  const seen = new Set(existing.map(eventKey));
  for (const event of recovered) {
    const key = eventKey(event);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }
  return merged.sort((a, b) => a.at - b.at);
}

function mergeArtifacts(existing: ClawJobArtifact[], recovered: ClawJobArtifact[]) {
  const merged = [...existing];
  const seen = new Set(existing.map(artifactKey));
  for (const artifact of recovered) {
    const key = artifactKey(artifact);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(artifact);
    }
  }
  return merged;
}

function isRunnerJob(job: ClawJob) {
  return job.invocation?.runnerId === 'claude-cli' || job.invocation?.runnerId === 'copilot-cli' || job.backend === 'Claude Code' || job.backend === 'GitHub Copilot';
}

function buildRecoveredJob(snapshot: RunnerRecoverySnapshot, existing?: ClawJob): ClawJob {
  const mergedEvents = mergeEvents(existing?.events ?? [], snapshot.events);
  const mergedArtifacts = mergeArtifacts(existing?.artifacts ?? [], snapshot.artifacts);
  const report =
    existing?.report ??
    (snapshot.summary ? tryParseReport(snapshot.summary) : null) ??
    extractReportFromEvents(mergedEvents) ??
    undefined;

  return {
    sessionId: snapshot.sessionId,
    tabId: existing?.tabId ?? snapshot.tabId,
    groupId: existing?.groupId ?? snapshot.groupId,
    startedAt: existing?.startedAt ?? snapshot.startedAt,
    endedAt: snapshot.endedAt ?? existing?.endedAt,
    backend: RUNNER_LABEL[snapshot.runnerId],
    state: snapshot.state,
    draft: existing?.draft ?? {
      goal: `${RUNNER_LABEL[snapshot.runnerId]} run`,
      constraints: [],
      acceptance_criteria: [],
      artifacts_to_produce: [],
      safety_notes: [`Spawned: ${snapshot.binary} ${snapshot.args.join(' ')}`]
    },
    skills: existing?.skills ?? [],
    events: mergedEvents,
    artifacts: mergedArtifacts,
    pendingPrompts: existing?.pendingPrompts ?? [],
    summary: report?.summary ?? snapshot.summary ?? existing?.summary,
    ...(report ? { report } : {}),
    invocation: {
      executionType: 'runner',
      runnerId: snapshot.runnerId,
      complexity: snapshot.complexity,
      complexitySource: snapshot.complexitySource,
      binary: snapshot.binary,
      args: snapshot.args,
      prompt: snapshot.prompt,
      system: snapshot.system,
      cwd: snapshot.cwd
    }
  };
}

/**
 * Bridges main-process runner events into the renderer store, reusing the existing
 * ClawJob shape so the JobPanel UI works for CLI runners with no changes.
 */
export function RunnerBridge() {
  const upsertJob = useStore((s) => s.upsertClawJob);
  const appendEvent = useStore((s) => s.appendClawEvent);
  const appendArtifact = useStore((s) => s.appendClawArtifact);
  const update = useStore((s) => s.updateClawJob);
  const setStatuses = useStore((s) => s.setRunnerStatuses);

  useEffect(() => {
    let cancelled = false;
    const refreshStatuses = () => {
      void window.braindump.runner.list().then((s) => {
        if (!cancelled) setStatuses(s as RunnerStatusInfo[]);
      });
    };
    refreshStatuses();
    void window.braindump.runner.recoverSessions().then((snapshots) => {
      if (cancelled) return;
      const existingJobs = useStore.getState().clawJobs ?? [];
      const recoveredIds = new Set(snapshots.map((snapshot) => snapshot.sessionId));
      for (const snapshot of snapshots) {
        const existing = existingJobs.find((job) => job.sessionId === snapshot.sessionId);
        upsertJob(buildRecoveredJob(snapshot as RunnerRecoverySnapshot, existing));
      }
      const staleJobs = existingJobs.filter(
        (job) =>
          isRunnerJob(job) &&
          (job.state === 'running' || job.state === 'waiting-input') &&
          !recoveredIds.has(job.sessionId)
      );
      for (const job of staleJobs) {
        const alreadyLogged = job.events.some(
          (event) => event.kind === 'log' && event.level === 'warn' && event.text === RECOVERY_WARNING
        );
        if (!alreadyLogged) {
          appendEvent(job.sessionId, { at: Date.now(), kind: 'log', level: 'warn', text: RECOVERY_WARNING });
        }
        update(job.sessionId, {
          state: 'interrupted',
          endedAt: job.endedAt ?? Date.now(),
          summary: job.summary ?? RECOVERY_WARNING
        });
      }
    });
    const interval = window.setInterval(refreshStatuses, 60_000);

    const unsub = window.braindump.runner.onEvent((raw) => {
      const ev = raw as RunnerEvent;
      if (ev.kind === 'started') {
        upsertJob(
          buildRecoveredJob(
            {
              sessionId: ev.sessionId,
              runnerId: ev.runnerId,
              tabId: ev.tabId,
              groupId: ev.groupId,
              binary: ev.binary,
              args: ev.args,
              prompt: ev.prompt,
              system: ev.system,
              cwd: ev.cwd,
              complexity: ev.complexity,
              complexitySource: ev.complexitySource,
              startedAt: Date.now(),
              state: 'running',
              events: [{ at: Date.now(), kind: 'log', level: 'info', text: `Spawned ${ev.binary} ${ev.args.join(' ')}` }],
              artifacts: []
            },
            useStore.getState().clawJobs?.find((job) => job.sessionId === ev.sessionId)
          )
        );
      } else if (ev.kind === 'job-event') {
        appendEvent(ev.sessionId, ev.event);
        if (ev.event.kind === 'status' && ev.event.state !== 'waiting-input') {
          update(ev.sessionId, { state: ev.event.state });
        }
        // Parse structured report as soon as the sentinel log line arrives
        if (ev.event.kind === 'log' || ev.event.kind === 'thinking') {
          const report = tryParseReport(ev.event.text);
          if (report) update(ev.sessionId, { report });
        }
      } else if (ev.kind === 'done') {
        for (const artifact of ev.artifacts ?? []) {
          appendArtifact(ev.sessionId, artifact);
        }
        // Fall back to scanning all events if the report hasn't been set yet
        const existingJob = useStore.getState().clawJobs?.find((j) => j.sessionId === ev.sessionId);
        const reportFromSummary = tryParseReport(ev.summary);
        const report = existingJob?.report ?? reportFromSummary ?? extractReportFromEvents(existingJob?.events ?? []);
        update(ev.sessionId, {
          state: ev.ok ? 'done' : 'error',
          endedAt: Date.now(),
          summary: report?.summary ?? ev.summary,
          ...(report ? { report } : {})
        });
      }
    });
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      unsub();
    };
  }, [upsertJob, appendEvent, appendArtifact, update, setStatuses]);

  return null;
}
