import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { BrowserWindow, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  encode,
  parseNdjson,
  type ClawToClient,
  type ClientToClaw,
  type ClawMessage
} from '../../packages/claw/protocol';
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

class ClawBroker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private seq = 0;
  private state: BrokerState = { status: 'disconnected', backends: [], skills: [], transport: 'none', sessions: [] };
  private mainWindow: BrowserWindow | null = null;
  private logFile = path.join(app.getPath('userData'), 'claw.log');
  private sessions = new Set<string>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;

  attachWindow(w: BrowserWindow) {
    this.mainWindow = w;
  }

  getState(): BrokerState {
    return { ...this.state, sessions: Array.from(this.sessions) };
  }

  private logRaw(direction: 'in' | 'out', text: string) {
    try {
      fs.appendFileSync(this.logFile, `[${new Date().toISOString()}] ${direction} ${text.trim()}\n`);
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
        this.state = { ...this.state, status: 'disconnected' };
        this.sessions.clear();
        this.stopHealthCheck();
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
    try {
      this.proc.kill();
    } catch {
      // ignore
    }
    this.proc = null;
    this.sessions.clear();
    this.stopHealthCheck();
    this.state = { ...this.state, status: 'disconnected' };
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

  startSession(sessionId: string, backend: string, cwd: string, skills: string[], system?: string) {
    this.sessions.add(sessionId);
    this.send({ seq: ++this.seq, type: 'start-session', sessionId, backend, cwd, skills, system });
    this.broadcastState();
  }

  endSession(sessionId: string) {
    if (!this.sessions.has(sessionId)) return;
    this.send({ seq: ++this.seq, type: 'end-session', sessionId });
    this.sessions.delete(sessionId);
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
    this.send({ seq: ++this.seq, type: 'message', sessionId, content });
  }

  reply(sessionId: string, promptId: string, text: string) {
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
      this.broadcastState();
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
