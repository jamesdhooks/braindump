import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

export const CombineSchema = z.object({
  combined_lines: z.array(z.string()),
  notes: z.string().optional()
});

export type CombineInput = {
  groups: { lines: string[] }[];
  projectContext?: string;
  /** 'faithful' (default) preserves all original content; 'rewrite' tightens prose. */
  mode?: 'faithful' | 'rewrite';
};

function system(input: CombineInput): string {
  const mode = input.mode ?? 'faithful';
  return `You merge multiple short note groups into one well-structured Markdown note.

Mode: ${mode}
  - faithful: preserve every concrete detail from every input group. Use Markdown headers, bullets, and code fences to organize. Do not invent.
  - rewrite: also tighten prose for clarity, but keep every concrete detail (numbers, names, decisions, TODOs).

Hard rules:
- Never invent facts, names, numbers, dates, decisions.
- Output ONLY a JSON object: { combined_lines: string[], notes?: string }.
- combined_lines is the merged note as an array of lines (Markdown allowed).`;
}

export async function runCombineGroups(input: CombineInput) {
  return runSkill({
    feature: 'other',
    input,
    schema: CombineSchema,
    buildMessages: (i) => {
      const msgs: LLMMessage[] = [{ role: 'system', content: system(i) }];
      if (i.projectContext) {
        msgs.push({ role: 'system', content: `Project context: ${i.projectContext}` });
      }
      const blocks = i.groups
        .map((g, idx) => `--- Group ${idx + 1} ---\n${g.lines.join('\n')}`)
        .join('\n\n');
      msgs.push({
        role: 'user',
        content: `Merge these ${i.groups.length} groups into one Markdown note.\n\n${blocks}\n\nReturn the JSON object now.`
      });
      return msgs;
    }
  });
}
