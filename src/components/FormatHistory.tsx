import { useState } from 'react';
import { useStore } from '../store';
import { X, RotateCcw, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { Revision } from '../types';

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
        <div className="text-fg-3 italic">Group no longer exists.</div>
      </Shell>
    );
  }
  return (
    <Shell close={close}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-fg-1">History for group · {group.history.length} revisions</div>
        <button
          onClick={() => void window.braindump.app.openLlmLog()}
          className="flex items-center gap-1 text-[11px] text-fg-2 hover:text-fg-0"
          title="Open the global LLM log (llm-log.jsonl) in your default editor"
        >
          <FileText size={12} /> Open LLM log
        </button>
      </div>
      <div className="space-y-2">
        {group.history
          .slice()
          .reverse()
          .map((r) => (
            <RevisionRow
              key={r.id}
              rev={r}
              onRevert={() => revert(tabId, group!.id, r.id)}
            />
          ))}
      </div>
    </Shell>
  );
}

function RevisionRow({ rev, onRevert }: { rev: Revision; onRevert: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface-2 border border-hairline rounded p-3">
      <div className="flex items-center justify-between text-[11px] text-fg-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-surface-3">{rev.source}</span>
          <span>{new Date(rev.at).toLocaleString()}</span>
          {rev.model && <span className="text-fg-3">· {rev.model}</span>}
          {rev.exchange && (
            <span className="text-fg-3">
              · {rev.exchange.inputTokens}→{rev.exchange.outputTokens} tok · {rev.exchange.latencyMs}ms
            </span>
          )}
        </div>
        <button
          onClick={onRevert}
          className="flex items-center gap-1 text-accent-400 hover:text-accent-300"
          title="Revert group content to this snapshot"
        >
          <RotateCcw size={11} /> Revert to this
        </button>
      </div>
      <div className="text-[13px] text-fg-1 space-y-0.5">
        {rev.lines.map((l, i) => (
          <div key={i} className="break-words">
            {l}
          </div>
        ))}
      </div>
      {rev.diffSummary && <div className="mt-1 text-[11px] text-fg-3 italic">{rev.diffSummary}</div>}
      {rev.exchange && (
        <div className="mt-2 border-t border-hairline pt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-fg-2 hover:text-fg-0"
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            LLM exchange
          </button>
          {open && (
            <div className="mt-2 space-y-2 text-[11.5px]">
              {rev.exchange.messages.map((m, i) => (
                <div key={i} className="rounded bg-surface-0 border border-hairline p-2">
                  <div className="text-[10px] uppercase tracking-wide text-fg-3 mb-1">{m.role}</div>
                  <pre className="whitespace-pre-wrap break-words text-fg-1 font-mono text-[11.5px] leading-snug">
                    {m.content}
                  </pre>
                </div>
              ))}
              <div className="rounded bg-surface-0 border border-accent-500/30 p-2">
                <div className="text-[10px] uppercase tracking-wide text-accent-400 mb-1">response</div>
                <pre className="whitespace-pre-wrap break-words text-fg-1 font-mono text-[11.5px] leading-snug">
                  {rev.exchange.response}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Shell({ children, close }: { children: React.ReactNode; close: (id: null) => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-8" onClick={() => close(null)}>
      <div
        className="bg-surface-1 border border-hairline rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <div className="text-fg-0 font-medium">Revision history</div>
          <button onClick={() => close(null)} className="text-fg-2 hover:text-fg-0">
            <X size={16} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
