import { useStore } from '../store';
import { X, RotateCcw } from 'lucide-react';

export function FormatHistory() {
  const id = useStore((s) => s.historyForGroupId);
  const close = useStore((s) => s.setHistoryForGroup);
  const tabs = useStore((s) => s.tabs);
  const revert = useStore((s) => s.revertToRevision);

  if (!id) return null;
  let tabId = '';
  let group = null;
  for (const t of tabs) {
    const g = t.groups.find((x) => x.id === id);
    if (g) {
      tabId = t.id;
      group = g;
      break;
    }
  }
  if (!group) {
    return (
      <Shell close={close}>
        <div className="text-ink-500 italic">Group no longer exists.</div>
      </Shell>
    );
  }
  return (
    <Shell close={close}>
      <div className="mb-3 text-sm text-ink-300">History for group · {group.history.length} revisions</div>
      <div className="space-y-2">
        {group.history
          .slice()
          .reverse()
          .map((r) => (
            <div key={r.id} className="bg-ink-850 border border-ink-800 rounded p-3">
              <div className="flex items-center justify-between text-[11px] text-ink-400 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-ink-800">{r.source}</span>
                  <span>{new Date(r.at).toLocaleString()}</span>
                  {r.model && <span className="text-ink-500">· {r.model}</span>}
                </div>
                <button
                  onClick={() => revert(tabId, group!.id, r.id)}
                  className="flex items-center gap-1 text-accent-400 hover:text-accent-300"
                  title="Revert group content to this snapshot"
                >
                  <RotateCcw size={11} /> Revert to this
                </button>
              </div>
              <div className="text-[13px] text-ink-200 space-y-0.5">
                {r.lines.map((l, i) => (
                  <div key={i} className="break-words">
                    {l}
                  </div>
                ))}
              </div>
              {r.diffSummary && <div className="mt-1 text-[11px] text-ink-500 italic">{r.diffSummary}</div>}
            </div>
          ))}
      </div>
    </Shell>
  );
}

function Shell({ children, close }: { children: React.ReactNode; close: (id: null) => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-8" onClick={() => close(null)}>
      <div
        className="bg-ink-900 border border-ink-800 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
          <div className="text-ink-100 font-medium">Revision history</div>
          <button onClick={() => close(null)} className="text-ink-400 hover:text-ink-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
