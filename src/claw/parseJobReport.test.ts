import { describe, expect, it } from 'vitest';
import { REPORT_SENTINEL, extractReportFromEvents, tryParseReport } from './parseJobReport';

describe('tryParseReport', () => {
  it('parses completed work from the structured payload', () => {
    const report = tryParseReport(
      `${REPORT_SENTINEL}{"status":"success","summary":"Done","completed":["Implemented reports","Rendered them inline"],"changes":["src/file.tsx: updated UI"],"blockers":[],"next_steps":[]}`
    );

    expect(report).toEqual({
      status: 'success',
      summary: 'Done',
      completed: ['Implemented reports', 'Rendered them inline'],
      changes: ['src/file.tsx: updated UI'],
      blockers: [],
      next_steps: []
    });
  });

  it('falls back to changes for older reports without completed items', () => {
    const report = tryParseReport(
      `${REPORT_SENTINEL}{"status":"partial","summary":"Mostly done","changes":["src/legacy.ts: updated behavior"],"blockers":["Needs follow-up"],"next_steps":["Verify on Windows"]}`
    );

    expect(report).toEqual({
      status: 'partial',
      summary: 'Mostly done',
      completed: ['src/legacy.ts: updated behavior'],
      changes: ['src/legacy.ts: updated behavior'],
      blockers: ['Needs follow-up'],
      next_steps: ['Verify on Windows']
    });
  });

  it('ignores trailing runner summary text after the JSON payload', () => {
    const report = tryParseReport(
      `${REPORT_SENTINEL}{"status":"success","summary":"Finished","completed":["Updated runner parsing"],"changes":["src/runners/RunnerBridge.tsx: parse completion summaries"],"blockers":[],"next_steps":[]} (2 artifacts)`
    );

    expect(report).toEqual({
      status: 'success',
      summary: 'Finished',
      completed: ['Updated runner parsing'],
      changes: ['src/runners/RunnerBridge.tsx: parse completion summaries'],
      blockers: [],
      next_steps: []
    });
  });
});

describe('extractReportFromEvents', () => {
  it('finds the first report embedded in job events', () => {
    const report = extractReportFromEvents([
      { at: 1, kind: 'log', level: 'info', text: 'plain log line' },
      {
        at: 2,
        kind: 'thinking',
        text: `${REPORT_SENTINEL}{"status":"success","summary":"Finished","completed":["Completed task"],"changes":[],"blockers":[],"next_steps":[]}`
      }
    ]);

    expect(report?.completed).toEqual(['Completed task']);
    expect(report?.summary).toBe('Finished');
  });
});
