import { z } from 'zod';
import { runSkill } from './runSkill';

export const TagSchema = z.object({ tags: z.array(z.string()) });
export const TasksSchema = z.object({ tasks: z.array(z.string()) });
export const ExplainBackSchema = z.object({
  summary: z.string(),
  questions: z.array(z.string()).optional()
});

export async function runTag(lines: string[]) {
  return runSkill({
    feature: 'tag',
    input: lines,
    schema: TagSchema,
    buildMessages: (l) => [
      { role: 'system', content: 'Suggest 0 to 3 short hashtags (lowercase, no spaces, no leading #). Return ONLY JSON: { "tags": string[] }.' },
      { role: 'user', content: `Lines:\n${JSON.stringify(l)}\n\nReturn the JSON object now.` }
    ]
  });
}

export async function runTasks(lines: string[]) {
  return runSkill({
    feature: 'tasks',
    input: lines,
    schema: TasksSchema,
    buildMessages: (l) => [
      { role: 'system', content: 'Extract actionable todo items. Each task is a short imperative line prefixed with "[ ] ". Return ONLY JSON: { "tasks": string[] }.' },
      { role: 'user', content: `Lines:\n${JSON.stringify(l)}\n\nReturn the JSON object now.` }
    ]
  });
}

export async function runExplainBack(lines: string[]) {
  return runSkill({
    feature: 'explainBack',
    input: lines,
    schema: ExplainBackSchema,
    buildMessages: (l) => [
      {
        role: 'system',
        content:
          "Rephrase the user's note group back in 1-2 short sentences, checking for coherence. Return ONLY JSON: { \"summary\": string, \"questions\": string[] } where questions lists 0 to 2 one-line clarifying questions, only if genuinely ambiguous."
      },
      { role: 'user', content: l.join('\n') }
    ]
  });
}
