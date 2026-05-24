import type { ClawJobEvent, JobReport } from '../types';

export const REPORT_SENTINEL = '<<<BRAINDUMP_REPORT>>>';

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => String(entry).trim())
        .filter(Boolean)
    : [];
}

function extractReportJson(text: string): string | null {
  const idx = text.indexOf(REPORT_SENTINEL);
  if (idx === -1) return null;
  const source = text.slice(idx + REPORT_SENTINEL.length).trimStart();
  if (!source.startsWith('{')) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(0, i + 1);
      }
    }
  }

  return null;
}

/** Scan a single text string for the sentinel and extract the JSON report. */
export function tryParseReport(text: string): JobReport | null {
  const jsonStr = extractReportJson(text);
  if (!jsonStr) return null;
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    if (typeof obj.status !== 'string' || typeof obj.summary !== 'string') return null;
    const status =
      obj.status === 'success' || obj.status === 'partial' || obj.status === 'failed'
        ? (obj.status as 'success' | 'partial' | 'failed')
        : 'partial';
    const completed = normalizeStringArray(obj.completed);
    const changes = normalizeStringArray(obj.changes);
    return {
      status,
      summary: String(obj.summary),
      completed: completed.length > 0 ? completed : changes,
      changes,
      blockers: normalizeStringArray(obj.blockers),
      next_steps: normalizeStringArray(obj.next_steps)
    };
  } catch {
    return null;
  }
}

/** Scan all job events (log + thinking) for a report sentinel. Returns first match. */
export function extractReportFromEvents(events: ClawJobEvent[]): JobReport | null {
  for (const e of events) {
    if (e.kind === 'log' || e.kind === 'thinking') {
      const r = tryParseReport(e.text);
      if (r) return r;
    }
  }
  return null;
}

/** The instruction appended to every runner system prompt. */
export const REPORT_SYSTEM_INSTRUCTION = `

FINAL STEP — after all file edits are applied, output the following sentinel on its own line with the JSON report immediately after it (no code fences, no line break between the sentinel and JSON):
${REPORT_SENTINEL}{"status":"success","summary":"One sentence describing what was accomplished","completed":["Implemented the requested runner report UI","Wired structured report parsing for both CLI runners"],"changes":["src/file.tsx: brief description of change"],"blockers":[],"next_steps":[]}
Use "completed" for concrete user-visible work that is finished. Use "changes" for file-level notes.
Use "partial" if only some items were completed, "failed" if the task could not be completed. JSON must be on the same line as the sentinel.`;
