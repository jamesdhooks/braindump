const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderInlineMarkdown(line: string): string {
  let out = escapeHtml(line);
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-ink-800 text-ink-100 font-mono text-[0.85em]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|\W)\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a class="underline decoration-accent-500/60 hover:decoration-accent-400" href="$2" data-ext="1">$1</a>');
  out = out.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,
    '$1<a class="underline decoration-accent-500/60 hover:decoration-accent-400" href="$2" data-ext="1">$2</a>');
  out = out.replace(/(^|\s)#([a-zA-Z0-9_-]{2,32})/g,
    '$1<span class="text-accent-400">#$2</span>');
  return out;
}
