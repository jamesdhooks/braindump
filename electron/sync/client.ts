import { BrowserWindow } from 'electron';
import { getSecret, setSecret, deleteSecret } from '../secrets';
import { dropFromOutbox, enqueueOp, getCursor, outboxDepth, readOutbox, setCursor } from './outbox';

type SyncSettings = {
  serverUrl: string;
  deviceId?: string;
  signedInEmail?: string;
};

type SyncStatus = {
  configured: boolean;
  online: boolean;
  lastPush?: number;
  lastPull?: number;
  outboxDepth: number;
  error?: string;
};

const SETTINGS_KEY = 'sync.settings';
const TOKEN_KEY = 'sync.deviceToken';

function readSettings(): SyncSettings {
  const raw = getSecret(SETTINGS_KEY);
  if (!raw) return { serverUrl: 'http://localhost:3001' };
  try {
    return JSON.parse(raw) as SyncSettings;
  } catch {
    return { serverUrl: 'http://localhost:3001' };
  }
}

function writeSettings(s: SyncSettings): void {
  setSecret(SETTINGS_KEY, JSON.stringify(s));
}

function token(): string | null {
  return getSecret(TOKEN_KEY) ?? null;
}

let status: SyncStatus = { configured: false, online: false, outboxDepth: 0 };
let flushTimer: ReturnType<typeof setInterval> | null = null;
let mainWindow: BrowserWindow | null = null;
let abortPull: AbortController | null = null;

function broadcast(): void {
  status = { ...status, outboxDepth: outboxDepth() };
  mainWindow?.webContents.send('sync:status', status);
}

export function attachWindow(w: BrowserWindow): void {
  mainWindow = w;
}

export function currentSettings(): SyncSettings {
  return readSettings();
}

export function currentStatus(): SyncStatus {
  return { ...status, outboxDepth: outboxDepth(), configured: Boolean(token()) };
}

export async function signIn(args: { serverUrl: string; email: string; password: string; deviceName: string }) {
  const base = args.serverUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/v1/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: args.email, password: args.password })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'failed' }));
    throw new Error(body.error ?? 'signin failed');
  }
  const cookies = res.headers.get('set-cookie') ?? '';
  const devRes = await fetch(`${base}/v1/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookies },
    body: JSON.stringify({ name: args.deviceName })
  });
  if (!devRes.ok) throw new Error('device registration failed');
  const body = (await devRes.json()) as { deviceId: string; token: string; spaceId: string };
  writeSettings({ serverUrl: base, deviceId: body.deviceId, signedInEmail: args.email });
  setSecret(TOKEN_KEY, body.token);
  status = { ...status, configured: true };
  broadcast();
  startFlusher();
}

export function signOut(): void {
  deleteSecret(TOKEN_KEY);
  stopFlusher();
  status = { configured: false, online: false, outboxDepth: outboxDepth() };
  broadcast();
}

export function enqueue(kind: string, payload: unknown): void {
  if (!token()) return;
  enqueueOp(kind, payload);
  broadcast();
}

async function flush(): Promise<void> {
  const tok = token();
  if (!tok) return;
  const settings = readSettings();
  const ops = readOutbox(100);
  if (ops.length === 0) {
    await pull();
    return;
  }
  try {
    const res = await fetch(`${settings.serverUrl}/v1/ops/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-token': tok },
      body: JSON.stringify({ ops })
    });
    if (!res.ok) throw new Error(`push failed: ${res.status}`);
    const body = (await res.json()) as { accepted: { opId: string; seq: number }[] };
    const accepted = new Set(body.accepted.map((a) => a.opId));
    dropFromOutbox(accepted);
    const maxSeq = body.accepted.reduce((m, a) => Math.max(m, a.seq), 0);
    if (maxSeq) setCursor(Math.max(getCursor(), maxSeq));
    status = { ...status, online: true, lastPush: Date.now(), error: undefined };
    broadcast();
  } catch (err) {
    status = { ...status, online: false, error: String(err).slice(0, 200) };
    broadcast();
  }
  await pull();
}

async function pull(): Promise<void> {
  const tok = token();
  if (!tok) return;
  const settings = readSettings();
  try {
    const url = `${settings.serverUrl}/v1/ops/pull?sinceSeq=${getCursor()}`;
    abortPull?.abort();
    abortPull = new AbortController();
    const res = await fetch(url, { headers: { 'x-device-token': tok }, signal: abortPull.signal });
    if (!res.ok) throw new Error(`pull failed: ${res.status}`);
    const body = (await res.json()) as { ops: { seq: number }[] };
    if (body.ops.length) {
      mainWindow?.webContents.send('sync:ops', body.ops);
      const maxSeq = body.ops.reduce((m, o) => Math.max(m, o.seq), 0);
      setCursor(maxSeq);
    }
    status = { ...status, online: true, lastPull: Date.now(), error: undefined };
    broadcast();
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return;
    status = { ...status, online: false, error: String(err).slice(0, 200) };
    broadcast();
  }
}

export function startFlusher(): void {
  stopFlusher();
  if (!token()) return;
  void flush();
  flushTimer = setInterval(() => void flush(), 5000);
}

export function stopFlusher(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  abortPull?.abort();
}

export async function resetAndRepull(): Promise<void> {
  setCursor(0);
  await pull();
}
