// Braindump ↔ OpenClaw protocol.
// Newline-delimited JSON over stdio (child process) or a local WebSocket.
// Every message carries a monotonic `seq` so consumers can reconcile streams.

export type ArtifactKind = 'diff' | 'file' | 'link' | 'analytics' | 'text';

export type Artifact =
  | { id: string; kind: 'diff'; path?: string; unifiedDiff: string }
  | { id: string; kind: 'file'; path: string; action?: 'created' | 'modified' | 'deleted' }
  | { id: string; kind: 'link'; label: string; url: string }
  | { id: string; kind: 'analytics'; label: string; rows: Record<string, unknown>[] }
  | { id: string; kind: 'text'; title?: string; text: string };

export type ClientToClaw =
  | { seq: number; type: 'hello'; clientVersion: string }
  | { seq: number; type: 'ping' }
  | {
      seq: number;
      type: 'start-session';
      sessionId: string;
      backend: string;
      cwd: string;
      skills: string[];
      system?: string;
    }
  | { seq: number; type: 'message'; sessionId: string; content: string; attachments?: { path: string; kind: string }[] }
  | { seq: number; type: 'reply'; sessionId: string; promptId: string; text: string }
  | { seq: number; type: 'interrupt'; sessionId: string }
  | { seq: number; type: 'end-session'; sessionId: string };

export type ClawToClient =
  | { seq: number; type: 'welcome'; clawVersion: string; backends: string[]; skills: string[] }
  | { seq: number; type: 'pong' }
  | { seq: number; type: 'log'; sessionId: string; level: 'info' | 'warn' | 'error'; text: string }
  | { seq: number; type: 'thinking'; sessionId: string; text: string }
  | { seq: number; type: 'tool-call'; sessionId: string; tool: string; args: Record<string, unknown>; id: string }
  | {
      seq: number;
      type: 'tool-result';
      sessionId: string;
      id: string;
      ok: boolean;
      text?: string;
      artifacts?: Artifact[];
    }
  | { seq: number; type: 'prompt'; sessionId: string; promptId: string; question: string; options?: string[] }
  | {
      seq: number;
      type: 'status';
      sessionId: string;
      state: 'running' | 'waiting-input' | 'done' | 'error';
      progress?: number;
    }
  | {
      seq: number;
      type: 'done';
      sessionId: string;
      summary: string;
      metrics: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
    };

export type ClawMessage = ClientToClaw | ClawToClient;

// Dangerous command patterns used by the safety guard in main.
export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+-rf?\s+\//i,
  /\brm\s+-rf?\s+~/i,
  /\bgit\s+push\s+--force\b/i,
  /\bgit\s+push\s+-f\b/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/i,
  /\bdd\s+if=/i,
  /\bmkfs\b/i
];

export function isDangerous(text: string): boolean {
  return DANGEROUS_PATTERNS.some((p) => p.test(text));
}

export function parseNdjson<T = ClawMessage>(buf: string): { messages: T[]; remainder: string } {
  const out: T[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf.charCodeAt(i) === 0x0a /* \n */) {
      const line = buf.slice(start, i).trim();
      start = i + 1;
      if (!line) continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // skip malformed line
      }
    }
  }
  return { messages: out, remainder: buf.slice(start) };
}

export function encode(msg: ClawMessage): string {
  return JSON.stringify(msg) + '\n';
}
