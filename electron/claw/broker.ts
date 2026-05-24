import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ClawJobArtifact, ClawJobEvent } from '../../src/types';
import {
  encode,
  parseNdjson,
  type ClawToClient,
  type ClientToClaw,
  type ClawMessage
} from '../../packages/claw/protocol';
import {
  loadRecoverySnapshots,
  writeRecoverySnapshots,
  writeRecoverySnapshotsSync
} from '../persistence';
import { getState } from '../store';

type BrokerStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type BrokerState = {
  status: BrokerStatus;
  clawVersion?: string;
  backends: string[];
  skills: string[];
  transport: 'stdio' | 'none';
  binary?: string;
  lastError?: string;
  sessions: string[];
};

type SessionRecoveryRecord = {
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
  state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
  summary?: string;
  metrics?: { durationMs: number; tokensIn: number; tokensOut: number; files: number; diffs: number };
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
  pendingPrompts: { promptId: string; question: string; options?: string[] }[];
};

const RECOVERY_FILE = 'claw-sessions';
const LOST_SESSION_SUMMARY =
  'This code session was interrupted because Braindump closed or restarted before it could finish. Use Continue to resume from the saved context.';

class ClawBroker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private seq = 0;
  private state: BrokerState = { status: 'disconnected', backends: [], skills: [], transport: 'none', sessions: [] };
  private mainWindow: BrowserWindow | null = null;
  private sessions = new Set<string>();
  private records = new Map<string, SessionRecoveryRecord>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPong = 0;

  private getLogFile(): string {
    return path.join(app.getPath('userData'), 'claw.log');
  }

  attachWindow(w: BrowserWindow) {
    this.mainWindow = w;
  }

  getState(): BrokerState {
    return { ...this.state, sessions: Array.from(this.sessions) };
  }

  private logRaw(direction: 'in' | 'out', text: string) {
    try {
      fs.appendFileSync(this.getLogFile(), `[${new Date().toISOString()}] ${direction} ${text.trim()}\n`);
    } catch {
      // non-fatal
    }
  }

  private broadcastState() {
    this.mainWindow?.webContents.send('claw:state', this.getState());
  }

  private broadcastMessage(m: ClawToClient) {
    this.mainWindow?.webContents.send('claw:message', m);
  }

  private rememberRecord(record: SessionRecoveryRecord) {
    this.records.set(record.sessionId, record);
    if (this.records.size <= 80) return;
    const terminal = Array.from(this.records.values())
      .filter((entry) => entry.state !== 'running' && entry.state !== 'waiting-input')
      .sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));
    while (this.records.size > 80 && terminal.length > 0) {
      const stale = terminal.shift();
      if (stale) this.records.delete(stale.sessionId);
    }
  }

  private cloneEvent(event: ClawJobEvent): ClawJobEvent {
    return JSON.parse(JSON.stringify(event)) as ClawJobEvent;
  }

  private cloneArtifact(artifact: ClawJobArtifact): ClawJobArtifact {
    return JSON.parse(JSON.stringify(artifact)) as ClawJobArtifact;
  }

  private cloneRecord(record: SessionRecoveryRecord): SessionRecoveryRecord {
    return {
      ...record,
      skills: [...record.skills],
      events: record.events.map((event) => this.cloneEvent(event)),
      artifacts: record.artifacts.map((artifact) => this.cloneArtifact(artifact)),
      pendingPrompts: record.pendingPrompts.map((prompt) => ({
        ...prompt,
        options: prompt.options ? [...prompt.options] : undefined
      }))
    };
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void writeRecoverySnapshots(RECOVERY_FILE, this.recoverSessions());
    }, 150);
  }

  private persistNow() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    writeRecoverySnapshotsSync(RECOVERY_FILE, this.recoverSessions());
  }

  private markInterrupted(record: SessionRecoveryRecord, message: string, endedAt = Date.now()) {
    if (record.state === 'done' || record.state === 'error' || record.state === 'interrupted') return;
    record.state = 'interrupted';
    record.endedAt = record.endedAt ?? endedAt;
    record.summary = record.summary?.trim() ? record.summary : message;
    const alreadyLogged = record.events.some(
      (event) => event.kind === 'log' && event.level === 'warn' && event.text === message
    );
    if (!alreadyLogged) {
      record.events.push({ at: endedAt, kind: 'log', level: 'warn', text: message });
    }
  }

  private markAllRunningInterrupted(message: string) {
    const endedAt = Date.now();
    for (const record of this.records.values()) {
      this.markInterrupted(record, message, endedAt);
    }
  }

  hydrateRecoveryState() {
    this.records.clear();
    for (const raw of loadRecoverySnapshots<SessionRecoveryRecord>(RECOVERY_FILE)) {
      const record = this.cloneRecord(raw);
      if (record.state === 'running' || record.state === 'waiting-input') {
        this.markInterrupted(record, LOST_SESSION_SUMMARY);
      }
      this.rememberRecord(record);
    }
    this.sessions.clear();
    this.persistNow();
  }

  prepareForShutdown() {
    this.markAllRunningInterrupted(LOST_SESSION_SUMMARY);
    this.sessions.clear();
    this.persistNow();
  }

  recoverSessions(): SessionRecoveryRecord[] {
    return Array.from(this.records.values()).map((record) => this.cloneRecord(record));
  }

  private resolveBinary(): { cmd: string; args: string[] } {
    const overrideFromEnv = process.env.BRAINDUMP_CLAW_PATH;
    if (overrideFromEnv && fs.existsSync(overrideFromEnv)) {
      return { cmd: overrideFromEnv, args: [] };
    }
    const userSetting = getState().claw?.binaryPath;
    if (userSetting && fs.existsSync(userSetting)) {
      return { cmd: userSetting, args: [] };
    }
    const shimPath = app.isPackaged
      ? path.join(process.resourcesPath, 'openclaw-shim', 'index.js')
      : path.join(process.cwd(), 'resources', 'openclaw-shim', 'index.js');
    return { cmd: process.execPath, args: [shimPath] };
  }

  start(): void {
    if (this.proc) return;
    this.state = { ...this.state, status: 'connecting', lastError: undefined };
    this.broadcastState();

    const { cmd, args } = this.resolveBinary();
    try {
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
      const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
      this.proc = proc;
      this.state = { ...this.state, binary: `${cmd} ${args.join(' ')}`.trim(), transport: 'stdio' };
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
      proc.stderr.on('data', (chunk: string) => {
        this.logRaw('in', `[stderr] ${chunk}`);
      });
      proc.on('error', (err) => {
        this.state = { ...this.state, status: 'error', lastError: String(err).slice(0, 200) };
        this.broadcastState();
      });
      proc.on('exit', (code) => {
        this.logRaw('in', `[exit ${code}]`);
        this.proc = null;
        this.markAllRunningInterrupted(LOST_SESSION_SUMMARY);
        this.state = { ...this.state, status: 'disconnected' };
        this.sessions.clear();
        this.stopHealthCheck();
        this.persistNow();
        this.broadcastState();
      });

      this.send({ seq: ++this.seq, type: 'hello', clientVersion: app.getVersion() });
      this.startHealthCheck();
    } catch (err) {
      this.state = { ...this.state, status: 'error', lastError: String(err).slice(0, 200) };
      this.broadcastState();
    }
  }

  stop(): void {
    if (!this.proc) return;
    this.markAllRunningInterrupted(LOST_SESSION_SUMMARY);
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
    this.proc = null;
    this.sessions.clear();
    this.stopHealthCheck();
    this.state = { ...this.state, status: 'disconnected' };
    this.persistNow();
    this.broadcastState();
  }

  restart(): void {
    this.stop();
    setTimeout(() => this.start(), 300);
  }

  send(msg: ClientToClaw): void {
    if (!this.proc) throw new Error('Claw is not running');
    const raw = encode(msg as ClawMessage);
    this.logRaw('out', raw);
    this.proc.stdin.write(raw);
  }

  startSession(
    sessionId: string,
    backend: string,
    cwd: string,
    skills: string[],
    system?: string,
    metadata?: { tabId?: string; groupId?: string }
  ) {
    this.sessions.add(sessionId);
    this.rememberRecord({
      sessionId,
      tabId: metadata?.tabId,
      groupId: metadata?.groupId,
      backend,
      cwd,
      skills: [...skills],
      system,
      startedAt: Date.now(),
      state: 'running',
      events: [],
      artifacts: [],
      pendingPrompts: []
    });
    this.schedulePersist();
    this.send({ seq: ++this.seq, type: 'start-session', sessionId, backend, cwd, skills, system });
    this.broadcastState();
  }

  endSession(sessionId: string) {
    if (!this.sessions.has(sessionId)) return;
    this.send({ seq: ++this.seq, type: 'end-session', sessionId });
    this.sessions.delete(sessionId);
    this.schedulePersist();
    this.broadcastState();
  }

  interruptAll() {
    for (const id of this.sessions) {
      try {
        this.send({ seq: ++this.seq, type: 'interrupt', sessionId: id });
      } catch {
        // ignore
      }
    }
  }

  message(sessionId: string, content: string) {
    const record = this.records.get(sessionId);
    if (record && !record.prompt) {
      record.prompt = content;
      this.schedulePersist();
    }
    this.send({ seq: ++this.seq, type: 'message', sessionId, content });
  }

  reply(sessionId: string, promptId: string, text: string) {
    const record = this.records.get(sessionId);
    if (record) {
      record.pendingPrompts = record.pendingPrompts.filter((prompt) => prompt.promptId !== promptId);
      record.events.push({ at: Date.now(), kind: 'user-reply', promptId, text });
      record.state = 'running';
      this.schedulePersist();
    }
    this.send({ seq: ++this.seq, type: 'reply', sessionId, promptId, text });
  }

  private onStdout(chunk: string) {
    this.buffer += chunk;
    this.logRaw('in', chunk);
    const { messages, remainder } = parseNdjson<ClawToClient>(this.buffer);
    this.buffer = remainder;
    for (const m of messages) {
      this.handleInbound(m);
    }
  }

  private handleInbound(m: ClawToClient) {
    if (m.type === 'welcome') {
      this.state = {
        ...this.state,
        status: 'connected',
        clawVersion: m.clawVersion,
        backends: m.backends,
        skills: m.skills
      };
      this.broadcastState();
    } else if (m.type === 'pong') {
      this.lastPong = Date.now();
    } else if (m.type === 'done') {
      this.sessions.delete(m.sessionId);
      const record = this.records.get(m.sessionId);
      if (record) {
        record.state = 'done';
        record.endedAt = Date.now();
        record.summary = m.summary;
        record.metrics = m.metrics;
      }
      this.broadcastState();
    }
    const record = 'sessionId' in m ? this.records.get(m.sessionId) : null;
    if (record) {
      const at = Date.now();
      switch (m.type) {
        case 'log':
          record.events.push({ at, kind: 'log', level: m.level, text: m.text });
          break;
        case 'thinking':
          record.events.push({ at, kind: 'thinking', text: m.text });
          break;
        case 'tool-call':
          record.events.push({ at, kind: 'tool-call', tool: m.tool, args: m.args, id: m.id });
          break;
        case 'tool-result':
          record.events.push({ at, kind: 'tool-result', id: m.id, ok: m.ok, text: m.text });
          if (m.artifacts?.length) {
            for (const artifact of m.artifacts as ClawJobArtifact[]) {
              if (!record.artifacts.find((existing) => existing.id === artifact.id)) {
                record.artifacts.push(this.cloneArtifact(artifact));
              }
            }
          }
          break;
        case 'prompt':
          record.events.push({ at, kind: 'prompt', promptId: m.promptId, question: m.question, options: m.options });
          if (!record.pendingPrompts.find((prompt) => prompt.promptId === m.promptId)) {
            record.pendingPrompts.push({ promptId: m.promptId, question: m.question, options: m.options });
          }
          record.state = 'waiting-input';
          break;
        case 'status':
          record.events.push({ at, kind: 'status', state: m.state, progress: m.progress });
          record.state = m.state;
          break;
        default:
          break;
      }
      this.schedulePersist();
    }
    this.broadcastMessage(m);
  }

  private startHealthCheck() {
    this.stopHealthCheck();
    this.lastPong = Date.now();
    this.pingTimer = setInterval(() => {
      if (!this.proc) return;
      try {
        this.send({ seq: ++this.seq, type: 'ping' });
      } catch {
        // ignore
      }
      if (this.state.status === 'connected' && Date.now() - this.lastPong > 30_000) {
        this.state = { ...this.state, status: 'error', lastError: 'Ping timeout' };
        this.broadcastState();
      }
    }, 10_000);
  }

  private stopHealthCheck() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export const clawBroker = new ClawBroker();
