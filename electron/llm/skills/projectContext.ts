import { z } from 'zod';
import { runSkill } from './runSkill';

export const ProjectContextSchema = z.object({
  summary: z.string(),
  aliases: z.array(z.string()).optional()
});

export type ProjectContextInput = {
  tabName: string;
  recentLines: string[];
};

export async function runProjectContext(input: ProjectContextInput) {
  return runSkill({
    feature: 'projectContext',
    input,
    schema: ProjectContextSchema,
    buildMessages: (i) => [
      {
        role: 'system',
        content:
          'Based on a sample of recent note groups from one tab, propose a 3-5 sentence summary of what the project/tab is about (for use as background context in future prompts). Also propose up to 5 short lowercase aliases (keywords) that identify this project. Return ONLY JSON: { "summary": string, "aliases": string[] }'
      },
      { role: 'user', content: `Tab name: ${i.tabName}\n\nRecent lines:\n${JSON.stringify(i.recentLines)}\n\nReturn the JSON object now.` }
    ]
  });
}
