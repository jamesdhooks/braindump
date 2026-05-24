import { z } from 'zod';
import { runSkill } from './runSkill';

export const DailyReportSchema = z.object({
  headline: z.string().min(8),
  overview: z.object({
    createdCount: z.number().int().nonnegative(),
    completedCount: z.number().int().nonnegative(),
    qaCount: z.number().int().nonnegative(),
    archivedCount: z.number().int().nonnegative(),
    summary: z.string().min(12)
  }),
  byTab: z.array(
    z.object({
      tabId: z.string(),
      summary: z.string().min(12),
      highlights: z.array(z.string().min(6)).max(8)
    })
  ),
  carryForward: z.array(z.string().min(6)).max(8),
  stale: z.array(z.string().min(6)).max(8)
});

export type DailyReportInput = {
  date: string;
  tabs: { id: string; name: string; projectContext?: string }[];
  completed: { tabId: string; lines: string[]; completedAt: number; qaAt?: number | null; archived: boolean }[];
  created: { tabId: string; lines: string[] }[];
  stillPinned: { tabId: string; lines: string[]; updatedAt: number }[];
  stats: {
    createdCount: number;
    completedCount: number;
    qaCount: number;
    archivedCount: number;
  };
};

export async function runDailyReport(input: DailyReportInput) {
  return runSkill({
    feature: 'dailyReport',
    input,
    schema: DailyReportSchema,
    buildMessages: (i) => [
      {
        role: 'system',
        content: `Produce a concise but structured morning digest for ${i.date}.
Requirements:
- Focus on concrete events from the provided data only.
- Explicitly reflect what was added, completed, QA'd, and archived.
- Avoid one-word or generic summaries.
- Prefer actionable carry-forward bullets.

Schema expectations:
- headline: one complete sentence.
- overview: include exact createdCount/completedCount/qaCount/archivedCount and a short summary sentence.
- byTab[]: include tabs with meaningful activity; each needs a specific summary and highlights.
- carryForward: unfinished or next-step items.
- stale: pinned items that have gone stale.

Output ONLY a JSON object matching the schema: { "headline": string, "overview": { "createdCount": number, "completedCount": number, "qaCount": number, "archivedCount": number, "summary": string }, "byTab": [{ "tabId": string, "summary": string, "highlights": string[] }], "carryForward": string[], "stale": string[] }`
      },
      { role: 'user', content: JSON.stringify(i) }
    ]
  });
}

export const StalePulseSchema = z.object({
  nudges: z.array(z.object({ groupId: z.string(), one_line_nudge: z.string() })),
  fresh: z.array(z.object({ groupId: z.string(), what_changed: z.string() }))
});

export type StalePulseInput = {
  stale: { groupId: string; tabName: string; lines: string[]; ageDays: number }[];
  recent: { groupId: string; tabName: string; lines: string[]; ageDays: number }[];
};

export async function runStalePulse(input: StalePulseInput) {
  return runSkill({
    feature: 'stalePulse',
    input,
    schema: StalePulseSchema,
    buildMessages: (i) => [
      {
        role: 'system',
        content:
          'Produce nudges for stale groups (one short, specific sentence each: what action would unstick this) and fresh highlights for recently updated groups (one short sentence: what seems to have changed). Return ONLY JSON matching the schema.'
      },
      { role: 'user', content: JSON.stringify(i) }
    ]
  });
}
