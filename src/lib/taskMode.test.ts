import { describe, expect, it } from 'vitest';
import { normalizeTaskModeLines, parseTaskLine, toTaskMarkdownLine } from './taskMode';

describe('parseTaskLine', () => {
  it('reads markdown task checkboxes', () => {
    expect(parseTaskLine('- [x] Ship it')).toEqual({
      indent: '',
      marker: '-',
      checked: true,
      content: 'Ship it',
      explicit: true
    });
  });

  it('accepts bare checkbox markdown without spaces inside the brackets', () => {
    expect(parseTaskLine('[] this is a todo')).toEqual({
      indent: '',
      checked: false,
      content: 'this is a todo',
      explicit: true
    });
  });

  it('treats plain lines as tasks when task mode is forced', () => {
    expect(parseTaskLine('Call the bank', true)).toEqual({
      indent: '',
      checked: false,
      content: 'Call the bank',
      explicit: false
    });
  });
});

describe('normalizeTaskModeLines', () => {
  it('converts bullets and plain lines into unchecked markdown tasks', () => {
    expect(normalizeTaskModeLines(['Call the bank', '* Buy milk', ''])).toEqual([
      '- [ ] Call the bank',
      '- [ ] Buy milk',
      ''
    ]);
  });

  it('preserves existing task completion state when normalizing', () => {
    expect(normalizeTaskModeLines(['- [x] Ship it'])).toEqual(['- [x] Ship it']);
    expect(toTaskMarkdownLine('- [x] Ship it', false, true)).toBe('- [ ] Ship it');
    expect(toTaskMarkdownLine('- [x] Ship it', true, true)).toBe('- [x] Ship it');
  });

  it('preserves the original checkbox markdown style when toggled', () => {
    expect(normalizeTaskModeLines(['+ [x] Ship it', '[] this is a todo'])).toEqual([
      '+ [x] Ship it',
      '[ ] this is a todo'
    ]);
    expect(toTaskMarkdownLine('[] this is a todo', true)).toBe('[x] this is a todo');
    expect(toTaskMarkdownLine('+ [x] Ship it', false)).toBe('+ [ ] Ship it');
  });
});
