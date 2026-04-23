'use client';

import { useEffect, useState } from 'react';
import { applyOps, type Op, type OpState } from '@bd/core';

type TabView = OpState['tabs'][number];

export default function SpacePage() {
  const [state, setState] = useState<OpState>({ tabs: [], archive: [] });
  const [lastSeq, setLastSeq] = useState(0);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'disconnected'>('connecting');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/v1/ops/pull?sinceSeq=0', { credentials: 'include' });
      if (!res.ok) return;
      const body = (await res.json()) as { ops: (Op & { seq: number })[] };
      if (cancelled) return;
      const next = applyOps({ tabs: [], archive: [] }, body.ops);
      setState(next);
      const top = body.ops[body.ops.length - 1];
      if (top) setLastSeq(top.seq);
      const first = next.tabs[0];
      if (first) setActiveTabId(first.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/v1/ops/stream', { withCredentials: true });
    es.addEventListener('ready', () => setLiveStatus('live'));
    es.addEventListener('ops', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data) as { ops: (Op & { seq: number })[] };
        setState((prev) => applyOps(prev, payload.ops));
        const top = payload.ops[payload.ops.length - 1];
        if (top?.seq) setLastSeq((s) => Math.max(s, top.seq));
      } catch {
        // ignore
      }
    });
    es.onerror = () => setLiveStatus('disconnected');
    return () => es.close();
  }, []);

  const activeTab: TabView | null = state.tabs.find((t) => t.id === activeTabId) ?? state.tabs[0] ?? null;

  return (
    <main style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid var(--hairline)', padding: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18 }}>Braindump</div>
        <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
          live: {liveStatus} · seq {lastSeq}
        </div>
        <div style={{ marginTop: 24 }}>
          {state.tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTabId(t.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                background: t.id === activeTab?.id ? 'var(--bg-2)' : 'transparent',
                color: t.id === activeTab?.id ? 'var(--fg-0)' : 'var(--fg-1)',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {t.name} <span style={{ color: 'var(--fg-2)' }}>({t.groups.length})</span>
            </button>
          ))}
          {state.tabs.length === 0 && (
            <div style={{ color: 'var(--fg-2)', fontSize: 13 }}>No tabs yet — push ops from the desktop client.</div>
          )}
        </div>
      </aside>
      <section style={{ padding: 32, overflowY: 'auto' }}>
        {activeTab ? (
          <>
            <h2 style={{ fontFamily: 'Fraunces, serif', marginBottom: 24 }}>{activeTab.name}</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {activeTab.groups.map((g) => (
                <div key={g.id} className="card">
                  {g.lines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                  <div style={{ fontSize: 10, color: 'var(--fg-2)', marginTop: 8 }}>
                    {new Date(g.updatedAt).toLocaleString()} {g.pinned && '· pinned'} {g.category && `· ${g.category}`}
                  </div>
                </div>
              ))}
              {activeTab.groups.length === 0 && <div style={{ color: 'var(--fg-2)' }}>No groups in this tab.</div>}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--fg-2)' }}>Nothing to show yet.</div>
        )}
      </section>
    </main>
  );
}
