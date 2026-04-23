import { useEffect, useMemo, useState } from 'react';
import { X, Sunrise, RefreshCcw } from 'lucide-react';
import { useStore } from '../store';
import { runDailyReportIfDue, todayKey } from '../lib/scheduler';
import type { DailyDigest } from '../types';

export function DailyReport() {
  const tabs = useStore((s) => s.tabs);
  const digests = useStore((s) => s.digests ?? []);
  const close = useStore((s) => s.setDailyReportOpen);
  const [selected, setSelected] = useState<string>(digests[0]?.date ?? todayKey());
  const [running, setRunning] = useState(false);

  const digest: DailyDigest | null = useMemo(() => digests.find((d) => d.date === selected) ?? null, [digests, selected]);
  const tabNameOf = (id: string) => tabs.find((t) => t.id === id)?.name ?? id;

  useEffect(() => {
    if (digests.length && !digests.find((d) => d.date === selected)) setSelected(digests[0].date);
  }, [digests, selected]);

  async function generateNow() {
    setRunning(true);
    try {
      await runDailyReportIfDue(true);
      const fresh = useStore.getState().digests ?? [];
      if (fresh[0]) setSelected(fresh[0].date);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-[var(--backdrop)] backdrop-blur-sm flex items-center justify-center p-6" onClick={() => close(false)}>
      <div
        className="bg-surface-1 border border-hairline rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Sunrise size={16} className="text-accent-400" />
            <span className="display text-[18px] text-fg-0">Morning report</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={generateNow}
              disabled={running}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1 disabled:opacity-50"
              title="Re-run for today"
            >
              <RefreshCcw size={12} className={running ? 'animate-spin' : ''} /> regenerate
            </button>
            <button onClick={() => close(false)} className="text-fg-2 hover:text-fg-0 p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-44 overflow-y-auto border-r border-hairline py-2">
            {digests.length === 0 && <div className="px-4 py-3 text-[11px] text-fg-3">No reports yet.</div>}
            {digests.map((d) => (
              <button
                key={d.date}
                onClick={() => setSelected(d.date)}
                className={
                  'w-full text-left px-4 py-2 text-[12px] ' +
                  (d.date === selected ? 'bg-surface-3 text-fg-0 border-l-2 border-accent-500' : 'text-fg-2 hover:bg-surface-2')
                }
              >
                {d.date}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {!digest && (
              <div className="text-fg-3 text-sm">No report yet. Click "regenerate" to produce one for today.</div>
            )}
            {digest && (
              <div className="space-y-5">
                <div className="display text-[22px] text-fg-0 leading-snug">{digest.headline}</div>

                {digest.byTab.length > 0 && (
                  <div className="space-y-3">
                    {digest.byTab.map((s) => (
                      <div key={s.tabId} className="border border-hairline rounded-lg bg-surface-2 p-3">
                        <div className="text-[11px] uppercase tracking-wider text-fg-3">{tabNameOf(s.tabId)}</div>
                        <div className="text-sm text-fg-0 mt-1">{s.summary}</div>
                        {s.highlights.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-[13px] text-fg-1 list-disc pl-5">
                            {s.highlights.map((h, i) => (
                              <li key={i}>{h}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {digest.carryForward.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-1">Carry forward</div>
                    <ul className="space-y-0.5 text-[13px] text-fg-1 list-disc pl-5">
                      {digest.carryForward.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {digest.stale.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-fg-3 mb-1">Getting stale</div>
                    <ul className="space-y-0.5 text-[13px] text-fg-1 list-disc pl-5">
                      {digest.stale.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
