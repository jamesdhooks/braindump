export function splitIntoGroups(raw: string): string[][] {
  const normalized = raw.replace(/\r\n?/g, '\n');
  const chunks = normalized
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);
  return chunks.map((chunk) =>
    chunk
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.length > 0)
  );
}

export function extractHashtags(lines: string[]): string[] {
  const tags = new Set<string>();
  const re = /(^|\s)#([a-zA-Z0-9_-]{2,32})/g;
  for (const l of lines) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) {
      tags.add(m[2].toLowerCase());
    }
  }
  return [...tags];
}

export function redactForLLM(text: string, rules: { redactEmails: boolean; redactApiLikeStrings: boolean }): string {
  let out = text;
  if (rules.redactEmails) {
    out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  }
  if (rules.redactApiLikeStrings) {
    out = out.replace(/\b[A-Za-z0-9_\-]{32,}\b/g, (m) => (/[A-Z]/.test(m) && /[0-9]/.test(m) ? '[token]' : m));
    out = out.replace(/sk-[A-Za-z0-9_\-]{20,}/g, '[api-key]');
  }
  return out;
}
