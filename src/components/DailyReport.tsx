import { useEffect, useMemo, useState } from 'react';
import { X, Sunrise, RefreshCcw, Bug, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useStore } from '../store';
import { runDailyReportForDate, runDailyReportIfDue, todayKey } from '../lib/scheduler';
import type { DailyDigest } from '../types';

type SkillLogEntry = Record<string, unknown>;

export function DailyReport() {
  const tabs = useStore((s) => s.tabs);
  const digests = useStore((s) => s.digests ?? []);
  const close = useStore((s) => s.setDailyReportOpen);
  const [selected, setSelected] = useState<string>(digests[0]?.date ?? todayKey());
  const showToast = useStore((s) => s.showToast);
  const [running, setRunning] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<SkillLogEntry[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [copiedEntry, setCopiedEntry] = useState<number | null>(null);

  function copyEntry(i: number, entry: SkillLogEntry) {
    const text = [
      `=== dailyReport skill log entry ${i + 1} ===`,
      `time:     ${entry.ts ? new Date(entry.ts as number).toLocaleString() : 'unknown'}`,
      `ok:       ${entry.ok}`,
      `model:    ${entry.model ?? 'none'}`,
      `provider: ${entry.provider ?? 'none'}`,
      `latency:  ${entry.latencyMs ?? 0}ms`,
      `tokens:   ${entry.inputTokens ?? 0} in / ${entry.outputTokens ?? 0} out`,
      ...(entry.error ? [`error:    ${entry.error}`] : []),
      ...(entry.rawPreview ? [`\n--- raw response ---\n${entry.rawPreview}`] : []),
      ...(entry.promptPreview ? [`\n--- prompt (user) ---\n${entry.promptPreview}`] : []),
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedEntry(i);
      setTimeout(() => setCopiedEntry(null), 1800);
    });
  }

  const digest: DailyDigest | null = useMemo(() => digests.find((d) => d.date === selected) ?? null, [digests, selected]);
  const tabNameOf = (id: string) => tabs.find((t) => t.id === id)?.name ?? id;

  useEffect(() => {
    if (digests.length && !digests.find((d) => d.date === selected)) setSelected(digests[0].date);
  }, [digests, selected]);

  useEffect(() => { setRegenerateError(null); }, [selected]);

  async function openDebug() {
    const next = !debugOpen;
    setDebugOpen(next);
    if (next) {
      setDebugLoading(true);
      try {
        const entries = await window.braindump.llm.readSkillLog('dailyReport', 20);
        setDebugLog(entries);
      } catch {
        setDebugLog([]);
      } finally {
        setDebugLoading(false);
      }
    }
  }

  async function generateNow() {
    setRunning(true);
    setRegenerateError(null);
    try {
      await runDailyReportForDate(selected, true);
      const fresh = useStore.getState().digests ?? [];
      const updated = fresh.find((d) => d.date === selected);
      if (updated) {
        setSelected(selected);
        showToast({ message: `Report for ${selected} regenerated`, kind: 'success' });
      } else {
        const msg = 'Skill ran but produced no output — check LLM provider settings.';
        setRegenerateError(msg);
        showToast({ message: 'Report generation failed', kind: 'error' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRegenerateError(msg);
      showToast({ message: 'Report generation failed', kind: 'error' });
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
              onClick={openDebug}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded text-fg-2 hover:text-fg-0 hover:bg-surface-3 transition-colors ${debugOpen ? 'bg-surface-3 text-fg-0' : ''}`}
              title="Show generation debug log"
            >
              <Bug size={12} /> debug
            </button>
            <button
              onClick={generateNow}
              disabled={running}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-surface-3 hover:bg-surface-4 text-fg-1 disabled:opacity-50"
              title="Re-run selected day"
            >
              <RefreshCcw size={12} className={running ? 'animate-spin' : ''} /> regenerate
            </button>
            <button onClick={() => close(false)} className="text-fg-2 hover:text-fg-0 p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {debugOpen && (
          <div className="border-b border-hairline bg-surface-0 max-h-72 overflow-y-auto">
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-fg-3 border-b border-hairline sticky top-0 bg-surface-0">
              LLM skill log — dailyReport (most recent first)
            </div>
            {debugLoading && <div className="px-4 py-3 text-[12px] text-fg-3">Loading…</div>}
            {!debugLoading && debugLog.length === 0 && (
              <div className="px-4 py-3 text-[12px] text-fg-3">No log entries found. Trigger a regenerate first.</div>
            )}
            {!debugLoading && debugLog.map((entry, i) => {
              const ok = Boolean(entry.ok);
              const ts = entry.ts ? new Date(entry.ts as number).toLocaleString() : '';
              const isOpen = expandedEntry === i;
              const latMs  = entry.latencyMs != null ? `${entry.latencyMs}ms` : '';
              const inTok  = entry.inputTokens  != null ? String(entry.inputTokens)  : '0';
              const outTok = entry.outputTokens != null ? String(entry.outputTokens) : '0';
              return (
                <div key={i} className={`border-b border-hairline last:border-0 ${ok ? '' : 'bg-red-500/5'}`}>
                  <button
                    className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-surface-2 transition-colors"
                    onClick={() => setExpandedEntry(isOpen ? null : i)}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[11px] text-fg-1 font-mono flex-1 truncate">
                      {ts} · {String(entry.model || 'no model')} · {latMs} · {inTok}→{outTok} tok
                    </span>
                    {!ok && <span className="text-[10px] text-red-400 truncate max-w-[200px]">{String(entry.error ?? '')}</span>}
                    <button
                      className="shrink-0 p-1 text-fg-3 hover:text-fg-1 transition-colors"
                      title="Copy entry to clipboard"
                      onClick={(e) => { e.stopPropagation(); copyEntry(i, entry); }}
                    >
                      {copiedEntry === i ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                    </button>
                    {isOpen ? <ChevronUp size={12} className="text-fg-3 shrink-0" /> : <ChevronDown size={12} className="text-fg-3 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 space-y-2">
                      {Boolean(entry.error) && (
                        <div>
                          <div className="text-[10px] uppercase text-red-400 mb-0.5">Error</div>
                          <pre className="text-[11px] text-red-300 whitespace-pre-wrap break-all font-mono bg-red-500/10 rounded p-2">{String(entry.error)}</pre>
                        </div>
                      )}
                      {Boolean(entry.rawPreview) && (
                        <div>
                          <div className="text-[10px] uppercase text-fg-3 mb-0.5">Raw LLM response (preview)</div>
                          <pre className="text-[11px] text-fg-1 whitespace-pre-wrap break-all font-mono bg-surface-2 rounded p-2 max-h-48 overflow-y-auto">{String(entry.rawPreview)}</pre>
                        </div>
                      )}
                      {Boolean(entry.promptPreview) && (
                        <div>
                          <div className="text-[10px] uppercase text-fg-3 mb-0.5">Prompt (user message preview)</div>
                          <pre className="text-[11px] text-fg-2 whitespace-pre-wrap break-all font-mono bg-surface-2 rounded p-2 max-h-24 overflow-y-auto">{String(entry.promptPreview)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
            {regenerateError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                <span className="font-medium">Regenerate failed: </span>{regenerateError}
              </div>
            )}
            {!digest && !regenerateError && (
              <div className="text-fg-3 text-sm">No report yet. Click "regenerate" to produce one for today.</div>
            )}
            {!digest && regenerateError && null}
            {digest && (
              <div className="space-y-5">
                <div className="display text-[22px] text-fg-0 leading-snug">{digest.headline}</div>

                {digest.overview && (
                  <div className="border border-hairline rounded-lg bg-surface-2 p-3">
                    <div className="text-[11px] uppercase tracking-wider text-fg-3">Overview</div>
                    <div className="mt-1 text-sm text-fg-0">{digest.overview.summary}</div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                      <div className="px-2 py-1 rounded bg-surface-3 text-fg-1">added {digest.overview.createdCount}</div>
                      <div className="px-2 py-1 rounded bg-surface-3 text-fg-1">completed {digest.overview.completedCount}</div>
                      <div className="px-2 py-1 rounded bg-surface-3 text-fg-1">qa'd {digest.overview.qaCount}</div>
                      <div className="px-2 py-1 rounded bg-surface-3 text-fg-1">archived {digest.overview.archivedCount}</div>
                    </div>
                  </div>
                )}

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
