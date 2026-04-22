function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function hashLine(line: string): string {
  return fnv1a(line.trim().toLowerCase());
}

export function hashLines(lines: string[]): string {
  return fnv1a(lines.map((l) => l.trim().toLowerCase()).join(''));
}
