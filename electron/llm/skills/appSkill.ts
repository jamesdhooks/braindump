import { z } from 'zod';
import type { LLMMessage } from '../../../src/types';
import { runSkill } from './runSkill';

const CwdModeSchema = z.enum(['active-tab-project-or-repo', 'repo']);

const GeneratedAppSkillSchema = z.object({
  title: z.string(),
  description: z.string(),
  executor: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('claw'),
      backend: z.string().optional(),
      skillId: z.string(),
      skillFileName: z.string(),
      skillInstructions: z.string(),
      system: z.string().optional(),
      prompt: z.string(),
      cwdMode: CwdModeSchema
    }),
    z.object({
      kind: z.literal('raw'),
      shell: z.enum(['powershell', 'cmd']),
      command: z.string(),
      elevated: z.boolean().optional(),
      cwdMode: CwdModeSchema
    })
  ])
});

export type GenerateAppSkillInput = {
  request: string;
  activeTabName?: string;
  projectContext?: string;
  defaultBackend?: string;
  availableBackends?: string[];
};

type GeneratedAppSkill = z.infer<typeof GeneratedAppSkillSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'skill';
}

function titleFromRequest(request: string) {
  const words = request
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return 'New Skill';
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function fallbackSkill(input: GenerateAppSkillInput): GeneratedAppSkill {
  const trimmed = input.request.trim();
  if (/taskkill|kill\b.*bash|stop\b.*bash/i.test(trimmed)) {
    return {
      title: 'Kill Bash',
      description: 'Force-stop every running bash.exe process with elevated PowerShell.',
      executor: {
        kind: 'raw',
        shell: 'powershell',
        command: 'taskkill /F /IM bash.exe',
        elevated: true,
        cwdMode: 'repo'
      }
    };
  }

  const title = titleFromRequest(trimmed);
  const slug = slugify(title);
  return {
    title,
    description: trimmed || 'Execute a saved app skill.',
    executor: {
      kind: 'claw',
      backend: input.defaultBackend?.trim() || undefined,
      skillId: `app-${slug}`,
      skillFileName: `${slug}.md`,
      skillInstructions: `Carry out this saved Braindump skill carefully and report exactly what happened.\n\nRequested skill:\n${trimmed || title}`,
      prompt: trimmed || `Run the "${title}" skill now.`,
      cwdMode: /repo|project|code|file|test|build|branch|commit|lint/i.test(trimmed)
        ? 'active-tab-project-or-repo'
        : 'repo'
    }
  };
}

function system(input: GenerateAppSkillInput) {
  const availableBackends = input.availableBackends?.filter(Boolean).join(', ') || input.defaultBackend || 'claude-code';
  return `You generate saved "app skills" for Braindump, a Windows-first Electron app.

The user describes a skill in natural language. Convert it into one executable config.

Choose the executor kind:
- Use "raw" only for short deterministic local shell actions (process control, a single OS command, launching or killing something).
- Use "claw" for repo-aware work, file edits, multi-step reasoning, or anything that benefits from Open Claw.

Windows rules:
- Prefer PowerShell over cmd for Windows OS/process/admin tasks.
- If the action likely needs administrator rights, set raw.elevated = true.
- Raw.command must be the exact command string, with no code fences.

Claw rules:
- backend should be one of: ${availableBackends}
- skillId must be kebab-case.
- skillFileName must end in .md.
- skillInstructions should be concise reusable instructions for the Claw skill file body (no front matter).
- prompt should be the message sent when the user clicks the tile.

General rules:
- title: short, 2-4 words, action-oriented.
- description: one sentence explaining what the tile does.
- cwdMode: use "active-tab-project-or-repo" when project context matters, otherwise "repo".
- Never invent secrets, credentials, or external endpoints.
- Output ONLY a JSON object matching the schema: { title: string, description: string, executor: { kind: "claw", backend?: string, skillId: string, skillFileName: string, skillInstructions: string, system?: string, prompt: string, cwdMode: "active-tab-project-or-repo" | "repo" } | { kind: "raw", shell: "powershell" | "cmd", command: string, elevated?: boolean, cwdMode: "active-tab-project-or-repo" | "repo" } }.`;
}

export async function runGenerateAppSkill(input: GenerateAppSkillInput) {
  const result = await runSkill({
    feature: 'brainstorm',
    input,
    schema: GeneratedAppSkillSchema,
    buildMessages: (currentInput) => {
      const messages: LLMMessage[] = [{ role: 'system', content: system(currentInput) }];
      if (currentInput.activeTabName) {
        messages.push({ role: 'system', content: `Active tab: ${currentInput.activeTabName}` });
      }
      if (currentInput.projectContext) {
        messages.push({ role: 'system', content: `Project context: ${currentInput.projectContext}` });
      }
      messages.push({
        role: 'user',
        content: `Create one saved app skill for this request:\n\n${currentInput.request.trim()}\n\nReturn the JSON object now.`
      });
      return messages;
    }
  });

  if (result.ok && result.value) return result;

  const fallback = fallbackSkill(input);
  return {
    ...result,
    ok: true,
    value: fallback,
    raw: result.raw || JSON.stringify(fallback)
  };
}
