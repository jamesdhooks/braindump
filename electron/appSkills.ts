import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppSkill, AppSkillClawExecutor, AppSkillDraft, AppSkillRawExecutor } from '../src/types';
import { clawBroker } from './claw/broker';
import { listSkills, writeSkill } from './claw/skills';
import { getState } from './store';

const IS_WINDOWS = process.platform === 'win32';

export type AppSkillRunResponse =
  | {
      ok: true;
      sessionId: string;
  groupId: string;
  skillId: string;
  skillTitle: string;
      executionType: 'claw';
      backend: string;
      skillIds: string[];
      invocation: {
        binary: string;
        args: string[];
        prompt: string;
        system?: string;
        cwd?: string;
      };
    }
  | {
      ok: true;
      sessionId: string;
      groupId: string;
      skillId: string;
      skillTitle: string;
      executionType: 'raw';
      backend: string;
      skillIds: string[];
      invocation: {
        binary: string;
        args: string[];
        prompt: string;
        cwd?: string;
      };
      exitCode: number | null;
      stdout: string;
      stderr: string;
      summary: string;
    }
  | {
      ok: false;
      error: string;
    };

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'skill';
}

function ensureTitle(value: string, request: string) {
  const title = value.trim();
  if (title) return title;
  const fallbackWords = request
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 4);
  return fallbackWords.length > 0
    ? fallbackWords.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
    : 'New Skill';
}

function ensureDescription(value: string, request: string) {
  const description = value.trim();
  return description || request.trim() || 'Execute a saved Braindump skill.';
}

function normalizeCwdMode(value: string | undefined): 'active-tab-project-or-repo' | 'repo' {
  return value === 'active-tab-project-or-repo' ? 'active-tab-project-or-repo' : 'repo';
}

function uniqueName(base: string, used: Set<string>, suffix = '') {
  let attempt = `${base}${suffix}`;
  let index = 2;
  while (used.has(attempt.toLowerCase())) {
    attempt = `${base}-${index}${suffix}`;
    index += 1;
  }
  used.add(attempt.toLowerCase());
  return attempt;
}

function collectUsedSkillIds() {
  const ids = new Set<string>();
  for (const skill of getState().skills ?? []) {
    if (skill.executor.kind === 'claw') {
      ids.add(skill.executor.skillId.toLowerCase());
    }
  }
  for (const skill of listSkills()) {
    ids.add(skill.id.toLowerCase());
  }
  return ids;
}

function collectUsedSkillFiles() {
  const fileNames = new Set<string>();
  for (const skill of listSkills()) {
    fileNames.add(skill.name.toLowerCase());
  }
  for (const skill of getState().skills ?? []) {
    if (skill.executor.kind === 'claw') {
      fileNames.add(skill.executor.skillFileName.toLowerCase());
    }
  }
  return fileNames;
}

export function finalizeGeneratedAppSkill<T extends AppSkillDraft>(draft: T): T {
  const request = draft.request.trim();
  const title = ensureTitle(draft.title, request);
  const description = ensureDescription(draft.description, request);

  if (draft.executor.kind === 'raw') {
    return {
      ...draft,
      request,
      title,
      description,
      executor: {
        kind: 'raw',
        shell: draft.executor.shell === 'cmd' ? 'cmd' : 'powershell',
        command: draft.executor.command.trim() || 'Write-Host "No command configured."',
        elevated: Boolean(draft.executor.elevated),
        cwdMode: normalizeCwdMode(draft.executor.cwdMode)
      }
    } as T;
  }

  const usedIds = collectUsedSkillIds();
  const usedFiles = collectUsedSkillFiles();
  const idBase = slugify(draft.executor.skillId || title || request);
  const uniqueSkillId = uniqueName(idBase.startsWith('app-') ? idBase : `app-${idBase}`, usedIds);
  const fileBase = slugify(draft.executor.skillFileName.replace(/\.md$/i, '') || title || request);
  const uniqueFile = uniqueName(fileBase, usedFiles, '.md');

  return {
    ...draft,
    request,
    title,
    description,
    executor: {
      kind: 'claw',
      backend: draft.executor.backend?.trim() || undefined,
      skillId: uniqueSkillId,
      skillFileName: uniqueFile,
      skillInstructions:
        draft.executor.skillInstructions.trim() ||
        `Carry out the "${title}" skill carefully and report what happened.`,
      system: draft.executor.system?.trim() || undefined,
      prompt: draft.executor.prompt.trim() || `Run the "${title}" skill now.`,
      cwdMode: normalizeCwdMode(draft.executor.cwdMode)
    }
  } as T;
}

function resolveCwd(tabId: string, cwdMode: 'active-tab-project-or-repo' | 'repo') {
  if (cwdMode === 'active-tab-project-or-repo') {
    const tab = getState().tabs.find((entry) => entry.id === tabId);
    if (tab?.projectPath && fs.existsSync(tab.projectPath)) {
      return tab.projectPath;
    }
  }
  return process.cwd();
}

function toPsSingleQuoted(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function renderClawSkillMarkdown(skill: AppSkill, executor: AppSkillClawExecutor) {
  return `---
id: ${executor.skillId}
scope: claw
appliesTo: ["*"]
autoApplyBypass: false
---

# ${skill.title}

${skill.description}

${executor.skillInstructions.trim()}
`;
}

function summarizeRawExecution(stdout: string, stderr: string, exitCode: number | null) {
  const flattened = [stdout.trim(), stderr.trim()]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
  if (flattened) return flattened;
  return exitCode === 0
    ? 'Skill completed successfully.'
    : `Skill exited with code ${exitCode == null ? 'unknown' : exitCode}.`;
}

function collectProcess(binary: string, args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null; error?: string }>((resolve) => {
    let stdout = '';
    let stderr = '';
    try {
      const proc = spawn(binary, args, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      proc.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      proc.on('error', (error) => {
        resolve({ stdout, stderr, exitCode: null, error: String(error).slice(0, 240) });
      });
      proc.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode });
      });
    } catch (error) {
      resolve({ stdout, stderr, exitCode: null, error: String(error).slice(0, 240) });
    }
  });
}

async function runElevatedPowerShell(command: string, cwd: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'braindump-skill-'));
  const runnerPath = path.join(tempDir, 'run-elevated.ps1');
  const stdoutPath = path.join(tempDir, 'stdout.txt');
  const exitPath = path.join(tempDir, 'exit.txt');

  try {
    fs.writeFileSync(
      runnerPath,
      [
        `$ErrorActionPreference = 'Continue'`,
        `$exitCode = 0`,
        `try {`,
        `  Set-Location -Path ${toPsSingleQuoted(cwd)}`,
        `  & {`,
        command,
        `  } 2>&1 | Out-File -FilePath ${toPsSingleQuoted(stdoutPath)} -Encoding utf8`,
        `  if ($LASTEXITCODE -ne $null) { $exitCode = [int]$LASTEXITCODE }`,
        `} catch {`,
        `  $_ | Out-String | Out-File -FilePath ${toPsSingleQuoted(stdoutPath)} -Encoding utf8 -Append`,
        `  $exitCode = 1`,
        `}`,
        `Set-Content -Path ${toPsSingleQuoted(exitPath)} -Value $exitCode`,
        `exit $exitCode`
      ].join('\r\n'),
      'utf8'
    );

    const parentCommand = [
      `$proc = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden`,
      `  -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${toPsSingleQuoted(
        runnerPath
      )})`,
      `Write-Output $proc.ExitCode`
    ].join('; ');

    const parentResult = await collectProcess(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', parentCommand],
      cwd
    );

    let stdout = '';
    let exitCode = parentResult.exitCode;
    try {
      stdout = fs.readFileSync(stdoutPath, 'utf8');
    } catch {
      stdout = '';
    }
    try {
      const rawExit = fs.readFileSync(exitPath, 'utf8').trim();
      if (rawExit) exitCode = Number.parseInt(rawExit, 10);
    } catch {
      // leave parent exit code
    }

    return {
      stdout,
      stderr: parentResult.stderr,
      exitCode,
      error: parentResult.error
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

async function runRawExecutor(executor: AppSkillRawExecutor, cwd: string) {
  const binary = executor.shell === 'powershell' ? 'powershell.exe' : 'cmd.exe';
  const args =
    executor.shell === 'powershell'
      ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', executor.command]
      : ['/d', '/s', '/c', executor.command];

  if (executor.elevated) {
    if (!IS_WINDOWS || executor.shell !== 'powershell') {
      return {
        binary,
        args,
        stdout: '',
        stderr: '',
        exitCode: null,
        error: 'Elevated raw skills are currently supported only for PowerShell on Windows.'
      };
    }
    const elevated = await runElevatedPowerShell(executor.command, cwd);
    return { binary, args, ...elevated };
  }

  const result = await collectProcess(binary, args, cwd);
  return { binary, args, ...result };
}

function rawBackendLabel(executor: AppSkillRawExecutor) {
  const shellLabel = executor.shell === 'powershell' ? 'PowerShell' : 'Command Prompt';
  return executor.elevated ? `Admin ${shellLabel}` : shellLabel;
}

export async function runStoredAppSkill(args: {
  skillId: string;
  sessionId: string;
  tabId: string;
  groupId?: string;
  skill?: AppSkill;
}): Promise<AppSkillRunResponse> {
  const state = getState();
  const storedSkill = args.skill ?? (state.skills ?? []).find((skill) => skill.id === args.skillId);
  if (!storedSkill) {
    return { ok: false, error: 'Saved skill not found.' };
  }

  const skill = finalizeGeneratedAppSkill(storedSkill);
  const groupId = args.groupId ?? `skill:${skill.id}`;

  if (skill.executor.kind === 'claw') {
    const executor = skill.executor;
    writeSkill(executor.skillFileName, renderClawSkillMarkdown(skill, executor));
    const cwd = resolveCwd(args.tabId, executor.cwdMode);
    const backend = executor.backend?.trim() || state.claw?.defaultBackend || 'claude-code';
    clawBroker.startSession(args.sessionId, backend, cwd, [executor.skillId], executor.system, {
      tabId: args.tabId,
      groupId
    });
    clawBroker.message(args.sessionId, executor.prompt);
    return {
      ok: true,
      sessionId: args.sessionId,
      groupId,
      skillId: skill.id,
      skillTitle: skill.title,
      executionType: 'claw',
      backend,
      skillIds: [executor.skillId],
      invocation: {
        binary: backend,
        args: [],
        prompt: executor.prompt,
        system: executor.system,
        cwd
      }
    };
  }

  const cwd = resolveCwd(args.tabId, skill.executor.cwdMode);
  const result = await runRawExecutor(skill.executor, cwd);
  const summary = result.error
    ? `Skill failed: ${result.error}`
    : summarizeRawExecution(result.stdout, result.stderr, result.exitCode);
  return {
    ok: true,
    sessionId: args.sessionId,
    groupId,
    skillId: skill.id,
    skillTitle: skill.title,
    executionType: 'raw',
    backend: rawBackendLabel(skill.executor),
    skillIds: [],
    invocation: {
      binary: result.binary,
      args: result.args,
      prompt: skill.executor.command,
      cwd
    },
    exitCode: result.error ? null : result.exitCode,
    stdout: result.stdout,
    stderr: result.error ? [result.stderr, result.error].filter(Boolean).join('\n') : result.stderr,
    summary
  };
}
