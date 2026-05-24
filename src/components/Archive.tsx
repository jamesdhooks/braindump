import { Archive as ArchiveIcon, ChevronDown, ChevronRight, Trash2, Undo2 } from 'lucide-react';
import { useStore } from '../store';

function groupByDay<T extends { completedAt: number }>(xs: T[]) {
  const out: Record<string, T[]> = {};
  for (const x of xs) {
    const d = new Date(x.completedAt).toLocaleDateString();
    (out[d] ||= []).push(x);
  }
  return out;
}

export function Archive({ tabId }: { tabId: string }) {
  const archive = useStore((s) => s.archive);
  const open = useStore((s) => s.ui.archiveOpen);
  const setOpen = useStore((s) => s.setArchiveOpen);
  const restore = useStore((s) => s.restoreFromArchive);
  const del = useStore((s) => s.deleteArchiveEntry);

  const scopedArchive = archive.filter((entry) => entry.tabId === tabId);
  const byDay = groupByDay(scopedArchive);

  return (
    <div className="border-t border-hairline bg-surface-1/95 backdrop-blur">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-6 py-2.5 text-left hover:bg-surface-2/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-fg-3">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-surface-2 text-fg-1">
            <ArchiveIcon size={13} />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-[0.14em] text-fg-2">Archive</span>
            <span className="block text-[11px] text-fg-3">Completed items tucked away for this project</span>
          </span>
        </span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-1">{scopedArchive.length}</span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-6 pb-3 space-y-3">
          {scopedArchive.length === 0 && <div className="text-fg-3 text-sm italic">Nothing archived for this project yet.</div>}
          {Object.entries(byDay).map(([day, entries]) => (
            <div key={day}>
              <div className="text-[10.5px] text-fg-3 mb-1">{day}</div>
              <div className="space-y-1.5">
                {entries.map((e) => {
                  const idx = archive.indexOf(e);
                  return (
                    <div
                      key={e.group.id + e.completedAt}
                      className="group flex items-start justify-between gap-2 rounded-lg border border-hairline bg-surface-2/45 hover:bg-surface-2 p-2.5"
                    >
                      <div className="flex-1 min-w-0 text-[13px] text-fg-1">
                        {e.group.lines.slice(0, 3).map((l, i) => (
                          <div key={i} className="truncate">
                            {l}
                          </div>
                        ))}
                        {e.group.lines.length > 3 && <div className="text-fg-3 text-[11px]">+{e.group.lines.length - 3} more</div>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => restore(idx)}
                          className="p-1 rounded hover:bg-surface-3 text-fg-2 hover:text-accent-400"
                          title="Restore"
                        >
                          <Undo2 size={13} />
                        </button>
                        <button
                          onClick={() => del(idx)}
                          className="p-1 rounded hover:bg-surface-3 text-fg-2 hover:text-red-400"
                          title="Delete permanently"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
