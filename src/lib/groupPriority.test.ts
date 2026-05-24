import { describe, expect, it } from 'vitest';
import type { NoteGroup } from '../types';
import { advancePrioritySortAt, getGroupDisplayBucket } from './groupPriority';

function makeGroup(patch: Partial<NoteGroup>): NoteGroup {
  return {
    id: 'group-1',
    lines: ['test'],
    createdAt: 1,
    updatedAt: 1,
    pinned: false,
    history: [],
    formattedHashes: [],
    ...patch
  };
}

describe('advancePrioritySortAt', () => {
  it('moves the footer classification timestamp forward when auto-sort runs', () => {
    expect(advancePrioritySortAt(undefined, 25)).toBe(25);
    expect(advancePrioritySortAt(25, 40)).toBe(40);
    expect(advancePrioritySortAt(40, 12)).toBe(40);
  });
});

describe('getGroupDisplayBucket', () => {
  it('keeps freshly completed items in the main list until the tab timestamp catches up', () => {
    const group = makeGroup({ completedAt: 50, qaAt: null });

    expect(getGroupDisplayBucket(group, 40)).toBe('main');
    expect(getGroupDisplayBucket(group, 50)).toBe('completed');
  });

  it('moves QA-passed items into the QA footer once the tab timestamp catches up', () => {
    const group = makeGroup({ completedAt: 50, qaAt: 70 });

    expect(getGroupDisplayBucket(group, 60)).toBe('completed');
    expect(getGroupDisplayBucket(group, 70)).toBe('qa');
  });
});
