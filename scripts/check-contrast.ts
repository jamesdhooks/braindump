#!/usr/bin/env node
/**
 * Minimal contrast checker over the theme tokens declared in src/theme/tokens.css.
 * Fails non-zero if any foreground / surface pair falls below WCAG AA (4.5) for text.
 */
import fs from 'node:fs';
import path from 'node:path';

const TOKENS = path.resolve(__dirname, '../src/theme/tokens.css');

type Palette = Record<string, string>;

function parseThemes(css: string): Record<string, Palette> {
  const themes: Record<string, Palette> = {};
  const re = /:root\[data-theme='([^']+)'\][^{]*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const [, name, body] = m;
    const palette: Palette = {};
    for (const line of body.split('\n')) {
      const kv = /--([\w-]+):\s*([^;]+);/.exec(line);
      if (kv) palette[kv[1]] = kv[2].trim();
    }
    themes[name] = palette;
  }
  return themes;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function rel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * rel(r) + 0.7152 * rel(g) + 0.0722 * rel(b);
}
function contrast(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = luminance(ra);
  const lb = luminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function main() {
  const css = fs.readFileSync(TOKENS, 'utf8');
  const themes = parseThemes(css);
  const pairs: [string, string][] = [
    ['fg-0', 'surface-0'],
    ['fg-0', 'surface-1'],
    ['fg-0', 'surface-2'],
    ['fg-1', 'surface-0'],
    ['fg-1', 'surface-2'],
    ['fg-2', 'surface-0']
  ];
  let fail = 0;
  for (const [name, palette] of Object.entries(themes)) {
    console.log(`\n[${name}]`);
    for (const [fg, bg] of pairs) {
      const c = contrast(palette[fg] ?? '', palette[bg] ?? '');
      if (c == null) {
        console.log(`  ${fg} on ${bg}: non-hex (skipped)`);
        continue;
      }
      const ok = c >= 4.5;
      const mark = ok ? 'ok' : 'FAIL';
      console.log(`  ${fg} on ${bg}: ${c.toFixed(2)} ${mark}`);
      if (!ok) fail += 1;
    }
  }
  if (fail > 0) {
    console.error(`\n${fail} pair(s) below AA (4.5). Tune tokens.`);
    process.exit(1);
  }
  console.log('\nAll checked pairs meet AA.');
}

main();
