import type { ClawJobArtifact, ClawJobEvent } from '../../src/types';

export type RunnerId = 'claude-cli' | 'copilot-cli';

export type RunnerComplexity = 'simple' | 'complex' | 'crazy';
export type RunnerComplexitySource = 'manual' | 'automatic';

export type RunnerCliConfig = {
  enabled: boolean;
  binaryPath?: string;
  model?: { simple?: string; complex?: string; crazy?: string };
  /** Extra CLI args (advanced). Inserted after the per-runner default args, before the prompt. */
  extraArgs?: string[];
};

export type RunnerInfo = {
  id: RunnerId;
  label: string;
  description: string;
  /** Default CLI binary name (looked up via PATH). */
  defaultBinary: string;
  /** Args used to verify that the CLI integration is actually available. */
  probeArgs: string[];
  /** Optional args used to fetch a displayable version string. */
  versionArgs?: string[];
};

export type RunnerStatus = {
  id: RunnerId;
  enabled: boolean;
  available: boolean;
  binary?: string;
  version?: string;
  error?: string;
};

export type RunnerRunInput = {
  runnerId: RunnerId;
  tabId: string;
  groupId: string;
  prompt: string;
  cwd?: string;
  complexity?: RunnerComplexity;
  complexitySource?: RunnerComplexitySource;
  /** Extra system instruction prepended before the user prompt (claude: --system-prompt flag). */
  system?: string;
};

export type RunnerEvent =
  | {
      kind: 'started';
      sessionId: string;
      tabId: string;
      groupId: string;
      runnerId: RunnerId;
      binary: string;
      args: string[];
      prompt: string;
      system?: string;
      cwd: string;
      complexity?: RunnerComplexity;
      complexitySource?: RunnerComplexitySource;
    }
  | { kind: 'job-event'; sessionId: string; event: ClawJobEvent }
  | { kind: 'done'; sessionId: string; ok: boolean; exitCode: number | null; summary: string; artifacts?: ClawJobArtifact[] };

export type RunnerSessionSnapshot = {
  sessionId: string;
  runnerId: RunnerId;
  tabId: string;
  groupId: string;
  binary: string;
  args: string[];
  prompt: string;
  system?: string;
  cwd: string;
  complexity?: RunnerComplexity;
  complexitySource?: RunnerComplexitySource;
  startedAt: number;
  endedAt?: number;
  state: 'running' | 'waiting-input' | 'done' | 'error' | 'interrupted';
  summary?: string;
  events: ClawJobEvent[];
  artifacts: ClawJobArtifact[];
};

export const RUNNERS: RunnerInfo[] = [
  {
    id: 'claude-cli',
    label: 'Claude Code',
    description: 'Anthropic Claude Code CLI (`claude`). Per-message spawn, streamed stdout.',
    defaultBinary: 'claude',
    probeArgs: ['--version'],
    versionArgs: ['--version']
  },
  {
    id: 'copilot-cli',
    label: 'GitHub Copilot CLI',
    description: 'GitHub Copilot CLI (`copilot --prompt ...`). Per-message spawn.',
    defaultBinary: 'copilot',
    probeArgs: ['--help'],
    versionArgs: ['--version']
  }
];
