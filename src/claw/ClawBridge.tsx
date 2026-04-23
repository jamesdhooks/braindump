import { useEffect } from 'react';
import { useStore } from '../store';
import type { ClawJobEvent, ClawJobArtifact } from '../types';

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
  const appendEvent = useStore((s) => s.appendClawEvent);
  const appendArtifact = useStore((s) => s.appendClawArtifact);
  const update = useStore((s) => s.updateClawJob);
  const pushPrompt = useStore((s) => s.pushClawPrompt);

  useEffect(() => {
    void window.braindump.claw.state().then(setBroker);
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
        update(m.sessionId, { state: 'done', endedAt: Date.now(), summary: m.summary, metrics: m.metrics });
        const st = useStore.getState();
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
                diffSummary: `Claw: ${m.summary}`
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
  }, [setBroker, appendEvent, appendArtifact, update, pushPrompt]);

  return null;
}
