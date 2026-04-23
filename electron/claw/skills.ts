import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SKILLS: Record<string, string> = {
  'braindump-standards.md': `---
id: braindump-standards
scope: claw
appliesTo: ["*"]
autoApplyBypass: false
---

You are operating on behalf of Braindump, a personal notes app owner.

Tone
- Be terse. No preamble, no summaries, no bullet-point fluff.
- Ask before doing anything destructive or anything outside the current working directory.
- Prefer diffs over prose.
- Always produce a one-sentence summary of what you did at the end.
`,
  'braindump-diffs.md': `---
id: braindump-diffs
scope: claw
appliesTo: ["*"]
---

When proposing code changes, emit a unified diff with correct file paths.
Include new-file diffs when creating files. Never emit partial hunks.
`,
  'braindump-scope-guard.md': `---
id: braindump-scope-guard
scope: claw
appliesTo: ["*"]
---

Do not read, write, or execute outside of the provided working directory.
If a task requires external access, list the access needs in your first reply and wait for confirmation.
`
};

function skillsDir(): string {
  const dir = path.join(app.getPath('userData'), 'claw', 'skills');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureDefaultSkills(): void {
  const dir = skillsDir();
  for (const [name, content] of Object.entries(DEFAULT_SKILLS)) {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content);
  }
}

export function listSkills(): { name: string; path: string; content: string; id: string; scope: string }[] {
  ensureDefaultSkills();
  const dir = skillsDir();
  const out: { name: string; path: string; content: string; id: string; scope: string }[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md')) continue;
    const p = path.join(dir, name);
    const content = fs.readFileSync(p, 'utf8');
    const idMatch = /^id:\s*(\S+)/m.exec(content);
    const scopeMatch = /^scope:\s*(\S+)/m.exec(content);
    out.push({
      name,
      path: p,
      content,
      id: idMatch?.[1] ?? name.replace(/\.md$/, ''),
      scope: scopeMatch?.[1] ?? 'claw'
    });
  }
  return out;
}

export function writeSkill(name: string, content: string): void {
  const dir = skillsDir();
  if (!/^[a-zA-Z0-9._-]+\.md$/.test(name)) throw new Error('Invalid skill filename');
  fs.writeFileSync(path.join(dir, name), content);
}

export function deleteSkill(name: string): void {
  const dir = skillsDir();
  const p = path.join(dir, name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function openSkillsFolder(): string {
  const dir = skillsDir();
  void shell.openPath(dir);
  return dir;
}
