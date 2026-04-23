import { z } from 'zod';
import { runSkill } from './runSkill';

export const ClawDraftSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()).default([]),
  acceptance_criteria: z.array(z.string()).default([]),
  artifacts_to_produce: z.array(z.string()).default([]),
  safety_notes: z.array(z.string()).default([])
});

export type ClawDraftInput = {
  groupLines: string[];
  tabName: string;
  projectContext?: string;
  appSkills: string[];
  priorHistory?: string[];
};

export async function runClawDraft(input: ClawDraftInput) {
  return runSkill({
    feature: 'clawInstructionDraft',
    input,
    schema: ClawDraftSchema,
    buildMessages: (i) => [
      {
        role: 'system',
        content: `You are a small orchestrator sitting between a human and an agentic coding backend.
The human has a note group they want the backend to act on. Your job is to draft a clean, scoped instruction.
Active app skills: ${i.appSkills.join(', ') || '(none)'}.
Rules:
- goal: one sentence of what the backend should accomplish.
- constraints: what must NOT happen (scope limits, files not to touch, tone).
- acceptance_criteria: observable outcomes that prove the goal was met.
- artifacts_to_produce: diffs / files / text outputs expected.
- safety_notes: anything risky that needs explicit confirmation.
- Prefer diffs over prose. Do not reference the user; address the backend in the third person.
- Return ONLY JSON matching the schema.`
      },
      ...(i.projectContext ? ([{ role: 'system', content: `Project context: ${i.projectContext}` }] as const) : []),
      {
        role: 'user',
        content: `Tab: ${i.tabName}\n\nGroup lines:\n${JSON.stringify(i.groupLines)}\n\n${
          i.priorHistory?.length ? `Recent history with this backend:\n${i.priorHistory.join('\n')}\n\n` : ''
        }Return the JSON object now.`
      }
    ]
  });
}
