import type { NoteGroup } from '../types';

export type GroupDisplayBucket = 'main' | 'completed' | 'qa';

export function groupPriorityRank(group: NoteGroup) {
  if (group.pinned) return -1;
  if (!group.completedAt) return 0;
  if (!group.qaAt) return 1;
  return 2;
}

export function advancePrioritySortAt(lastPrioritySortAt?: number, at = Date.now()) {
  return Math.max(lastPrioritySortAt ?? 0, at);
}

export function getGroupDisplayBucket(group: NoteGroup, lastPrioritySortAt?: number): GroupDisplayBucket {
  const sortedAt = lastPrioritySortAt ?? 0;
  if (!group.completedAt) return 'main';
  if (group.completedAt > sortedAt) return 'main';
  if (group.qaAt && group.qaAt <= sortedAt) return 'qa';
  return 'completed';
}
