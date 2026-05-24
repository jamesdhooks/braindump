import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BrowserWindow, app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getState } from '../store';
import {
  RUNNERS,
  type RunnerCliConfig,
  type RunnerEvent,
  type RunnerId,
  type RunnerInfo,
  type RunnerRunInput,
  type RunnerSessionSnapshot,
  type RunnerStatus
} from './types';
import type { ClawJobArtifact, ClawJobEvent } from '../../src/types';
import { REPORT_SYSTEM_INSTRUCTION } from '../../src/claw/parseJobReport';

const execFileP = promisify(execFile);

const IS_WINDOWS = process.platform === 'win32';

/**
 * On Windows, npm global CLIs are `.cmd` wrappers.  `execFile`/`spawn` can't
 * run them without a shell, but `shell: true` breaks paths that contain spaces
 * (cmd.exe splits on the space before the arg list).
 *
 * Safe strategy:
 *  - Use `where.exe` to resolve the full path so the UI shows something useful.
 *  - If the resolved path ends in `.cmd`, invoke it as
 *    `cmd.exe /c "<path>" [args]` — cmd.exe receives the path as a single
 *    quoted token and handles the .cmd dispatch itself, no shell:true needed.
 *  - If it's already an `.exe`, run it directly.
 */
async function resolveDisplayBinary(base: string): Promise<string> {
  if (!IS_WINDOWS) return base;
  try {
    const { stdout } = await execFileP('where.exe', [base], { timeout: 2000, windowsHide: true });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => l.endsWith('.cmd') || l.endsWith('.exe')) ?? lines[0] ?? base;
  } catch {
    return base;
  }
}

/**
 * Returns [resolvedBinary, resolvedArgs] ready for `execFile`/`spawn`
 * without `shell: true`.  On Windows, `.cmd` files are routed through
 * `cmd.exe /c` so spaces in the path don't get misinterpreted.
 */
function winWrap(binary: string, args: string[]): [string, string[]] {
  if (IS_WINDOWS && binary.toLowerCase().endsWith('.cmd')) {
    return ['cmd.exe', ['/c', binary, ...args]];
  }
  return [binary, args];
}

type ActiveSession = {
  sessionId: string;
  runnerId: RunnerId;
  tabId: string;
  groupId: string;
  binary: string;
  args: string[];
  prompt: string;
  system?: string;
  cwd: string;
  complexity?: 'simple' | 'complex' | 'crazy';
  complexitySource?: 'manual' | 'automatic';
  proc: ChildProcessWithoutNullStreams;
  startedAt: number;
  gitBaselinePromise: Promise<GitSnapshot | null>;
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
  summary?: string;
  endedAt?: number;
  state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
};

type GitSnapshot = {
  entries: Map<string, { status: string; hash: string | null }>;
};

const active = new Map<string, ActiveSession>();
const sessions = new Map<string, RunnerSessionSnapshot>();
let mainWindow: BrowserWindow | null = null;

export function attachWindow(w: BrowserWindow) {
  mainWindow = w;
}

function emit(ev: RunnerEvent) {
  mainWindow?.webContents.send('runner:event', ev);
}

function cloneEvent(event: ClawJobEvent): ClawJobEvent {
  return JSON.parse(JSON.stringify(event)) as ClawJobEvent;
}

function cloneArtifact(artifact: ClawJobArtifact): ClawJobArtifact {
  return JSON.parse(JSON.stringify(artifact)) as ClawJobArtifact;
}

function rememberSession(session: RunnerSessionSnapshot) {
  sessions.set(session.sessionId, session);
  if (sessions.size <= 80) return;
  const terminal = Array.from(sessions.values())
    .filter((entry) => entry.state !== 'running' && entry.state !== 'waiting-input')
    .sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));
  while (sessions.size > 80 && terminal.length > 0) {
    const stale = terminal.shift();
    if (stale) sessions.delete(stale.sessionId);
  }
}

function info(id: RunnerId): RunnerInfo {
  const f = RUNNERS.find((r) => r.id === id);
  if (!f) throw new Error(`Unknown runner ${id}`);
  return f;
}

function configFor(id: RunnerId): RunnerCliConfig {
  const cfg = getState().runners ?? {};
  const map: Record<RunnerId, keyof NonNullable<typeof cfg>> = {
    'claude-cli': 'claudeCli',
    'copilot-cli': 'copilotCli'
  };
  return (cfg[map[id]] as RunnerCliConfig | undefined) ?? { enabled: false };
}

function resolveBinary(id: RunnerId): string {
  const cfg = configFor(id);
  if (cfg.binaryPath && fs.existsSync(cfg.binaryPath)) {
    if (id === 'copilot-cli') {
      const base = path.basename(cfg.binaryPath).toLowerCase();
      if (base === 'gh' || base === 'gh.exe' || base === 'gh.cmd') {
        return info(id).defaultBinary;
      }
    }
    return cfg.binaryPath;
  }
  return info(id).defaultBinary;
}

function formatRunnerProbeError(id: RunnerId, err: unknown): string {
  const message = String((err as Error).message ?? err);
  if (id === 'claude-cli' && /enoent/i.test(message)) {
    return 'Claude Code CLI is not installed or not on PATH. Install it with `npm install -g @anthropic-ai/claude-code`, or set a Binary path below.';
  }
  if (id === 'copilot-cli' && /enoent/i.test(message)) {
    return 'GitHub Copilot CLI is not installed or not on PATH. Install it from https://github.com/github/copilot-cli, then click Re-detect.';
  }
  if (id === 'copilot-cli' && /gh-copilot extension has been deprecated|deprecated in favor of the newer github copilot cli/i.test(message)) {
    return 'The legacy `gh copilot` extension is deprecated. Use the standalone `copilot` CLI binary instead.';
  }
  return message.slice(0, 200);
}

function defaultClaudeModelFor(complexity: 'simple' | 'complex' | 'crazy'): string {
  switch (complexity) {
    case 'simple':
      return 'claude-sonnet-4-6';
    case 'crazy':
      return 'claude-opus-4-7';
    case 'complex':
    default:
      return 'claude-sonnet-4-6';
  }
}

export async function listRunners(): Promise<RunnerStatus[]> {
  return Promise.all(
    RUNNERS.map(async (r): Promise<RunnerStatus> => {
      const cfg = configFor(r.id);
      const binaryBase = resolveBinary(r.id);
      const binary = await resolveDisplayBinary(binaryBase);
      try {
        const [probeExe, probeArgs] = winWrap(binary, r.probeArgs);
        await execFileP(probeExe, probeArgs, { timeout: 4000, windowsHide: true });
        let version: string | undefined;
        if (r.versionArgs) {
          const [verExe, verArgs] = winWrap(binary, r.versionArgs);
          const { stdout } = await execFileP(verExe, verArgs, { timeout: 4000, windowsHide: true });
          version = stdout.split('\n')[0]?.trim() || undefined;
        }
        return { id: r.id, enabled: cfg.enabled, available: true, binary, version };
      } catch (err) {
        return {
          id: r.id,
          enabled: cfg.enabled,
          available: false,
          binary,
          error: formatRunnerProbeError(r.id, err)
        };
      }
    })
  );
}

function buildArgs(id: RunnerId, input: RunnerRunInput): string[] {
  const cfg = configFor(id);
  const complexity = input.complexity ?? 'complex';
  const model = id === 'claude-cli'
    ? cfg.model?.[complexity] ?? defaultClaudeModelFor(complexity)
    : input.complexity
      ? cfg.model?.[input.complexity]
      : undefined;
  const extra = cfg.extraArgs ?? [];
  if (id === 'claude-cli') {
    // Deliver prompt + system context via stdin to avoid Windows cmd.exe arg-quoting
    // issues with long strings containing special characters.
    // --print = non-interactive mode. --dangerously-skip-permissions = autonomous file edits.
    const args = ['--print', '--dangerously-skip-permissions'];
    if (model) args.push('--model', model);
    return [...args, ...extra];
  }
  if (id === 'copilot-cli') {
    // Current Copilot CLI uses global `--prompt` in non-interactive mode.
    const fullPrompt = input.system
      ? `[CONTEXT]\n${input.system}\n\n${REPORT_SYSTEM_INSTRUCTION}\n\n[TASK]\n${input.prompt}`
      : `${REPORT_SYSTEM_INSTRUCTION}\n\n[TASK]\n${input.prompt}`;
    return ['--allow-all-tools', '--prompt', fullPrompt, ...extra];
  }
  return [];
}

function pushEvent(sessionId: string, event: ClawJobEvent) {
  const live = active.get(sessionId);
  if (live) {
    live.events.push(cloneEvent(event));
    if (event.kind === 'status') {
      live.state = event.state;
    }
  }
  const snapshot = sessions.get(sessionId);
  if (snapshot) {
    snapshot.events.push(cloneEvent(event));
    if (event.kind === 'status') {
      snapshot.state = event.state;
    }
  }
  emit({ kind: 'job-event', sessionId, event });
}

async function collectGitSnapshot(cwd: string): Promise<GitSnapshot | null> {
  try {
    await execFileP('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 2000, windowsHide: true });
  } catch {
    return null;
  }

  let stdout = '';
  try {
    ({ stdout } = await execFileP('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd,
      timeout: 4000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024
    }));
  } catch {
    return null;
  }

  const entries = new Map<string, { status: string; hash: string | null }>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const status = line.slice(0, 2);
    let relPath = line.length > 3 ? line.slice(3) : '';
    if (relPath.includes(' -> ')) relPath = relPath.split(' -> ').pop() ?? relPath;
    relPath = relPath.trim();
    if (!relPath) continue;
    const absPath = path.join(cwd, relPath);
    let hash: string | null = null;
    try {
      const st = fs.statSync(absPath);
      if (st.isFile()) {
        const buf = fs.readFileSync(absPath);
        hash = crypto.createHash('sha1').update(buf).digest('hex');
      }
    } catch {
      hash = null;
    }
    entries.set(relPath, { status, hash });
  }
  return { entries };
}

function actionFromStatus(status: string | undefined): 'created' | 'modified' | 'deleted' {
  if (!status) return 'modified';
  if (status.includes('?') || status.includes('A')) return 'created';
  if (status.includes('D')) return 'deleted';
  return 'modified';
}

async function collectGitArtifacts(cwd: string, baseline: GitSnapshot | null): Promise<ClawJobArtifact[]> {
  const after = await collectGitSnapshot(cwd);
  if (!after) return [];

  const beforeEntries = baseline?.entries ?? new Map<string, { status: string; hash: string | null }>();
  const changed = new Set<string>();

  for (const [p, afterEntry] of after.entries) {
    const beforeEntry = beforeEntries.get(p);
    if (!beforeEntry) {
      changed.add(p);
      continue;
    }
    if (beforeEntry.status !== afterEntry.status || beforeEntry.hash !== afterEntry.hash) {
      changed.add(p);
    }
  }

  const artifacts: ClawJobArtifact[] = [];
  const changedPaths = Array.from(changed).slice(0, 30);
  for (const relPath of changedPaths) {
    const status = after.entries.get(relPath)?.status;
    const action = actionFromStatus(status);
    artifacts.push({
      id: `runner-file:${relPath}`,
      kind: 'file',
      path: relPath,
      action
    });

    if (action === 'created') continue;

    try {
      const { stdout } = await execFileP('git', ['diff', '--', relPath], {
        cwd,
        timeout: 6000,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024
      });
      const unifiedDiff = stdout.trim();
      if (unifiedDiff) {
        artifacts.push({
          id: `runner-diff:${relPath}`,
          kind: 'diff',
          path: relPath,
          action,
          unifiedDiff: unifiedDiff.slice(0, 40000)
        });
      }
    } catch {
      // non-fatal: if diff fails we still keep the file artifact.
    }
  }

  return artifacts;
}

export function runRunner(input: RunnerRunInput): { sessionId: string } {
  const cfg = configFor(input.runnerId);
  if (!cfg.enabled) throw new Error(`Runner ${input.runnerId} is not enabled`);
  const sessionId = crypto.randomUUID();
  const complexity = input.complexity ?? 'complex';
  const complexitySource = input.complexitySource ?? (input.complexity ? 'manual' : 'automatic');
  const binaryBase = resolveBinary(input.runnerId);
  const rawArgs = buildArgs(input.runnerId, input);
  // For the synchronous spawn path, look for a .cmd alongside the base name
  // (covers npm global CLIs installed via nvm/nodeenv). If not found, fall
  // back to the bare name and let PATH resolution handle it.
  const npmCmdPath = IS_WINDOWS
    ? (() => {
        // e.g. "claude" → check common npm bin dirs for claude.cmd
        const npmBin = process.env.npm_config_prefix
          ? path.join(process.env.npm_config_prefix, binaryBase + '.cmd')
          : null;
        const appDataCmd = process.env.APPDATA
          ? path.join(process.env.APPDATA, 'npm', binaryBase + '.cmd')
          : null;
        for (const p of [npmBin, appDataCmd]) {
          if (p && fs.existsSync(p)) return p;
        }
        return null;
      })()
    : null;
  const binary = npmCmdPath ?? binaryBase;
  const [spawnExe, args] = winWrap(binary, rawArgs);
  const cwd = input.cwd && fs.existsSync(input.cwd) ? input.cwd : process.cwd();

  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(spawnExe, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err).slice(0, 200);
    queueMicrotask(() => {
      emit({
        kind: 'started',
        sessionId,
        tabId: input.tabId,
        groupId: input.groupId,
        runnerId: input.runnerId,
        binary,
        args: rawArgs,
        prompt: input.prompt,
        system: input.system,
        cwd,
        complexity,
        complexitySource
      });
      pushEvent(sessionId, { at: Date.now(), kind: 'log', level: 'error', text: `Spawn failed: ${msg}` });
      pushEvent(sessionId, { at: Date.now(), kind: 'status', state: 'error' });
      emit({ kind: 'done', sessionId, ok: false, exitCode: null, summary: `Spawn failed: ${msg}` });
    });
    return { sessionId };
  }

  const gitBaselinePromise = collectGitSnapshot(cwd);
  const startedAt = Date.now();
  const liveSession: ActiveSession = {
    sessionId,
    runnerId: input.runnerId,
    tabId: input.tabId,
    groupId: input.groupId,
    binary,
    args: rawArgs,
    prompt: input.prompt,
    system: input.system,
    cwd,
    complexity,
    complexitySource,
    proc,
    startedAt,
    gitBaselinePromise,
    events: [],
    artifacts: [],
    state: 'running'
  };
  active.set(sessionId, liveSession);
  rememberSession({
    sessionId,
    runnerId: input.runnerId,
    tabId: input.tabId,
    groupId: input.groupId,
    binary,
    args: rawArgs,
    prompt: input.prompt,
    system: input.system,
    cwd,
    complexity,
    complexitySource,
    startedAt,
    state: 'running',
    events: [],
    artifacts: []
  });

  emit({
    kind: 'started',
    sessionId,
    tabId: input.tabId,
    groupId: input.groupId,
    runnerId: input.runnerId,
    binary,
    args: rawArgs,
    prompt: input.prompt,
    system: input.system,
    cwd,
    complexity,
    complexitySource
  });
  pushEvent(sessionId, { at: Date.now(), kind: 'status', state: 'running' });

  // For claude-cli: deliver the full prompt via stdin to avoid Windows cmd.exe
  // argument-quoting issues with long strings and special characters.
  if (input.runnerId === 'claude-cli') {
    const stdinPayload = input.system
      ? `${input.system}\n\n${REPORT_SYSTEM_INSTRUCTION}\n\n---\n\n${input.prompt}\n`
      : `${REPORT_SYSTEM_INSTRUCTION}\n\n---\n\n${input.prompt}\n`;
    proc.stdin.write(stdinPayload, 'utf8');
    proc.stdin.end();
  }

  const logFile = path.join(app.getPath('userData'), `runner-${input.runnerId}.log`);
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] start ${binary} ${rawArgs.join(' ')}\n`);
  } catch {
    // non-fatal
  }

  const writeLog = (level: 'info' | 'warn' | 'error', text: string) => {
    pushEvent(sessionId, { at: Date.now(), kind: 'log', level, text });
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${level} ${text}\n`);
    } catch {
      // ignore
    }
  };

  let stdoutBuf = '';
  let stderrBuf = '';
  let outputCollected = '';

  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', (chunk: string) => {
    outputCollected += chunk;
    stdoutBuf += chunk;
    let idx: number;
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx).replace(/\r$/, '');
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (line.length > 0) writeLog('info', line);
    }
  });
  proc.stderr.on('data', (chunk: string) => {
    stderrBuf += chunk;
    let idx: number;
    while ((idx = stderrBuf.indexOf('\n')) !== -1) {
      const line = stderrBuf.slice(0, idx).replace(/\r$/, '');
      stderrBuf = stderrBuf.slice(idx + 1);
      if (line.length > 0) writeLog('warn', line);
    }
  });

  proc.on('error', (err) => {
    writeLog('error', `Process error: ${String(err).slice(0, 200)}`);
  });
  proc.on('exit', async (code) => {
    if (stdoutBuf.trim()) writeLog('info', stdoutBuf.trim());
    if (stderrBuf.trim()) writeLog('warn', stderrBuf.trim());
    const ok = code === 0;
    pushEvent(sessionId, { at: Date.now(), kind: 'status', state: ok ? 'done' : 'error' });
    const session = active.get(sessionId);
    const baseline = session ? await session.gitBaselinePromise.catch(() => null) : null;
    const artifacts = await collectGitArtifacts(cwd, baseline).catch(() => [] as ClawJobArtifact[]);
    const baseSummary = outputCollected.trim().split('\n').slice(-3).join(' ').slice(0, 240) || (ok ? 'Done.' : `Exit ${code}`);
    const summary = artifacts.length ? `${baseSummary} (${artifacts.length} artifacts)` : baseSummary;
    const endedAt = Date.now();
    if (session) {
      session.state = ok ? 'done' : 'error';
      session.endedAt = endedAt;
      session.summary = summary;
      session.artifacts.push(...artifacts.map((artifact) => cloneArtifact(artifact)));
    }
    const snapshot = sessions.get(sessionId);
    if (snapshot) {
      snapshot.state = ok ? 'done' : 'error';
      snapshot.endedAt = endedAt;
      snapshot.summary = summary;
      snapshot.artifacts = [
        ...snapshot.artifacts,
        ...artifacts
          .filter((artifact) => !snapshot.artifacts.find((existing) => existing.id === artifact.id))
          .map((artifact) => cloneArtifact(artifact))
      ];
    }
    emit({ kind: 'done', sessionId, ok, exitCode: code, summary, artifacts });
    active.delete(sessionId);
  });

  return { sessionId };
}

export function recoverRunnerSessions(): RunnerSessionSnapshot[] {
  return Array.from(sessions.values()).map((session) => ({
    ...session,
    args: [...session.args],
    events: session.events.map((event) => cloneEvent(event)),
    artifacts: session.artifacts.map((artifact) => cloneArtifact(artifact))
  }));
}

export function interruptRunner(sessionId: string): boolean {
  const s = active.get(sessionId);
  if (!s) return false;
  try {
    s.proc.kill();
  } catch {
    // ignore
  }
  return true;
}

export function interruptAllRunners(): void {
  for (const s of active.values()) {
    try {
      s.proc.kill();
    } catch {
      // ignore
    }
  }
}
