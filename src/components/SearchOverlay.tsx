import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { hashLines } from '../lib/contentHash';
import { activeProviderIdForFeature } from './Settings/util';

type Hit = {
  tabId: string;
  groupId: string;
  snippet: string;
  score?: number;
};

export function SearchOverlay() {
  const tabs = useStore((s) => s.tabs);
  const archive = useStore((s) => s.archive);
  const setOpen = useStore((s) => s.setSearchOpen);
  const setQuery = useStore((s) => s.setSearchQuery);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setFocused = useStore((s) => s.setFocusedGroup);
  const semanticOn = useStore((s) => s.ui.semanticSearchEnabled);
  const overrides = useStore((s) => s.featureProviderOverrides);
  const active = useStore((s) => s.activeProviderId);

  const [q, setQ] = useState('');
  const [semanticHits, setSemanticHits] = useState<Record<string, number>>({});
  const [semanticBusy, setSemanticBusy] = useState(false);

  const substrHits = useMemo<Hit[]>(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    const out: Hit[] = [];
    for (const t of tabs) {
      for (const g of t.groups) {
        const joined = g.lines.join('\n');
        const hayHit = joined.toLowerCase().includes(needle) ||
          g.attachments?.some((a) => a.ocrText?.toLowerCase().includes(needle));
        if (hayHit) {
          out.push({
            tabId: t.id,
            groupId: g.id,
            snippet: joined.slice(0, 200)
          });
        }
      }
    }
    for (const a of archive) {
      const joined = a.group.lines.join('\n');
      if (joined.toLowerCase().includes(needle)) {
        out.push({ tabId: a.tabId, groupId: a.group.id, snippet: '[archived] ' + joined.slice(0, 200) });
      }
    }
    return out;
  }, [q, tabs, archive]);

  useEffect(() => {
    setQuery(q);
  }, [q, setQuery]);

  async function runSemantic() {
    if (!q.trim()) return;
    setSemanticBusy(true);
    try {
      const candidates: { id: string; hash: string }[] = [];
      for (const t of tabs) {
        for (const g of t.groups) candidates.push({ id: g.id, hash: hashLines(g.lines) });
      }
      await window.braindump.embeddings.ensure(
        candidates.map((c) => {
          const g = tabs.flatMap((t) => t.groups).find((x) => x.id === c.id);
          return { id: c.id, hash: c.hash, text: g ? g.lines.join('\n') : '' };
        }),
        activeProviderIdForFeature('embeddings', overrides, active)
      );
      const res = await window.braindump.embeddings.search(
        q,
        candidates,
        activeProviderIdForFeature('embeddings', overrides, active)
      );
      const map: Record<string, number> = {};
      for (const r of res.slice(0, 50)) map[r.id] = r.score;
      setSemanticHits(map);
    } catch {
      setSemanticHits({});
    } finally {
      setSemanticBusy(false);
    }
  }

  const merged = useMemo<Hit[]>(() => {
    if (!semanticOn || Object.keys(semanticHits).length === 0) return substrHits.slice(0, 50);
    const extra: Hit[] = [];
    for (const t of tabs) {
      for (const g of t.groups) {
        if (!semanticHits[g.id]) continue;
        if (substrHits.find((h) => h.groupId === g.id)) continue;
        extra.push({ tabId: t.id, groupId: g.id, snippet: g.lines.join('\n').slice(0, 200), score: semanticHits[g.id] });
      }
    }
    extra.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return [...substrHits, ...extra].slice(0, 60);
  }, [substrHits, semanticHits, tabs, semanticOn]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-start justify-center pt-24 px-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-ink-850 border border-ink-700 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-800">
          <Search size={16} className="text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all tabs & archive…"
            className="flex-1 bg-transparent outline-none text-ink-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) void runSemantic();
              if (e.key === 'Enter' && !e.shiftKey && merged[0]) {
                setActiveTab(merged[0].tabId);
                setFocused(merged[0].groupId);
                setOpen(false);
              }
            }}
          />
          <button
            onClick={runSemantic}
            className="flex items-center gap-1 text-[11px] text-ink-300 hover:text-accent-400 px-2 py-1 rounded border border-ink-700"
            title="Semantic search (Shift+Enter)"
            disabled={semanticBusy}
          >
            <Sparkles size={11} /> Semantic {semanticBusy && '…'}
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {merged.length === 0 && q && (
            <div className="px-4 py-8 text-center text-ink-500 text-sm">No matches yet.</div>
          )}
          {merged.map((h) => {
            const t = tabs.find((x) => x.id === h.tabId);
            return (
              <button
                key={h.tabId + h.groupId}
                onClick={() => {
                  setActiveTab(h.tabId);
                  setFocused(h.groupId);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-ink-800 border-b border-ink-800 last:border-b-0"
              >
                <div className="flex items-center gap-2 text-[11px] text-ink-500">
                  <span>{t?.name ?? 'Archive'}</span>
                  {typeof h.score === 'number' && <span>sem {h.score.toFixed(2)}</span>}
                </div>
                <div className="text-[13px] text-ink-200 whitespace-pre-line line-clamp-3">{h.snippet}</div>
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 text-[11px] text-ink-500 border-t border-ink-800 flex justify-between">
          <span>Enter = jump · Shift+Enter = semantic · Esc = close</span>
          <span>{merged.length} results</span>
        </div>
      </div>
    </div>
  );
}
