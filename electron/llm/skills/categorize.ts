import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

export const CategorizeSchema = z.object({
  category: z.string(),
  suggestedTabId: z.string().nullable(),
  confidence: z.number().min(0).max(1)
});

export type CategorizeInput = {
  lines: string[];
  categories: { id: string; label: string }[];
  tabs: { id: string; name: string; projectContext?: string; aliases?: string[] }[];
  currentTabId: string;
};

export async function runCategorize(input: CategorizeInput) {
  return runSkill({
    feature: 'categorize',
    input,
    schema: CategorizeSchema,
    buildMessages: (i): LLMMessage[] => [
      {
        role: 'system',
        content: `Classify a short note group into one of the user's categories and suggest the best-fitting tab.
Categories: ${JSON.stringify(i.categories)}
Tabs: ${JSON.stringify(i.tabs.map((t) => ({ id: t.id, name: t.name, context: t.projectContext ?? '', aliases: t.aliases ?? [] })))}
Rules:
- Return a category id from the provided list. If none fit, return "quick-thought".
- Only return suggestedTabId when confidence > 0.7 that it should move. Otherwise null.
- confidence is 0..1, calibrated; use 0.9+ only for unambiguous matches.
- Do NOT suggest the currentTabId as a move.
- Return ONLY JSON: { "category": string, "suggestedTabId": string | null, "confidence": number }`
      },
      { role: 'user', content: `currentTabId: ${i.currentTabId}\nLines:\n${JSON.stringify(i.lines)}\n\nReturn the JSON object now.` }
    ]
  });
}
