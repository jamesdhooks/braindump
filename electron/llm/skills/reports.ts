import { z } from 'zod';
import { runSkill } from './runSkill';

export const DailyReportSchema = z.object({
  headline: z.string(),
  byTab: z.array(
    z.object({
      tabId: z.string(),
      summary: z.string(),
      highlights: z.array(z.string())
    })
  ),
  carryForward: z.array(z.string()),
  stale: z.array(z.string())
});

export type DailyReportInput = {
  date: string;
  tabs: { id: string; name: string; projectContext?: string }[];
  completed: { tabId: string; lines: string[]; completedAt: number }[];
  created: { tabId: string; lines: string[] }[];
  stillPinned: { tabId: string; lines: string[]; updatedAt: number }[];
};

export async function runDailyReport(input: DailyReportInput) {
  return runSkill({
    feature: 'dailyReport',
    input,
    schema: DailyReportSchema,
    buildMessages: (i) => [
      {
        role: 'system',
        content: `Produce a concise morning digest.
- headline: one warm sentence.
- byTab[]: per tab with meaningful activity, summary (1 sentence) + 0-5 short highlights.
- carryForward: 0-5 items that didn't finish and should be kept in view.
- stale: 0-5 pinned-but-unchanged items to revisit.
Return ONLY JSON with the schema.`
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
