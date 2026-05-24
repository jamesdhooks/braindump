import { useEffect } from 'react';
import { useStore } from '../store';
import type { ClawJob, ClawJobEvent, ClawJobArtifact } from '../types';
import { tryParseReport, extractReportFromEvents } from './parseJobReport';

type Artifact = {
  id: string;
  kind: 'diff' | 'file' | 'link' | 'analytics' | 'text';
  path?: string;
  action?: 'created' | 'modified' | 'deleted';
  unifiedDiff?: string;
  label?: string;
  url?: string;
  rows?: Record<string, unknown>[];
  title?: string;
  text?: string;
};

type Inbound =
  | { type: 'welcome'; clawVersion: string; backends: string[]; skills: string[] }
  | { type: 'pong' }
  | { type: 'log'; sessionId: string; level: 'info' | 'warn' | 'error'; text: string }
  | { type: 'thinking'; sessionId: string; text: string }
  | { type: 'tool-call'; sessionId: string; tool: string; args: Record<string, unknown>; id: string }
  | { type: 'tool-result'; sessionId: string; id: string; ok: boolean; text?: string; artifacts?: Artifact[] }
  | { type: 'prompt'; sessionId: string; promptId: string; question: string; options?: string[] }
  | { type: 'status'; sessionId: string; state: 'running' | 'waiting-input' | 'done' | 'error'; progress?: number }
  | { type: 'done'; sessionId: string; summary: string; metrics: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number } };

type RecoverySession = {
  sessionId: string;
  tabId?: string;
  groupId?: string;
  backend: string;
  cwd: string;
  skills: string[];
  system?: string;
  prompt?: string;
  startedAt: number;
  endedAt?: number;
  state: 'running' | 'waiting-input' | 'done' | 'error';
  summary?: string;
  metrics?: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
  pendingPrompts: { promptId: string; question: string; options?: string[] }[];
};

const RECOVERY_WARNING =
  'This code session could not be reattached after Braindump reloaded or restarted. Use Continue to resume from the saved context.';

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

function isExternalRunnerJob(job: ClawJob) {
  return job.invocation?.runnerId === 'claude-cli' || job.invocation?.runnerId === 'copilot-cli' || job.backend === 'Claude Code' || job.backend === 'GitHub Copilot';
}

function buildRecoveredJob(snapshot: RecoverySession, existing?: ClawJob): ClawJob | null {
  if (!existing && (!snapshot.tabId || !snapshot.groupId || !snapshot.prompt)) {
    return null;
  }
  const mergedEvents = mergeEvents(existing?.events ?? [], snapshot.events);
  const mergedArtifacts = mergeArtifacts(existing?.artifacts ?? [], snapshot.artifacts);
  const report =
    existing?.report ??
    (snapshot.summary ? tryParseReport(snapshot.summary) : null) ??
    extractReportFromEvents(mergedEvents) ??
    undefined;

  return {
    sessionId: snapshot.sessionId,
    tabId: existing?.tabId ?? snapshot.tabId ?? '',
    groupId: existing?.groupId ?? snapshot.groupId ?? '',
    startedAt: existing?.startedAt ?? snapshot.startedAt,
    endedAt: snapshot.endedAt ?? existing?.endedAt,
    backend: existing?.backend ?? snapshot.backend,
    state: snapshot.state,
    draft: existing?.draft ?? {
      goal: `${snapshot.backend} run`,
      constraints: [],
      acceptance_criteria: [],
      artifacts_to_produce: [],
      safety_notes: []
    },
    skills: existing?.skills ?? snapshot.skills,
    events: mergedEvents,
    artifacts: mergedArtifacts,
    pendingPrompts: snapshot.pendingPrompts.length ? snapshot.pendingPrompts : existing?.pendingPrompts ?? [],
    summary: report?.summary ?? snapshot.summary ?? existing?.summary,
    ...(report ? { report } : {}),
    ...(snapshot.metrics ? { metrics: snapshot.metrics } : existing?.metrics ? { metrics: existing.metrics } : {}),
    invocation: {
      executionType: existing?.invocation?.executionType ?? 'claw',
      binary: existing?.invocation?.binary ?? snapshot.backend,
      args: existing?.invocation?.args ?? [],
      prompt: existing?.invocation?.prompt ?? snapshot.prompt ?? '',
      system: existing?.invocation?.system ?? snapshot.system,
      cwd: existing?.invocation?.cwd ?? snapshot.cwd
    },
    ...(existing?.skillId ? { skillId: existing.skillId } : {}),
    ...(existing?.skillTitle ? { skillTitle: existing.skillTitle } : {})
  };
}

function toEvent(msg: Inbound): ClawJobEvent | null {
  const at = Date.now();
  switch (msg.type) {
    case 'log':
      return { at, kind: 'log', level: msg.level, text: msg.text };
    case 'thinking':
      return { at, kind: 'thinking', text: msg.text };
    case 'tool-call':
      return { at, kind: 'tool-call', tool: msg.tool, args: msg.args, id: msg.id };
    case 'tool-result':
      return { at, kind: 'tool-result', id: msg.id, ok: msg.ok, text: msg.text };
    case 'status':
      return { at, kind: 'status', state: msg.state, progress: msg.progress };
    case 'prompt':
      return { at, kind: 'prompt', promptId: msg.promptId, question: msg.question, options: msg.options };
    default:
      return null;
  }
}

function toArtifact(a: Artifact): ClawJobArtifact {
  return {
    id: a.id,
    kind: a.kind,
    path: a.path,
    title: a.title,
    text: a.text,
    unifiedDiff: a.unifiedDiff,
    rows: a.rows,
    url: a.url,
    action: a.action
  };
}

export function ClawBridge() {
  const setBroker = useStore((s) => s.setClawBrokerState);
  const upsertJob = useStore((s) => s.upsertClawJob);
  const appendEvent = useStore((s) => s.appendClawEvent);
  const appendArtifact = useStore((s) => s.appendClawArtifact);
  const update = useStore((s) => s.updateClawJob);
  const pushPrompt = useStore((s) => s.pushClawPrompt);

  useEffect(() => {
    void Promise.all([window.braindump.claw.state(), window.braindump.claw.recoverSessions()]).then(([state, sessions]) => {
      setBroker(state);
      const existingJobs = useStore.getState().clawJobs ?? [];
      const recoveredIds = new Set(sessions.map((session) => session.sessionId));
      for (const session of sessions) {
        const existing = existingJobs.find((job) => job.sessionId === session.sessionId);
        const recovered = buildRecoveredJob(session as RecoverySession, existing);
        if (recovered) upsertJob(recovered);
      }
      const staleJobs = existingJobs.filter(
        (job) =>
          !isExternalRunnerJob(job) &&
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
    const unsubState = window.braindump.claw.onState(setBroker);
    const unsubMsg = window.braindump.claw.onMessage((msg) => {
      const m = msg as Inbound;
      const ev = toEvent(m);
      const sid = (m as { sessionId?: string }).sessionId;
      if (sid && ev) appendEvent(sid, ev);
      if (m.type === 'tool-result' && m.artifacts) {
        for (const a of m.artifacts) appendArtifact(m.sessionId, toArtifact(a));
      }
      if (m.type === 'prompt') {
        pushPrompt(m.sessionId, { promptId: m.promptId, question: m.question, options: m.options });
        update(m.sessionId, { state: 'waiting-input' });
      }
      if (m.type === 'status' && m.state !== 'waiting-input') {
        update(m.sessionId, { state: m.state });
      }
      if (m.type === 'done') {
        const st = useStore.getState();
        const existingJob = (st.clawJobs ?? []).find((j) => j.sessionId === m.sessionId);
        const reportFromSummary = tryParseReport(m.summary);
        const reportFromEvents = extractReportFromEvents(existingJob?.events ?? []);
        const report = reportFromSummary ?? reportFromEvents ?? undefined;
        const summary = report?.summary ?? m.summary;
        update(m.sessionId, { state: 'done', endedAt: Date.now(), summary, metrics: m.metrics, ...(report ? { report } : {}) });
        const job = (st.clawJobs ?? []).find((j) => j.sessionId === m.sessionId);
        if (job) {
          const tab = st.tabs.find((t) => t.id === job.tabId);
          const group = tab?.groups.find((g) => g.id === job.groupId);
          if (group) {
            useStore.setState((s) => {
              const t = s.tabs.find((x) => x.id === job.tabId);
              const g = t?.groups.find((x) => x.id === job.groupId);
              if (!g) return;
                g.history.push({
                  id: `claw-${m.sessionId.slice(0, 8)}`,
                  at: Date.now(),
                  source: 'user',
                  lines: [...g.lines],
                  diffSummary: `Claw: ${summary}`
                });
              });
            st.persist();
          }
        }
      }
    });
    return () => {
      unsubState();
      unsubMsg();
    };
  }, [setBroker, upsertJob, appendEvent, appendArtifact, update, pushPrompt]);

  return null;
}
