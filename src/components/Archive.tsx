import { ChevronDown, ChevronRight, Undo2, Trash2 } from 'lucide-react';
import { useStore } from '../store';

function groupByDay<T extends { completedAt: number }>(xs: T[]) {
  const out: Record<string, T[]> = {};
  for (const x of xs) {
    const d = new Date(x.completedAt).toLocaleDateString();
    (out[d] ||= []).push(x);
  }
  return out;
}

export function Archive() {
  const archive = useStore((s) => s.archive);
  const open = useStore((s) => s.ui.archiveOpen);
  const setOpen = useStore((s) => s.setArchiveOpen);
  const restore = useStore((s) => s.restoreFromArchive);
  const del = useStore((s) => s.deleteArchiveEntry);

  const byDay = groupByDay(archive);

  return (
    <div className="border-t border-ink-800 bg-ink-900">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-2 text-[11px] uppercase tracking-wider text-ink-400 hover:text-ink-100"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Archive
          <span className="text-ink-500 normal-case tracking-normal">({archive.length})</span>
        </span>
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-6 pb-3 space-y-3">
          {archive.length === 0 && <div className="text-ink-500 text-sm italic">Nothing archived yet.</div>}
          {Object.entries(byDay).map(([day, entries]) => (
            <div key={day}>
              <div className="text-[10.5px] text-ink-500 mb-1">{day}</div>
              <div className="space-y-1.5">
                {entries.map((e) => {
                  const idx = archive.indexOf(e);
                  return (
                    <div
                      key={e.group.id + e.completedAt}
                      className="group flex items-start justify-between gap-2 bg-ink-850 hover:bg-ink-800 rounded p-2 border border-ink-800"
                    >
                      <div className="flex-1 min-w-0 text-[13px] text-ink-300">
                        {e.group.lines.slice(0, 3).map((l, i) => (
                          <div key={i} className="truncate">
                            {l}
                          </div>
                        ))}
                        {e.group.lines.length > 3 && <div className="text-ink-500 text-[11px]">+{e.group.lines.length - 3} more</div>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => restore(idx)}
                          className="p-1 rounded hover:bg-ink-700 text-ink-300 hover:text-accent-400"
                          title="Restore"
                        >
                          <Undo2 size={13} />
                        </button>
                        <button
                          onClick={() => del(idx)}
                          className="p-1 rounded hover:bg-ink-700 text-ink-300 hover:text-red-400"
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
