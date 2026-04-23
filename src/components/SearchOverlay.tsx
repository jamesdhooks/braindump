import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Sparkles, Star, X, Pin, Copy, ArrowUpRight, RotateCcw } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useStore } from '../store';
import { hashLines } from '../lib/contentHash';
import type { SavedSearch } from '../types';

type Scope = 'all' | 'activeTab' | 'pinned' | 'archive' | 'brainstorms' | 'ocr';

type Hit = {
  kind: 'group' | 'archive' | 'brainstorm';
  tabId: string | null;
  groupId: string | null;
  brainstormId?: string;
  snippet: string;
  title?: string;
  lineIndices: number[];
  score: number;
  substr: number;
  fuzzy: number;
  semantic: number;
};

const SCOPE_LABELS: Record<Scope, string> = {
  all: 'All',
  activeTab: 'Active tab',
  pinned: 'Pinned',
  archive: 'Archive',
  brainstorms: 'Brainstorms',
  ocr: 'Attachments (OCR)'
};

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!t) return 0;
  let qi = 0;
  let streak = 0;
  let best = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak += 1;
      qi += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return 0;
  return Math.min(1, 0.5 + best / (q.length * 2));
}

function substrScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!t.includes(q)) return 0;
  const density = q.length / Math.max(t.length, q.length);
  return Math.min(1, 0.7 + density * 0.3);
}

function lineMatchesInGroup(query: string, lines: string[]): number[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(q)) out.push(i);
  });
  return out;
}

export function SearchOverlay() {
  const tabs = useStore((s) => s.tabs);
  const archive = useStore((s) => s.archive);
  const brainstorms = useStore((s) => s.brainstorms);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setOpen = useStore((s) => s.setSearchOpen);
  const setQuery = useStore((s) => s.setSearchQuery);
  const setFocused = useStore((s) => s.setFocusedGroup);
  const semanticOn = useStore((s) => s.ui.semanticSearchEnabled);
  const saved = useStore((s) => s.savedSearches ?? []);
  const addSaved = useStore((s) => s.addSavedSearch);
  const deleteSaved = useStore((s) => s.deleteSavedSearch);
  const restore = useStore((s) => s.restoreArchive);
  const togglePin = useStore((s) => s.togglePin);

  const [q, setQ] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['all']);
  const [selected, setSelected] = useState(0);
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticScores, setSemanticScores] = useState<Record<string, number>>({});
  const [semanticBusy, setSemanticBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function toggleScope(s: Scope) {
    setScopes((prev) => {
      if (s === 'all') return ['all'];
      const without = prev.filter((x) => x !== 'all' && x !== s);
      const withNew = prev.includes(s) ? without : [...without, s];
      return withNew.length ? withNew : ['all'];
    });
  }

  const scopedSet = useMemo(() => new Set(scopes), [scopes]);
  const includeAll = scopedSet.has('all');

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim();
    if (!query) return [];
    const out: Hit[] = [];

    for (const tab of tabs) {
      if (!includeAll && scopedSet.has('activeTab') && tab.id !== activeTabId) continue;
      if (!includeAll && !scopedSet.has('activeTab') && !scopedSet.has('pinned') && !scopedSet.has('ocr')) continue;
      for (const g of tab.groups) {
        if (!includeAll && scopedSet.has('pinned') && !g.pinned) continue;
        const joined = g.lines.join('\n');
        const substr = substrScore(query, joined);
        const fuzzy = fuzzyScore(query, joined);
        const ocr = (g.attachments ?? [])
          .map((a) => a.ocrText ?? '')
          .filter(Boolean)
          .join('\n');
        const substrOcr = includeAll || scopedSet.has('ocr') ? substrScore(query, ocr) : 0;
        const sem = semanticScores[g.id] ?? 0;
        const score = substr * 0.6 + fuzzy * 0.25 + sem * 0.15 + substrOcr * 0.3;
        if (score <= 0) continue;
        const matches = lineMatchesInGroup(query, g.lines);
        const snippetIdx = matches[0] ?? 0;
        const snippet = g.lines[snippetIdx] ?? g.lines[0] ?? '';
        out.push({
          kind: 'group',
          tabId: tab.id,
          groupId: g.id,
          snippet,
          lineIndices: matches,
          score,
          substr,
          fuzzy,
          semantic: sem
        });
      }
    }

    if (includeAll || scopedSet.has('archive')) {
      for (const a of archive) {
        const joined = a.group.lines.join('\n');
        const substr = substrScore(query, joined);
        const fuzzy = fuzzyScore(query, joined);
        const score = substr * 0.6 + fuzzy * 0.25;
        if (score <= 0) continue;
        out.push({
          kind: 'archive',
          tabId: a.tabId,
          groupId: a.group.id,
          snippet: a.group.lines[0] ?? '',
          lineIndices: lineMatchesInGroup(query, a.group.lines),
          score,
          substr,
          fuzzy,
          semantic: 0
        });
      }
    }

    if (includeAll || scopedSet.has('brainstorms')) {
      for (const b of brainstorms) {
        const joined = b.messages.map((m) => m.content).join('\n');
        const titleScore = substrScore(query, b.title);
        const substr = Math.max(titleScore, substrScore(query, joined));
        const fuzzy = fuzzyScore(query, joined);
        const score = substr * 0.6 + fuzzy * 0.25;
        if (score <= 0) continue;
        out.push({
          kind: 'brainstorm',
          tabId: null,
          groupId: null,
          brainstormId: b.id,
          title: b.title,
          snippet: b.messages[b.messages.length - 1]?.content ?? '',
          lineIndices: [],
          score,
          substr,
          fuzzy,
          semantic: 0
        });
      }
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [q, tabs, archive, brainstorms, activeTabId, scopedSet, includeAll, semanticScores]);

  useEffect(() => {
    setSelected(0);
  }, [q, scopes, semanticMode]);

  useEffect(() => {
    if (!semanticMode || !q.trim() || !semanticOn) return;
    let cancelled = false;
    setSemanticBusy(true);
    (async () => {
      const candidates: { id: string; hash: string; text: string }[] = [];
      for (const tab of tabs) for (const g of tab.groups) {
        candidates.push({ id: g.id, hash: hashLines(g.lines), text: g.lines.join('\n') });
      }
      try {
        await window.braindump.embeddings.ensure(
          candidates.map((c) => ({ id: c.id, text: c.text, hash: c.hash }))
        );
        const results = await window.braindump.embeddings.search(
          q,
          candidates.map((c) => ({ id: c.id, hash: c.hash }))
        );
        if (!cancelled) {
          const map: Record<string, number> = {};
          for (const r of results) map[r.id] = r.score;
          setSemanticScores(map);
        }
      } finally {
        if (!cancelled) setSemanticBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [semanticMode, q, semanticOn, tabs]);

  const current = hits[selected] ?? null;

  function jumpTo(h: Hit) {
    if (h.kind === 'group' && h.tabId && h.groupId) {
      setActiveTab(h.tabId);
      setFocused(h.groupId);
      useStore.getState().setHighlightedLines(h.groupId, h.lineIndices);
      setOpen(false);
    } else if (h.kind === 'archive') {
      useStore.getState().setArchiveOpen(true);
      setOpen(false);
    } else if (h.kind === 'brainstorm' && h.brainstormId) {
      useStore.getState().setBrainstormOpen(true);
      setOpen(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      if (semanticOn) setSemanticMode(true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current) jumpTo(current);
    } else if (e.key.toLowerCase() === 'p' && (e.ctrlKey || e.metaKey)) {
      // let Ctrl+P fall through; no-op
    }
  }

  function onGlobalKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!current) return;
    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && document.activeElement !== inputRef.current) {
      e.preventDefault();
      if (current.kind === 'group' && current.tabId && current.groupId) togglePin(current.tabId, current.groupId);
    }
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement !== inputRef.current) {
      if (current.kind === 'archive' && current.groupId) {
        restore(current.groupId);
      }
    }
    if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey && document.activeElement !== inputRef.current) {
      void navigator.clipboard.writeText(current.snippet);
    }
  }

  function saveCurrent() {
    if (!q.trim()) return;
    const ss: SavedSearch = {
      id: nanoid(8),
      label: q.trim(),
      query: q.trim(),
      scope: scopes,
      createdAt: Date.now()
    };
    addSaved(ss);
  }

  function loadSaved(ss: SavedSearch) {
    setQ(ss.query);
    setScopes(ss.scope);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--backdrop)] backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      onClick={() => setOpen(false)}
      onKeyDown={onGlobalKey}
    >
      <div
        className="bg-surface-1 border border-hairline rounded-xl w-full max-w-4xl h-[70vh] flex flex-col shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline">
          <Search size={16} className="text-fg-2" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search everywhere. Enter to jump · Shift+Enter for semantic · Esc to close"
            className="flex-1 bg-transparent text-fg-0 placeholder:text-fg-3 outline-none text-[15px]"
          />
          {semanticOn && (
            <button
              onClick={() => setSemanticMode((v) => !v)}
              className={
                'inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded ' +
                (semanticMode ? 'bg-accent-500 text-white' : 'bg-surface-3 text-fg-1 hover:text-fg-0')
              }
              title="Semantic blend (Shift+Enter)"
            >
              <Sparkles size={12} />
              {semanticBusy ? 'thinking…' : 'semantic'}
            </button>
          )}
          <button
            onClick={saveCurrent}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-surface-3 text-fg-1 hover:text-fg-0"
            title="Save this search"
          >
            <Star size={12} />
            save
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-hairline overflow-x-auto text-[11px]">
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => toggleScope(s)}
              className={
                'px-2 py-1 rounded ' +
                (scopedSet.has(s) ? 'bg-accent-500 text-white' : 'bg-surface-3 text-fg-1 hover:text-fg-0')
              }
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
          {saved.length > 0 && (
            <>
              <span className="mx-2 w-px h-4 bg-hairline" />
              {saved.slice(0, 6).map((ss) => (
                <div key={ss.id} className="group relative inline-flex items-center">
                  <button
                    onClick={() => loadSaved(ss)}
                    className="px-2 py-1 rounded bg-surface-2 text-fg-1 hover:text-fg-0"
                    title={`${ss.query} · ${ss.scope.join(', ')}`}
                  >
                    <Star size={10} className="inline mr-1" />
                    {ss.label}
                  </button>
                  <button
                    onClick={() => deleteSaved(ss.id)}
                    className="ml-0.5 opacity-0 group-hover:opacity-100 text-fg-3 hover:text-danger"
                    title="Remove saved search"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-3/5 overflow-y-auto border-r border-hairline">
            {hits.length === 0 && q.trim() && (
              <div className="px-4 py-10 text-center text-fg-3 text-sm">No matches.</div>
            )}
            {!q.trim() && (
              <div className="px-4 py-10 text-center text-fg-3 text-sm">
                Type to search · Tab to jump scopes · Saved searches above.
              </div>
            )}
            {hits.map((h, i) => {
              const tabName = h.tabId ? tabs.find((t) => t.id === h.tabId)?.name : null;
              return (
                <button
                  key={`${h.kind}:${h.groupId ?? h.brainstormId}:${i}`}
                  className={
                    'w-full text-left px-4 py-2.5 border-b border-hairline hover:bg-surface-2 flex flex-col gap-1 ' +
                    (i === selected ? 'bg-surface-3' : '')
                  }
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => jumpTo(h)}
                >
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-fg-3">
                    <span>{h.kind}</span>
                    {tabName && (
                      <>
                        <span>·</span>
                        <span>{tabName}</span>
                      </>
                    )}
                    {h.title && (
                      <>
                        <span>·</span>
                        <span>{h.title}</span>
                      </>
                    )}
                    <span className="ml-auto text-fg-3">{h.score.toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-fg-0 truncate">
                    <Highlight text={h.snippet} query={q} />
                  </div>
                </button>
              );
            })}
          </div>
          <div className="w-2/5 overflow-y-auto p-4">
            {current && current.kind === 'group' && current.tabId && current.groupId && (
              <GroupPreview tabId={current.tabId} groupId={current.groupId} query={q} onJump={() => jumpTo(current)} />
            )}
            {current && current.kind === 'archive' && current.groupId && (
              <ArchivePreview entryGroupId={current.groupId} query={q} />
            )}
            {current && current.kind === 'brainstorm' && current.brainstormId && (
              <BrainstormPreview id={current.brainstormId} query={q} />
            )}
            {!current && <div className="text-fg-3 text-sm">Preview appears here.</div>}
          </div>
        </div>

        <div className="px-4 py-1.5 border-t border-hairline text-[10.5px] text-fg-3 flex items-center gap-4">
          <span>↑↓ select</span>
          <span>Enter jump</span>
          <span>Shift+Enter semantic</span>
          <span>P pin</span>
          <span>C copy</span>
          <span>R restore</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const q = query.trim();
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, i)}</span>
      <mark className="bg-accent-500/30 text-fg-0 rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      <span>{text.slice(i + q.length)}</span>
    </>
  );
}

function GroupPreview({ tabId, groupId, query, onJump }: { tabId: string; groupId: string; query: string; onJump: () => void }) {
  const tab = useStore((s) => s.tabs.find((t) => t.id === tabId));
  const group = tab?.groups.find((g) => g.id === groupId);
  if (!group) return <div className="text-fg-3 text-sm">Preview unavailable.</div>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={onJump} className="text-[11px] text-accent-400 hover:underline inline-flex items-center gap-1">
          <ArrowUpRight size={12} /> open in tab
        </button>
        <button
          onClick={() => useStore.getState().togglePin(tabId, groupId)}
          className="text-[11px] text-fg-2 hover:text-fg-0 inline-flex items-center gap-1"
        >
          <Pin size={12} /> {group.pinned ? 'unpin' : 'pin'}
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(group.lines.join('\n'))}
          className="text-[11px] text-fg-2 hover:text-fg-0 inline-flex items-center gap-1"
        >
          <Copy size={12} /> copy
        </button>
      </div>
      <div className="space-y-1 text-sm text-fg-0">
        {group.lines.map((l, i) => (
          <div key={i} className="leading-relaxed">
            <Highlight text={l} query={query} />
          </div>
        ))}
      </div>
      {group.tags && group.tags.length > 0 && (
        <div className="flex gap-1.5 text-[11px] text-accent-400 pt-1">
          {group.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivePreview({ entryGroupId, query }: { entryGroupId: string; query: string }) {
  const entry = useStore((s) => s.archive.find((a) => a.group.id === entryGroupId));
  if (!entry) return <div className="text-fg-3 text-sm">Archived group not found.</div>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => useStore.getState().restoreArchive(entry.group.id)}
          className="text-[11px] text-accent-400 hover:underline inline-flex items-center gap-1"
        >
          <RotateCcw size={12} /> restore
        </button>
        <span className="text-[11px] text-fg-3">
          completed {new Date(entry.completedAt).toLocaleString()}
        </span>
      </div>
      <div className="space-y-1 text-sm text-fg-1">
        {entry.group.lines.map((l, i) => (
          <div key={i}>
            <Highlight text={l} query={query} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BrainstormPreview({ id, query }: { id: string; query: string }) {
  const b = useStore((s) => s.brainstorms.find((x) => x.id === id));
  if (!b) return <div className="text-fg-3 text-sm">Session missing.</div>;
  const last = b.messages.slice(-6);
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-fg-3">{b.title}</div>
      {last.map((m, i) => (
        <div key={i} className="text-sm text-fg-1">
          <span className="text-accent-400 mr-1">{m.role}:</span>
          <Highlight text={m.content} query={query} />
        </div>
      ))}
    </div>
  );
}
