import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

export const CaptureSchema = z.object({
  lines: z.array(z.string()),
  suggested_tab: z.string().nullable().optional(),
  suggested_title: z.string().nullable().optional()
});

export type CaptureInput = {
  transcript: string;
  projectContext?: string;
};

const SYSTEM = `You finalize a brainstorm into a stepped brain dump.
Rules:
- Each line: ONE atomic thought, short, declarative.
- Reflect any agreed ordering (steps, priorities, dependencies).
- Include only what was agreed or strongly implied.
- No prose, headings, bullets, numbering, or commentary.
- Output ONLY JSON: { "lines": string[], "suggested_tab": string | null, "suggested_title": string | null }`;

export async function runCapture(input: CaptureInput) {
  return runSkill({
    feature: 'capture',
    input,
    schema: CaptureSchema,
    buildMessages: (i) => {
      const msgs: LLMMessage[] = [{ role: 'system', content: SYSTEM }];
      if (i.projectContext) {
        msgs.push({ role: 'system', content: `Project context: ${i.projectContext}` });
      }
      msgs.push({ role: 'user', content: `Full brainstorm transcript:\n"""\n${i.transcript}\n"""\n\nReturn the JSON object now.` });
      return msgs;
    }
  });
}
