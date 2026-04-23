#!/usr/bin/env node
/**
 * OpenClaw shim — local fallback broker.
 *
 * Speaks the Claw NDJSON protocol on stdin/stdout. If the `claude` CLI is on
 * PATH, it routes sessions there in stream-json mode. Otherwise it runs an
 * "echo" backend that demonstrates the protocol loop end-to-end without any
 * external dependency, so the Braindump app has working Claw integration
 * out of the box.
 */

'use strict';

const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

let seq = 0;
const nextSeq = () => ++seq;

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function log(sessionId, level, text) {
  send({ seq: nextSeq(), type: 'log', sessionId, level, text });
}

function hasClaude() {
  try {
    require('node:child_process').execSync('claude --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const CLAUDE_AVAILABLE = hasClaude();

send({
  seq: nextSeq(),
  type: 'welcome',
  clawVersion: '0.1.0-shim',
  backends: CLAUDE_AVAILABLE ? ['claude-code', 'echo'] : ['echo'],
  skills: ['braindump-standards', 'braindump-diffs', 'braindump-scope-guard']
});

const sessions = new Map();

function startEchoSession(id, content) {
  const tokens = [
    `Got your instructions for session ${id.slice(0, 6)}.`,
    'I would normally delegate this to a real backend.',
    'Returning a plan now so the protocol round-trip is demonstrable.'
  ];
  for (const t of tokens) {
    send({ seq: nextSeq(), type: 'thinking', sessionId: id, text: t });
  }
  const artId = `art_${id.slice(0, 4)}_${Date.now()}`;
  send({
    seq: nextSeq(),
    type: 'tool-call',
    sessionId: id,
    tool: 'write_plan',
    args: { goal: content.slice(0, 120) },
    id: artId
  });
  send({
    seq: nextSeq(),
    type: 'tool-result',
    sessionId: id,
    id: artId,
    ok: true,
    text: 'Plan produced.',
    artifacts: [
      {
        id: artId,
        kind: 'text',
        title: 'Plan',
        text: `1. Read the goal\n2. Identify constraints\n3. Stub an implementation\n4. Return to the human for review.`
      }
    ]
  });
  send({
    seq: nextSeq(),
    type: 'done',
    sessionId: id,
    summary: 'Echo-backend produced a stub plan.',
    metrics: { durationMs: 50, tokensIn: 0, tokensOut: 0, files: 0, diffs: 0 }
  });
}

function startClaudeSession(id, opts) {
  const args = ['--output-format', 'stream-json', '--cwd', opts.cwd];
  const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  sessions.set(id, proc);

  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => log(id, 'warn', String(chunk).slice(0, 500)));

  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const evt = JSON.parse(t);
        translateClaudeEvent(id, evt);
      } catch (e) {
        log(id, 'warn', `non-json line from claude: ${t.slice(0, 200)}`);
      }
    }
  });

  proc.on('exit', (code) => {
    sessions.delete(id);
    send({
      seq: nextSeq(),
      type: 'done',
      sessionId: id,
      summary: `Session ended with code ${code}.`,
      metrics: { durationMs: 0, tokensIn: 0, tokensOut: 0, files: 0, diffs: 0 }
    });
  });
}

function translateClaudeEvent(sessionId, evt) {
  if (!evt || typeof evt !== 'object') return;
  switch (evt.type) {
    case 'assistant':
    case 'text':
      send({ seq: nextSeq(), type: 'thinking', sessionId, text: String(evt.text ?? evt.delta ?? '') });
      break;
    case 'tool_use':
      send({
        seq: nextSeq(),
        type: 'tool-call',
        sessionId,
        tool: evt.name ?? 'tool',
        args: evt.input ?? {},
        id: evt.id ?? `t_${Date.now()}`
      });
      break;
    case 'tool_result':
      send({
        seq: nextSeq(),
        type: 'tool-result',
        sessionId,
        id: evt.id ?? `r_${Date.now()}`,
        ok: !evt.is_error,
        text: String(evt.content ?? '').slice(0, 2000)
      });
      break;
    case 'message_stop':
      send({
        seq: nextSeq(),
        type: 'done',
        sessionId,
        summary: 'Session completed.',
        metrics: { durationMs: 0, tokensIn: 0, tokensOut: 0, files: 0, diffs: 0 }
      });
      break;
    default:
      send({ seq: nextSeq(), type: 'log', sessionId, level: 'info', text: `claude: ${evt.type}` });
  }
}

const sessionMeta = new Map();

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  try {
    handleInbound(msg);
  } catch (err) {
    send({
      seq: nextSeq(),
      type: 'log',
      sessionId: msg.sessionId ?? 'global',
      level: 'error',
      text: `shim error: ${String(err).slice(0, 200)}`
    });
  }
});

function handleInbound(msg) {
  switch (msg.type) {
    case 'hello':
      // already sent welcome; client reconnects are welcome
      break;
    case 'ping':
      send({ seq: nextSeq(), type: 'pong' });
      break;
    case 'start-session':
      sessionMeta.set(msg.sessionId, { backend: msg.backend, cwd: msg.cwd, skills: msg.skills });
      send({ seq: nextSeq(), type: 'status', sessionId: msg.sessionId, state: 'running' });
      break;
    case 'message': {
      const meta = sessionMeta.get(msg.sessionId);
      const backend = meta?.backend ?? 'echo';
      if (backend === 'claude-code' && CLAUDE_AVAILABLE) {
        if (!sessions.has(msg.sessionId)) {
          startClaudeSession(msg.sessionId, { cwd: meta?.cwd ?? process.cwd() });
        }
        const proc = sessions.get(msg.sessionId);
        if (proc) proc.stdin.write(msg.content + '\n');
      } else {
        startEchoSession(msg.sessionId, msg.content);
      }
      break;
    }
    case 'reply': {
      const proc = sessions.get(msg.sessionId);
      if (proc) proc.stdin.write(msg.text + '\n');
      break;
    }
    case 'interrupt': {
      const proc = sessions.get(msg.sessionId);
      if (proc) {
        try {
          proc.kill('SIGINT');
        } catch {
          // ignore
        }
      }
      sessions.delete(msg.sessionId);
      send({ seq: nextSeq(), type: 'status', sessionId: msg.sessionId, state: 'done' });
      break;
    }
    case 'end-session': {
      const proc = sessions.get(msg.sessionId);
      if (proc) {
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }
      sessions.delete(msg.sessionId);
      sessionMeta.delete(msg.sessionId);
      break;
    }
    default:
      break;
  }
}

process.on('SIGTERM', () => {
  for (const [, proc] of sessions) {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
});
