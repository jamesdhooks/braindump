import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

export const RambleSchema = z.object({
  lines: z.array(z.string())
});

export type RambleInput = {
  monologue: string;
  projectContext?: string;
};

const SYSTEM = `You turn a user's stream-of-consciousness monologue into a stepped brain dump.
Rules:
- Each output line is ONE atomic thought. Short, declarative.
- Preserve every concrete detail. Drop only verbal filler.
- If there's implicit order (cause→effect, first→then), reflect it by ordering lines.
- No prose, no headings, no bullets, no numbering, no commentary.
- Output ONLY a JSON object: { "lines": string[] }`;

export async function runRamble(input: RambleInput, onToken?: (t: string) => void) {
  return runSkill({
    feature: 'ramble',
    input,
    schema: RambleSchema,
    onToken,
    buildMessages: (i) => {
      const msgs: LLMMessage[] = [{ role: 'system', content: SYSTEM }];
      if (i.projectContext) {
        msgs.push({ role: 'system', content: `Project context: ${i.projectContext}` });
      }
      msgs.push({ role: 'user', content: `Monologue:\n"""\n${i.monologue}\n"""\n\nReturn the JSON object now.` });
      return msgs;
    }
  });
}
