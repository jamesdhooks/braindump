import { z } from 'zod';
import { runSkill } from './runSkill';

export const TemplateSchema = z.object({ lines: z.array(z.string()) });

const TEMPLATES: Record<string, string> = {
  meeting:
    'Expand "/meeting" into a meeting-note scaffold as stepped atomic lines (attendees, agenda items, decisions, next steps). Return ONLY JSON: { "lines": string[] }.',
  decision:
    'Expand "/decision" into a decision-record scaffold (context, options considered, choice, rationale, follow-ups) as stepped atomic lines. Return ONLY JSON: { "lines": string[] }.',
  postmortem:
    'Expand "/postmortem" into an incident post-mortem scaffold (timeline, impact, root cause, what went well, what did not, action items) as stepped atomic lines. Return ONLY JSON: { "lines": string[] }.'
};

export async function runTemplate(id: 'meeting' | 'decision' | 'postmortem') {
  const system = TEMPLATES[id];
  if (!system) throw new Error(`Unknown template: ${id}`);
  return runSkill({
    feature: 'template',
    input: id,
    schema: TemplateSchema,
    buildMessages: () => [
      { role: 'system', content: system },
      { role: 'user', content: `Produce the /${id} scaffold now.` }
    ]
  });
}
