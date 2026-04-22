import type { NoteGroup as NoteGroupT } from '../types';
import { NoteGroup } from './NoteGroup';
import { Pin } from 'lucide-react';

export function PinnedRail({ tabId, groups }: { tabId: string; groups: NoteGroupT[] }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-400 mb-1.5 pl-1">
        <Pin size={11} /> Pinned
      </div>
      <div className="space-y-2">
        {groups.map((g) => (
          <NoteGroup key={g.id} tabId={tabId} group={g} />
        ))}
      </div>
    </div>
  );
}
