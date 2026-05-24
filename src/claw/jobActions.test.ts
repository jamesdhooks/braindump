import { describe, expect, it } from 'vitest';
import type { ClawJob } from '../types';
import {
  buildIterationPrompt,
  buildIterationSystem,
  formatJobComplexityChoice,
  getJobComplexityChoice
} from './jobActions';

function makeJob(patch: Partial<ClawJob> = {}): ClawJob {
  return {
    sessionId: 'job-1',
    tabId: 'tab-1',
    groupId: 'group-1',
    startedAt: 1,
    backend: 'GitHub Copilot',
    state: 'done',
    draft: {
      goal: 'Ship the feature',
      constraints: [],
      acceptance_criteria: [],
      artifacts_to_produce: [],
      safety_notes: []
    },
    skills: [],
    events: [],
    artifacts: [],
    pendingPrompts: [],
    report: {
      status: 'success',
      summary: 'Implemented the feature.',
      completed: ['Added the UI'],
      changes: ['src/App.tsx: updated the job panel'],
      blockers: [],
      next_steps: []
    },
    invocation: {
      executionType: 'runner',
      runnerId: 'copilot-cli',
      binary: 'copilot',
      args: ['--allow-all-tools'],
      prompt: 'Original task body',
      system: 'Original system prompt',
      cwd: 'F:\\repo',
      complexity: 'crazy',
      complexitySource: 'manual'
    },
    ...patch
  };
}

describe('getJobComplexityChoice', () => {
  it('preserves manual selections', () => {
    const job = makeJob();
    expect(getJobComplexityChoice(job)).toEqual({ complexity: 'crazy', source: 'manual' });
    expect(formatJobComplexityChoice(getJobComplexityChoice(job))).toBe('crazy · manual');
  });

  it('defaults runner jobs to automatic complex when no explicit selection was stored', () => {
    const job = makeJob({
      invocation: {
        executionType: 'runner',
        runnerId: 'copilot-cli',
        binary: 'copilot',
        args: [],
        prompt: 'Original task body'
      }
    });

    expect(getJobComplexityChoice(job)).toEqual({ complexity: 'complex', source: 'automatic' });
  });
});

describe('buildIterationPrompt', () => {
  it('includes the original request, previous result, and desired changes', () => {
    const prompt = buildIterationPrompt(makeJob(), 'Tighten the copy and add tests.');

    expect(prompt).toContain('Original request:');
    expect(prompt).toContain('Original task body');
    expect(prompt).toContain('Previous result:');
    expect(prompt).toContain('Implemented the feature.');
    expect(prompt).toContain('Desired changes for this iteration:');
    expect(prompt).toContain('Tighten the copy and add tests.');
  });

  it('adds an iteration-specific system instruction', () => {
    const system = buildIterationSystem(makeJob());
    expect(system).toContain('Original system prompt');
    expect(system).toContain('You are iterating on a previously completed coding run in the same repository.');
  });
});
