import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type OutboxOp = {
  id: string;
  clientId: string;
  lamport: number;
  kind: string;
  payload: unknown;
  appliedAt: number;
};

function outboxPath(): string {
  const dir = path.join(app.getPath('userData'), 'sync');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'braindump.outbox.jsonl');
}

function cursorPath(): string {
  return path.join(app.getPath('userData'), 'sync', 'braindump.cursor.json');
}

export function clientIdPath(): string {
  return path.join(app.getPath('userData'), 'sync', 'client-id');
}

export function getClientId(): string {
  const p = clientIdPath();
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const id = 'cli_' + crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, id);
  return id;
}

let lamport = 0;
function nextLamport(): number {
  lamport = Math.max(lamport + 1, Date.now());
  return lamport;
}

export function enqueueOp(kind: string, payload: unknown): OutboxOp {
  const op: OutboxOp = {
    id: crypto.randomUUID(),
    clientId: getClientId(),
    lamport: nextLamport(),
    kind,
    payload,
    appliedAt: Date.now()
  };
  fs.appendFileSync(outboxPath(), JSON.stringify(op) + '\n');
  return op;
}

export function readOutbox(limit = 200): OutboxOp[] {
  if (!fs.existsSync(outboxPath())) return [];
  const lines = fs.readFileSync(outboxPath(), 'utf8').split('\n').filter(Boolean);
  const out: OutboxOp[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l) as OutboxOp);
    } catch {
      // skip
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function dropFromOutbox(opIds: Set<string>): void {
  if (!fs.existsSync(outboxPath())) return;
  const lines = fs
    .readFileSync(outboxPath(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => {
      try {
        const op = JSON.parse(l) as OutboxOp;
        return !opIds.has(op.id);
      } catch {
        return false;
      }
    });
  fs.writeFileSync(outboxPath(), lines.length ? lines.join('\n') + '\n' : '');
}

export function outboxDepth(): number {
  if (!fs.existsSync(outboxPath())) return 0;
  return fs.readFileSync(outboxPath(), 'utf8').split('\n').filter(Boolean).length;
}

export function getCursor(): number {
  const p = cursorPath();
  if (!fs.existsSync(p)) return 0;
  try {
    return Number(JSON.parse(fs.readFileSync(p, 'utf8')).sinceSeq ?? 0);
  } catch {
    return 0;
  }
}

export function setCursor(seq: number): void {
  fs.mkdirSync(path.dirname(cursorPath()), { recursive: true });
  fs.writeFileSync(cursorPath(), JSON.stringify({ sinceSeq: seq }));
}
