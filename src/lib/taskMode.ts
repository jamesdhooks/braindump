import type { GroupRenderAs } from '../types';

const MARKED_TASK_RE = /^(\s*)([-*+])\s*\[\s*([xX]?)\s*\](?:\s+(.*))?$/;
const BARE_TASK_RE = /^(\s*)\[\s*([xX]?)\s*\](?:\s+(.*))?$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.+)$/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+(.+)$/;
const PLAIN_TEXT_RE = /^(\s*)(.+)$/;

export type ParsedTaskLine = {
  checked: boolean;
  content: string;
  indent: string;
  marker?: '-' | '*' | '+';
  explicit: boolean;
};

export function isTaskRenderMode(renderAs?: GroupRenderAs): boolean {
  return renderAs === 'tasks';
}

export function parseTaskLine(line: string, forceTaskMode = false): ParsedTaskLine | null {
  const markedMatch = MARKED_TASK_RE.exec(line);
  if (markedMatch) {
    return {
      indent: markedMatch[1],
      marker: markedMatch[2] as '-' | '*' | '+',
      checked: markedMatch[3].toLowerCase() === 'x',
      content: markedMatch[4] ?? '',
      explicit: true
    };
  }

  const bareMatch = BARE_TASK_RE.exec(line);
  if (bareMatch) {
    return {
      indent: bareMatch[1],
      checked: bareMatch[2].toLowerCase() === 'x',
      content: bareMatch[3] ?? '',
      explicit: true
    };
  }

  if (!forceTaskMode || !line.trim()) {
    return null;
  }

  const bulletMatch = BULLET_RE.exec(line);
  if (bulletMatch) {
    return {
      indent: bulletMatch[1],
      checked: false,
      content: bulletMatch[2],
      explicit: false
    };
  }

  const orderedMatch = ORDERED_RE.exec(line);
  if (orderedMatch) {
    return {
      indent: orderedMatch[1],
      checked: false,
      content: orderedMatch[2],
      explicit: false
    };
  }

  const plainMatch = PLAIN_TEXT_RE.exec(line);
  if (!plainMatch) {
    return null;
  }

  return {
    indent: plainMatch[1],
    checked: false,
    content: plainMatch[2].trim(),
    explicit: false
  };
}

export function toTaskMarkdownLine(line: string, checked: boolean, forceTaskMode = false): string {
  const parsed = parseTaskLine(line, forceTaskMode);
  if (!parsed) {
    return line;
  }
  if (parsed.explicit) {
    const markerPrefix = parsed.marker ? `${parsed.marker} ` : '';
    const contentSuffix = parsed.content ? ` ${parsed.content}` : '';
    return `${parsed.indent}${markerPrefix}[${checked ? 'x' : ' '}]${contentSuffix}`;
  }
  return `${parsed.indent}- [${checked ? 'x' : ' '}] ${parsed.content}`;
}

export function normalizeTaskModeLines(lines: string[]): string[] {
  return lines.map((line) => {
    const parsed = parseTaskLine(line, true);
    if (!parsed) {
      return line;
    }
    return toTaskMarkdownLine(line, parsed.checked, true);
  });
}
