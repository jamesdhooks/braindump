import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Save } from 'lucide-react';
import { useStore } from '../../store';

export function ProjectSettings() {
  const tabs = useStore((s) => s.tabs);
  const setProjectContext = useStore((s) => s.setProjectContext);
  const providers = useStore((s) => s.providers);
  const active = useStore((s) => s.activeProviderId);

  const [selectedId, setSelectedId] = useState<string>(tabs[0]?.id ?? '');
  const selected = useMemo(() => tabs.find((t) => t.id === selectedId) ?? null, [tabs, selectedId]);

  const [text, setText] = useState(selected?.projectContext ?? '');
  const [aliases, setAliases] = useState((selected?.aliases ?? []).join(', '));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(selected?.projectContext ?? '');
    setAliases((selected?.aliases ?? []).join(', '));
    setDirty(false);
  }, [selectedId, selected]);

  async function aiAssist() {
    if (!selected) return;
    setBusy(true);
    try {
      const recent = selected.groups.flatMap((g) => g.lines).slice(0, 200);
      const res = await window.braindump.skill.projectContext({
        tabName: selected.name,
        recentLines: recent
      });
      if (res.ok && res.value) {
        setText(res.value.summary);
        if (res.value.aliases?.length) setAliases(res.value.aliases.join(', '));
        setDirty(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!selected) return;
    const alArr = aliases
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    setProjectContext(selected.id, text.trim(), alArr);
    setDirty(false);
  }

  const hasProvider = providers.find((p) => p.id === active);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Project / tab</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full bg-surface-2 border border-hairline rounded px-3 py-2 text-fg-0"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Context (3–5 sentences)</label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setDirty(true);
          }}
          rows={7}
          placeholder="What is this project about? Audience, scope, constraints — whatever would help the assistant understand it without re-reading everything."
          className="w-full bg-surface-2 border border-hairline focus:border-accent-500 rounded px-3 py-2 text-fg-0 placeholder:text-fg-3 outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[11px] uppercase tracking-wider text-fg-3">Aliases (comma-separated)</label>
        <input
          type="text"
          value={aliases}
          onChange={(e) => {
            setAliases(e.target.value);
            setDirty(true);
          }}
          placeholder="e.g. billing, stripe, subscriptions"
          className="w-full bg-surface-2 border border-hairline focus:border-accent-500 rounded px-3 py-2 text-fg-0 placeholder:text-fg-3 outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={aiAssist}
          disabled={!hasProvider || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-3 hover:bg-surface-4 text-fg-0 text-sm disabled:opacity-50"
        >
          <Sparkles size={14} />
          {busy ? 'Drafting…' : 'AI-assist'}
        </button>
        <button
          onClick={save}
          disabled={!dirty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent-500 hover:bg-accent-600 text-white text-sm disabled:opacity-50"
        >
          <Save size={14} />
          Save
        </button>
        {!hasProvider && <span className="text-[11px] text-fg-3">Configure an LLM provider to use AI-assist.</span>}
      </div>

      <div className="text-[11px] text-fg-3">
        Context is prepended as a system message for auto-format, ramble, brainstorm, categorize, and Claw drafts scoped to this tab.
      </div>
    </div>
  );
}
