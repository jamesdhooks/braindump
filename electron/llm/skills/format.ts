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
  formatStyle?: 'plain' | 'markdown';
  guidance?: string;
};

function system(input: FormatInput): string {
  const style = input.formatStyle ?? 'plain';
  const styleBlock =
    style === 'markdown'
      ? `Output style: MARKDOWN.
  - When the input contains multiple distinct ideas, output proper Markdown: short headers (##), bold for key terms, ordered/unordered lists, and fenced code blocks for snippets.
  - Single-idea dumps remain a single line or short paragraph (no forced structure).
  - Use \`- \` for bullets and \`1. \` for ordered lists. Avoid horizontal rules and tables.`
      : `Output style: PLAIN.
  - Keep lines short and atomic. No headers or bullets unless the user already used them.`;
  const guidanceBlock = input.guidance ? `\n\nAdditional user guidance (treat as soft preference):\n${input.guidance.trim()}` : '';
  return `You are a silent editor for a rapid-fire notes app. A user dumps thoughts as lines; your job is to gently improve formatting without changing meaning.

Mode: ${input.aggressiveness}
  - tidy: only whitespace, spelling, obvious typos, capitalization. Never reorder.
  - restructure: also split run-ons, group related lines, lightly reorder for clarity.
  - rewrite: also rephrase for clarity, strictly preserving intent and every concrete detail.

Preserve voice: ${input.preserveVoice ? 'yes — keep tone, slang, shorthand.' : 'no — normalize voice.'}

${styleBlock}

Hard rules:
- Never invent facts, names, numbers, dates, decisions.
- Never add commentary or prose explanation outside the JSON.
- Output ONLY a JSON object matching the schema: { revised_lines: string[], confidence: number 0-1, notes?: string }.${guidanceBlock}`;
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
