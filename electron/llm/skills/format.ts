import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

export const FormatSchema = z.object({
  revised_lines: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional()
});

export type FormatInput = {
  lines: string[];
  aggressiveness: 'tidy' | 'restructure' | 'rewrite';
  preserveVoice: boolean;
  projectContext?: string;
};

function system(input: FormatInput): string {
  return `You are a silent editor for a rapid-fire notes app. A user dumps thoughts as lines; your job is to gently improve formatting without changing meaning.

Mode: ${input.aggressiveness}
  - tidy: only whitespace, spelling, obvious typos, capitalization. Never reorder.
  - restructure: also split run-ons, group related lines, lightly reorder for clarity.
  - rewrite: also rephrase for clarity, strictly preserving intent and every concrete detail.

Preserve voice: ${input.preserveVoice ? 'yes — keep tone, slang, shorthand.' : 'no — normalize voice.'}

Hard rules:
- Never invent facts, names, numbers, dates, decisions.
- Never add commentary, headers, bullets, or prose explanation.
- Output lines should be short and atomic when possible.
- Output ONLY a JSON object matching the schema: { revised_lines: string[], confidence: number 0-1, notes?: string }.`;
}

export async function runFormat(input: FormatInput) {
  return runSkill({
    feature: 'autoFormat',
    input,
    schema: FormatSchema,
    buildMessages: (i) => {
      const msgs: LLMMessage[] = [{ role: 'system', content: system(i) }];
      if (i.projectContext) {
        msgs.push({ role: 'system', content: `Project context (background, do not rewrite about it): ${i.projectContext}` });
      }
      msgs.push({ role: 'user', content: `Original lines:\n${JSON.stringify(i.lines, null, 2)}\n\nReturn the JSON object now.` });
      return msgs;
    }
  });
}
